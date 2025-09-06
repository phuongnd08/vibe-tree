import { Terminal, ITerminalAddon, IDisposable } from '@xterm/xterm';
import { Emitter, Event } from 'vscode-jsonrpc';

export interface IShellIntegrationCapabilities {
  commandDetection: boolean;
  cwdDetection: boolean;
  promptDetection: boolean;
}

export interface ICommandDetection {
  command: string;
  timestamp: number;
  exitCode?: number;
  duration?: number;
  cwd?: string;
}

export interface IPromptDetection {
  prompt: string;
  timestamp: number;
  line: number;
}

export class ShellIntegrationAddon implements ITerminalAddon {
  private _terminal: Terminal | undefined;
  private _disposables: IDisposable[] = [];
  private _capabilities: IShellIntegrationCapabilities;
  private _currentCommand: string = '';
  private _commandStartTime: number = 0;
  private _currentCwd: string = '';
  private _promptLine: number = 0;
  private _isCommandRunning: boolean = false;
  
  private readonly _onCommandStart = new Emitter<ICommandDetection>();
  readonly onCommandStart: Event<ICommandDetection> = this._onCommandStart.event;
  
  private readonly _onCommandEnd = new Emitter<ICommandDetection>();
  readonly onCommandEnd: Event<ICommandDetection> = this._onCommandEnd.event;
  
  private readonly _onCwdChange = new Emitter<string>();
  readonly onCwdChange: Event<string> = this._onCwdChange.event;
  
  private readonly _onPromptStart = new Emitter<IPromptDetection>();
  readonly onPromptStart: Event<IPromptDetection> = this._onPromptStart.event;
  
  constructor() {
    this._capabilities = {
      commandDetection: false,
      cwdDetection: false,
      promptDetection: false
    };
    
    this._currentCwd = process.cwd ? process.cwd() : '/';
  }
  
  get capabilities(): IShellIntegrationCapabilities {
    return { ...this._capabilities };
  }
  
  get currentCwd(): string {
    return this._currentCwd;
  }
  
  get currentCommand(): string {
    return this._currentCommand;
  }
  
  activate(terminal: Terminal): void {
    this._terminal = terminal;
    this._setupSequenceHandlers();
    this._injectShellIntegration();
  }
  
