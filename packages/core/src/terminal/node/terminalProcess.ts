/**
 * Terminal Process Implementation
 * Individual terminal process handling (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import { IPtyProcessOptions } from './ptyService';

export interface ITerminalProcessOptions extends IPtyProcessOptions {
  conpty?: boolean;
  useConpty?: boolean;
  useConptyDll?: boolean;
}

export class TerminalProcess extends EventEmitter {
  private _ptyProcess: pty.IPty | undefined;
  private _pid: number | undefined;
  private _cwd: string;
  private _title: string;
  private _shellType: ShellType | undefined;
  private _exitCode: number | undefined;
  private _isDisposed = false;
  private _environment: Record<string, string>;
  private _childProcessMonitor: NodeJS.Timeout | undefined;
  private _childProcesses: Set<number> = new Set();
  
  constructor(
    private readonly id: number,
    private readonly options: ITerminalProcessOptions
  ) {
    super();
    this._cwd = options.cwd || process.cwd();
    this._title = options.name || 'Terminal';
    this._environment = { ...process.env, ...options.env };
  }
  
  get pid(): number | undefined {
    return this._pid;
  }
  
  get cwd(): string {
    return this._cwd;
  }
  
  get title(): string {
    return this._title;
  }
  
  get shellType(): ShellType | undefined {
    return this._shellType;
  }
  
  get hasChildProcesses(): boolean {
    return this._childProcesses.size > 0;
  }
  
  onData(listener: (data: string) => void): void {
    this.on('data', listener);
  }
  
  onReady(listener: (event: { pid: number; cwd: string }) => void): void {
    this.on('ready', listener);
  }
  
  onExit(listener: (event: { exitCode: number | undefined }) => void): void {
    this.on('exit', listener);
  }
  
  onTitleChanged(listener: (title: string) => void): void {
    this.on('titleChanged', listener);
  }
  
  onCwdChanged(listener: (cwd: string) => void): void {
    this.on('cwdChanged', listener);
  }
  
  async start(): Promise<void> {
    if (this._ptyProcess) {
      return;
    }
    
    const shellPath = this._getShellPath();
    const shellArgs = this._getShellArgs();
    
    this._shellType = this._detectShellType(shellPath);
    
    const env = this._prepareEnvironment();
    
    try {
      const ptyOptions: pty.IPtyForkOptions = {
        name: this.options.name || 'xterm-256color',
        cols: this.options.cols || 80,
        rows: this.options.rows || 30,
        cwd: this._cwd,
        env: env as any,
        handleFlowControl: this.options.flowControl !== false
      };
      
      if (process.platform === 'win32' && this.options.useConpty !== false) {
        (ptyOptions as any).useConpty = true;
        if (this.options.conpty) {
          (ptyOptions as any).conptyInheritCursor = true;
        }
      }
      
      this._ptyProcess = pty.spawn(shellPath, shellArgs, ptyOptions);
      this._pid = this._ptyProcess.pid;
      
      this._setupEventHandlers();
      this._startChildProcessMonitoring();
      
      process.nextTick(() => {
        this.emit('ready', { pid: this._pid!, cwd: this._cwd });
      });
      
      if (this._shellType && this.options.initialText) {
        this._injectShellIntegration();
      }
    } catch (error: any) {
      console.error('Failed to start terminal process:', error);
      this.emit('exit', { exitCode: -1 });
      throw error;
    }
  }
  
  private _getShellPath(): string {
    if (this.options.shellPath) {
      return this.options.shellPath;
    }
    
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    
    return process.env.SHELL || '/bin/sh';
  }
  
  private _getShellArgs(): string[] {
    if (this.options.shellArgs) {
      if (typeof this.options.shellArgs === 'string') {
        return this.options.shellArgs.split(' ');
      }
      return this.options.shellArgs;
    }
    
    return [];
  }
  
  private _detectShellType(shellPath: string): ShellType | undefined {
    const shellName = path.basename(shellPath).toLowerCase();
    
    if (shellName.includes('bash')) {
      return ShellType.Bash;
    } else if (shellName.includes('zsh')) {
      return ShellType.Zsh;
    } else if (shellName.includes('fish')) {
      return ShellType.Fish;
    } else if (shellName.includes('pwsh') || shellName.includes('powershell')) {
      return ShellType.PowerShell;
    } else if (shellName === 'cmd.exe' || shellName === 'cmd') {
      return ShellType.Cmd;
    } else if (shellName.includes('sh')) {
      return ShellType.Sh;
    }
    
    return undefined;
  }
  
  private _prepareEnvironment(): Record<string, string> {
    const env = { ...this._environment };
    
    env['TERM'] = this.options.name || 'xterm-256color';
    env['TERM_PROGRAM'] = 'vscode';
    env['TERM_PROGRAM_VERSION'] = '1.0.0';
    
    if (process.platform === 'darwin') {
      env['LANG'] = env['LANG'] || 'en_US.UTF-8';
    }
    
    if (this._shellType === ShellType.Bash || this._shellType === ShellType.Zsh) {
      env['COLORTERM'] = 'truecolor';
    }
    
    return env;
  }
  
  private _setupEventHandlers(): void {
    if (!this._ptyProcess) {
      return;
    }
    
    this._ptyProcess.onData((data: string) => {
      this.emit('data', data);
      this._parseOutput(data);
    });
    
    this._ptyProcess.onExit((exitCode: number) => {
      this._exitCode = exitCode;
      this._cleanup();
      this.emit('exit', { exitCode });
    });
  }
  
  private _parseOutput(data: string): void {
    const titleMatch = data.match(/\x1b\]0;([^\x07\x1b]+)\x07/);
    if (titleMatch && titleMatch[1] !== this._title) {
      this._title = titleMatch[1];
      this.emit('titleChanged', this._title);
    }
    
    const cwdMatch = data.match(/\x1b\]7;file:\/\/[^\/]*([^\x07\x1b]+)\x07/);
    if (cwdMatch) {
      const newCwd = decodeURIComponent(cwdMatch[1]);
      if (newCwd !== this._cwd) {
        this._cwd = newCwd;
        this.emit('cwdChanged', this._cwd);
      }
    }
  }
  
  private _injectShellIntegration(): void {
    if (!this._ptyProcess || !this._shellType) {
      return;
    }
    
    let integrationScript = '';
    
    switch (this._shellType) {
      case ShellType.Bash:
      case ShellType.Sh:
        integrationScript = this._getBashIntegration();
        break;
      case ShellType.Zsh:
        integrationScript = this._getZshIntegration();
        break;
      case ShellType.Fish:
        integrationScript = this._getFishIntegration();
        break;
      case ShellType.PowerShell:
        integrationScript = this._getPowerShellIntegration();
        break;
    }
    
    if (integrationScript) {
      setTimeout(() => {
        this.write(integrationScript + '\n');
      }, 100);
    }
  }
  
  private _getBashIntegration(): string {
    return `
__vscode_prompt_cmd() {
  printf "\\033]0;%s@%s:%s\\007" "\\${USER}" "\\${HOSTNAME%%.*}" "\\${PWD/#$HOME/\\~}"
  printf "\\033]7;file://%s%s\\033\\\\" "\\${HOSTNAME}" "\\${PWD}"
}
PROMPT_COMMAND="__vscode_prompt_cmd; \\${PROMPT_COMMAND}"
`.trim();
  }
  
  private _getZshIntegration(): string {
    return `
__vscode_precmd() {
  print -Pn "\\e]0;%n@%m:%~\\a"
  print -Pn "\\e]7;file://%M%/\\e\\\\"
}
precmd_functions+=(__vscode_precmd)
`.trim();
  }
  
  private _getFishIntegration(): string {
    return `
function __vscode_fish_prompt --on-event fish_prompt
  printf "\\033]0;%s@%s:%s\\007" $USER (hostname -s) (prompt_pwd)
  printf "\\033]7;file://%s%s\\033\\\\" (hostname) $PWD
end
`.trim();
  }
  
  private _getPowerShellIntegration(): string {
    return `
function prompt {
  $p = $executionContext.SessionState.Path.CurrentLocation
  $osc = ""
  $osc += ([char]27) + "]0;" + $env:USERNAME + "@" + $env:COMPUTERNAME + ":" + $p + ([char]7)
  $osc += ([char]27) + "]7;file://" + $env:COMPUTERNAME + $p + ([char]27) + "\\\\"
  Write-Host -NoNewline $osc
  return "> "
}
`.trim();
  }
  
  private _startChildProcessMonitoring(): void {
    if (process.platform === 'win32' || !this._pid) {
      return;
    }
    
    this._childProcessMonitor = setInterval(() => {
      this._updateChildProcesses();
    }, 2000);
  }
  
  private _updateChildProcesses(): void {
    if (!this._pid) {
      return;
    }
    
    try {
      const { execSync } = require('child_process');
      const output = execSync(`pgrep -P ${this._pid}`, { encoding: 'utf8' });
      const pids = output.trim().split('\n').map(Number).filter(Boolean);
      
      this._childProcesses.clear();
      for (const pid of pids) {
        this._childProcesses.add(pid);
      }
    } catch {
      this._childProcesses.clear();
    }
  }
  
  private _cleanup(): void {
    if (this._childProcessMonitor) {
      clearInterval(this._childProcessMonitor);
      this._childProcessMonitor = undefined;
    }
    
    this._childProcesses.clear();
    this._ptyProcess = undefined;
    this._isDisposed = true;
  }
  
  write(data: string): void {
    if (!this._ptyProcess || this._isDisposed) {
      return;
    }
    
    this._ptyProcess.write(data);
  }
  
  resize(cols: number, rows: number): void {
    if (!this._ptyProcess || this._isDisposed) {
      return;
    }
    
    try {
      this._ptyProcess.resize(cols, rows);
    } catch (error) {
      console.error('Failed to resize terminal:', error);
    }
  }
  
  getEnvironment(): Record<string, string> {
    return { ...this._environment };
  }
  
  setEnvironment(env: Record<string, string>): void {
    this._environment = { ...this._environment, ...env };
  }
  
  async shutdown(immediate = false): Promise<void> {
    if (this._isDisposed) {
      return;
    }
    
    if (this._ptyProcess) {
      if (immediate || process.platform === 'win32') {
        this._ptyProcess.kill();
      } else {
        this._ptyProcess.kill('SIGTERM');
        
        setTimeout(() => {
          if (this._ptyProcess) {
            this._ptyProcess.kill('SIGKILL');
          }
        }, 2000);
      }
    }
    
    this._cleanup();
  }
}

export enum ShellType {
  Bash = 'bash',
  Zsh = 'zsh',
  Fish = 'fish',
  PowerShell = 'powershell',
  Cmd = 'cmd',
  Sh = 'sh'
}