  private _setupSequenceHandlers(): void {
    if (!this._terminal) {
      return;
    }
    
    const parser = this._terminal.parser;
    
    this._disposables.push(
      parser.registerOscHandler(133, data => this._handlePromptSequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(633, data => this._handleShellIntegrationSequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(1337, data => this._handleITerm2Sequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(7, data => this._handleCwdSequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(9, data => this._handleNotificationSequence(data))
    );
  }
  
  private _handlePromptSequence(data: string): boolean {
    const parts = data.split(';');
    const type = parts[0];
    
    switch (type) {
      case 'A':
        this._handlePromptStart();
        break;
      case 'B':
        this._handlePromptEnd();
        break;
      case 'C':
        this._handleCommandStart();
        break;
      case 'D':
        const exitCode = parts[1] ? parseInt(parts[1], 10) : undefined;
        this._handleCommandEnd(exitCode);
        break;
    }
    
    return true;
  }
  
  private _handleShellIntegrationSequence(data: string): boolean {
    const parts = data.split(';');
    const type = parts[0];
    const value = parts.slice(1).join(';');
    
    switch (type) {
      case 'A':
        this._handlePromptStart();
        break;
      case 'B':
        this._handlePromptEnd();
        break;
      case 'C':
        this._currentCommand = value || '';
        this._handleCommandStart();
        break;
      case 'D':
        const exitCode = value ? parseInt(value, 10) : undefined;
        this._handleCommandEnd(exitCode);
        break;
      case 'E':
        this._handleCommandLine(value);
        break;
      case 'P':
        this._handleProperty(value);
        break;
    }
    
    return true;
  }
  
  private _handleITerm2Sequence(data: string): boolean {
    const parts = data.split('=');
    const key = parts[0];
    const value = parts.slice(1).join('=');
    
    switch (key) {
      case 'CurrentDir':
        this._updateCwd(value);
        break;
      case 'ShellIntegrationVersion':
        this._capabilities.commandDetection = true;
        this._capabilities.cwdDetection = true;
        this._capabilities.promptDetection = true;
        break;
    }
    
    return true;
  }
  
  private _handleCwdSequence(data: string): boolean {
    if (data.startsWith('file://')) {
      const url = new URL(data);
      this._updateCwd(url.pathname);
    } else {
      this._updateCwd(data);
    }
    
    return true;
  }
  
  private _handleNotificationSequence(data: string): boolean {
    console.log('Terminal notification:', data);
    return true;
  }
  
  private _handlePromptStart(): void {
    if (!this._terminal) {
      return;
    }
    
    this._promptLine = this._terminal.buffer.active.cursorY;
    this._capabilities.promptDetection = true;
    
    this._onPromptStart.fire({
      prompt: '',
      timestamp: Date.now(),
      line: this._promptLine
    });
  }
  
  private _handlePromptEnd(): void {
    this._isCommandRunning = false;
  }
  
  private _handleCommandStart(): void {
    this._commandStartTime = Date.now();
    this._isCommandRunning = true;
    this._capabilities.commandDetection = true;
    
    this._onCommandStart.fire({
      command: this._currentCommand,
      timestamp: this._commandStartTime,
      cwd: this._currentCwd
    });
  }
  
  private _handleCommandEnd(exitCode?: number): void {
    const endTime = Date.now();
    const duration = this._commandStartTime ? endTime - this._commandStartTime : undefined;
    
    this._isCommandRunning = false;
    
    this._onCommandEnd.fire({
      command: this._currentCommand,
      timestamp: endTime,
      exitCode,
      duration,
      cwd: this._currentCwd
    });
    
    this._currentCommand = '';
    this._commandStartTime = 0;
  }
  
  private _handleCommandLine(commandLine: string): void {
    this._currentCommand = commandLine;
  }
  
  private _handleProperty(property: string): void {
    const [key, value] = property.split('=');
    
    switch (key) {
      case 'Cwd':
        this._updateCwd(value);
        break;
      case 'IsWindows':
        break;
    }
  }
  
  private _updateCwd(cwd: string): void {
    const normalizedCwd = this._normalizePath(cwd);
    
    if (normalizedCwd !== this._currentCwd) {
      this._currentCwd = normalizedCwd;
      this._capabilities.cwdDetection = true;
      this._onCwdChange.fire(this._currentCwd);
    }
  }
  
  private _normalizePath(path: string): string {
    path = path.trim();
    
    if (process.platform === 'win32') {
      path = path.replace(/\//g, '\\');
    }
    
    if (path.endsWith('/') || path.endsWith('\\')) {
      path = path.slice(0, -1);
    }
    
    return path;
  }
  
  private _injectShellIntegration(): void {
    const shell = process.env.SHELL || '';
    
    if (shell.includes('bash')) {
      this._injectBashIntegration();
    } else if (shell.includes('zsh')) {
      this._injectZshIntegration();
    } else if (shell.includes('fish')) {
      this._injectFishIntegration();
    } else if (process.platform === 'win32') {
      this._injectPowerShellIntegration();
    }
  }
  
  private _injectBashIntegration(): void {
    const script = `
      __vscode_prompt_cmd_original() {
        printf "\\033]633;D;$?\\007"
        printf "\\033]633;A\\007"
      }
      
      __vscode_prompt_cmd() {
        local status=$?
        __vscode_prompt_cmd_original
        printf "\\033]633;P;Cwd=%s\\007" "$PWD"
        return $status
      }
      
      if [[ -n "\${PROMPT_COMMAND}" ]]; then
        PROMPT_COMMAND="__vscode_prompt_cmd;\${PROMPT_COMMAND}"
      else
        PROMPT_COMMAND="__vscode_prompt_cmd"
      fi
      
      __vscode_preexec() {
        printf "\\033]633;C;%s\\007" "$1"
      }
      
      trap '__vscode_preexec "$BASH_COMMAND"' DEBUG
    `;
    
    this._executeInShell(script);
  }
  
  private _injectZshIntegration(): void {
    const script = `
      __vscode_precmd() {
        local ret=$?
        printf "\\033]633;D;%s\\007" "$ret"
        printf "\\033]633;A\\007"
        printf "\\033]633;P;Cwd=%s\\007" "$PWD"
      }
      
      __vscode_preexec() {
        printf "\\033]633;C;%s\\007" "$1"
      }
      
      precmd_functions+=(__vscode_precmd)
      preexec_functions+=(__vscode_preexec)
    `;
    
    this._executeInShell(script);
  }
  
  private _injectFishIntegration(): void {
    const script = `
      function __vscode_prompt_cmd --on-event fish_prompt
        printf "\\033]633;A\\007"
        printf "\\033]633;P;Cwd=%s\\007" "$PWD"
      end
      
      function __vscode_preexec --on-event fish_preexec
        printf "\\033]633;C;%s\\007" "$argv[1]"
      end
      
      function __vscode_postexec --on-event fish_postexec
        printf "\\033]633;D;%s\\007" "$status"
      end
    `;
    
    this._executeInShell(script);
  }
  
  private _injectPowerShellIntegration(): void {
    const script = `
      function Global:__VSCode-Prompt-Command {
        $LastExitCode = $?
        Write-Host -NoNewline ([char]27 + "]633;D;$LastExitCode" + [char]7)
        Write-Host -NoNewline ([char]27 + "]633;A" + [char]7)
        Write-Host -NoNewline ([char]27 + "]633;P;Cwd=$($PWD.Path)" + [char]7)
      }
      
      function Global:__VSCode-PreExec {
        param($Command)
        Write-Host -NoNewline ([char]27 + "]633;C;$Command" + [char]7)
      }
      
      $Global:__VSCodeOriginalPrompt = $function:prompt
      
      function Global:prompt {
        __VSCode-Prompt-Command
        & $Global:__VSCodeOriginalPrompt
      }
    `;
    
    this._executeInShell(script);
  }
  
  private _executeInShell(script: string): void {
    if (this._terminal) {
      this._terminal.paste(script + '\n');
    }
  }
  
  dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
    
    this._onCommandStart.dispose();
    this._onCommandEnd.dispose();
    this._onCwdChange.dispose();
    this._onPromptStart.dispose();
  }
}