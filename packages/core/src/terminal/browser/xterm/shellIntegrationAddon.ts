/**
 * Shell Integration Addon for XTerm
 * Deep shell integration (based on VSCode architecture)
 */

import { Terminal, ITerminalAddon, IDisposable } from '@xterm/xterm';

export interface IShellIntegration {
  readonly capabilities: IShellIntegrationCapabilities;
  readonly cwd: string | undefined;
  readonly lastCommand: string | undefined;
  readonly lastExitCode: number | undefined;
}

export interface IShellIntegrationCapabilities {
  readonly commandDetection: boolean;
  readonly cwdDetection: boolean;
  readonly promptDetection: boolean;
  readonly historyNavigation: boolean;
}

export interface ICommandDetection {
  readonly command: string;
  readonly timestamp: number;
  readonly cwd: string | undefined;
  readonly exitCode: number | undefined;
}

export interface IPromptDetection {
  readonly start: number;
  readonly end: number;
  readonly command: string | undefined;
}

export class ShellIntegrationAddon implements ITerminalAddon, IShellIntegration {
  private _terminal: Terminal | undefined;
  private _disposables: IDisposable[] = [];
  private _cwd: string | undefined;
  private _lastCommand: string | undefined;
  private _lastExitCode: number | undefined;
  private _commandHistory: ICommandDetection[] = [];
  private _currentPrompt: IPromptDetection | undefined;
  private _isCommandRunning = false;
  private _commandStartMarker: number | undefined;
  private _commandEndMarker: number | undefined;
  private _nonce: string;
  
  constructor() {
    this._nonce = Math.random().toString(36).substring(7);
  }
  
  get capabilities(): IShellIntegrationCapabilities {
    return {
      commandDetection: true,
      cwdDetection: true,
      promptDetection: true,
      historyNavigation: true
    };
  }
  
  get cwd(): string | undefined {
    return this._cwd;
  }
  
  get lastCommand(): string | undefined {
    return this._lastCommand;
  }
  
  get lastExitCode(): number | undefined {
    return this._lastExitCode;
  }
  
  get commandHistory(): ICommandDetection[] {
    return [...this._commandHistory];
  }
  
  activate(terminal: Terminal): void {
    this._terminal = terminal;
    this._setupSequenceHandlers();
    this._injectShellIntegration();
  }
  
  dispose(): void {
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables = [];
    this._terminal = undefined;
  }
  
  private _setupSequenceHandlers(): void {
    if (!this._terminal) {
      return;
    }
    
    const parser = (this._terminal as any).parser;
    if (!parser) {
      return;
    }
    
    this._disposables.push(
      parser.registerOscHandler(133, (data: string) => this._handlePromptSequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(633, (data: string) => this._handleVSCodeSequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(7, (data: string) => this._handleCwdSequence(data))
    );
    
    this._disposables.push(
      parser.registerOscHandler(1337, (data: string) => this._handleITermSequence(data))
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
  
  private _handleVSCodeSequence(data: string): boolean {
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
      case 'E':
        this._handleCommandLine(parts.slice(1).join(';'));
        break;
      case 'P':
        this._handleProperty(parts.slice(1).join(';'));
        break;
    }
    
    return true;
  }
  
  private _handleCwdSequence(data: string): boolean {
    if (data.startsWith('file://')) {
      const url = new URL(data);
      this._cwd = decodeURIComponent(url.pathname);
      this._onCwdChanged();
    }
    
    return true;
  }
  
  private _handleITermSequence(data: string): boolean {
    const parts = data.split('=');
    if (parts[0] === 'CurrentDir') {
      this._cwd = parts[1];
      this._onCwdChanged();
    } else if (parts[0] === 'ShellIntegrationVersion') {
      console.log('Shell integration version:', parts[1]);
    }
    
    return true;
  }
  
  private _handlePromptStart(): void {
    if (!this._terminal) {
      return;
    }
    
    const buffer = this._terminal.buffer.active;
    this._currentPrompt = {
      start: buffer.cursorY + buffer.baseY,
      end: -1,
      command: undefined
    };
  }
  
  private _handlePromptEnd(): void {
    if (!this._terminal || !this._currentPrompt) {
      return;
    }
    
    const buffer = this._terminal.buffer.active;
    this._currentPrompt.end = buffer.cursorY + buffer.baseY;
  }
  
  private _handleCommandStart(): void {
    if (!this._terminal) {
      return;
    }
    
    this._isCommandRunning = true;
    const buffer = this._terminal.buffer.active;
    this._commandStartMarker = buffer.cursorY + buffer.baseY;
    
    if (this._currentPrompt && this._currentPrompt.command) {
      this._lastCommand = this._currentPrompt.command;
    }
  }
  
  private _handleCommandEnd(exitCode?: number): void {
    if (!this._terminal) {
      return;
    }
    
    this._isCommandRunning = false;
    const buffer = this._terminal.buffer.active;
    this._commandEndMarker = buffer.cursorY + buffer.baseY;
    this._lastExitCode = exitCode;
    
    if (this._lastCommand) {
      this._commandHistory.push({
        command: this._lastCommand,
        timestamp: Date.now(),
        cwd: this._cwd,
        exitCode: exitCode
      });
      
      if (this._commandHistory.length > 1000) {
        this._commandHistory.shift();
      }
    }
    
    this._onCommandExecuted();
  }
  
  private _handleCommandLine(commandLine: string): void {
    this._lastCommand = commandLine;
    if (this._currentPrompt) {
      this._currentPrompt.command = commandLine;
    }
  }
  
  private _handleProperty(property: string): void {
    const parts = property.split('=');
    const key = parts[0];
    const value = parts.slice(1).join('=');
    
    switch (key) {
      case 'Cwd':
        this._cwd = value;
        this._onCwdChanged();
        break;
      case 'IsWindows':
        console.log('Running on Windows:', value === 'True');
        break;
      case 'ShellType':
        console.log('Shell type:', value);
        break;
    }
  }
  
  private _injectShellIntegration(): void {
    if (!this._terminal) {
      return;
    }
    
    const shellType = this._detectShellType();
    if (!shellType) {
      return;
    }
    
    let script = '';
    
    switch (shellType) {
      case 'bash':
        script = this._getBashIntegrationScript();
        break;
      case 'zsh':
        script = this._getZshIntegrationScript();
        break;
      case 'fish':
        script = this._getFishIntegrationScript();
        break;
      case 'pwsh':
        script = this._getPowerShellIntegrationScript();
        break;
    }
    
    if (script) {
      setTimeout(() => {
        if (this._terminal) {
          (this._terminal as any).paste(script + '\n');
        }
      }, 100);
    }
  }
  
  private _detectShellType(): string | undefined {
    if (!this._terminal) {
      return undefined;
    }
    
    const env = (this._terminal as any).env;
    if (!env) {
      return undefined;
    }
    
    const shell = env.SHELL || '';
    
    if (shell.includes('bash')) {
      return 'bash';
    } else if (shell.includes('zsh')) {
      return 'zsh';
    } else if (shell.includes('fish')) {
      return 'fish';
    } else if (shell.includes('pwsh') || shell.includes('powershell')) {
      return 'pwsh';
    }
    
    return undefined;
  }
  
  private _getBashIntegrationScript(): string {
    return `
__vscode_prompt_cmd() {
  local ret=$?
  printf "\\033]633;D;%s\\007" "$ret"
  printf "\\033]633;A\\007"
  return $ret
}

__vscode_preexec() {
  printf "\\033]633;C\\007"
  printf "\\033]633;E;%s\\007" "$1"
}

trap '__vscode_preexec "$BASH_COMMAND"' DEBUG
PROMPT_COMMAND="__vscode_prompt_cmd; \${PROMPT_COMMAND}"

printf "\\033]633;P;ShellType=bash\\007"
printf "\\033]633;P;Cwd=%s\\007" "$PWD"
`.trim();
  }
  
  private _getZshIntegrationScript(): string {
    return `
__vscode_precmd() {
  local ret=$?
  printf "\\033]633;D;%s\\007" "$ret"
  printf "\\033]633;A\\007"
  return $ret
}

__vscode_preexec() {
  printf "\\033]633;C\\007"
  printf "\\033]633;E;%s\\007" "$1"
}

precmd_functions+=(__vscode_precmd)
preexec_functions+=(__vscode_preexec)

printf "\\033]633;P;ShellType=zsh\\007"
printf "\\033]633;P;Cwd=%s\\007" "$PWD"
`.trim();
  }
  
  private _getFishIntegrationScript(): string {
    return `
function __vscode_prompt_cmd --on-event fish_prompt
  printf "\\033]633;D;%s\\007" $status
  printf "\\033]633;A\\007"
end

function __vscode_preexec --on-event fish_preexec
  printf "\\033]633;C\\007"
  printf "\\033]633;E;%s\\007" "$argv"
end

printf "\\033]633;P;ShellType=fish\\007"
printf "\\033]633;P;Cwd=%s\\007" $PWD
`.trim();
  }
  
  private _getPowerShellIntegrationScript(): string {
    return `
function Global:__VSCode-Prompt-Cmd {
  $LastExitCode = $?
  Write-Host -NoNewline ([char]27 + "]633;D;$LastExitCode" + [char]7)
  Write-Host -NoNewline ([char]27 + "]633;A" + [char]7)
}

function Global:__VSCode-PreExec {
  Write-Host -NoNewline ([char]27 + "]633;C" + [char]7)
}

$Global:__VSCodeOriginalPrompt = $function:prompt
function Global:prompt {
  __VSCode-Prompt-Cmd
  & $Global:__VSCodeOriginalPrompt
}

Write-Host -NoNewline ([char]27 + "]633;P;ShellType=pwsh" + [char]7)
Write-Host -NoNewline ([char]27 + "]633;P;Cwd=$PWD" + [char]7)
`.trim();
  }
  
  private _onCwdChanged(): void {
    if (this._terminal) {
      (this._terminal as any).emit('cwdChanged', this._cwd);
    }
  }
  
  private _onCommandExecuted(): void {
    if (this._terminal) {
      (this._terminal as any).emit('commandExecuted', {
        command: this._lastCommand,
        exitCode: this._lastExitCode,
        cwd: this._cwd
      });
    }
  }
  
  navigateToPreviousCommand(): void {
    const previousCommand = this._commandHistory[this._commandHistory.length - 2];
    if (previousCommand && this._terminal) {
      const buffer = this._terminal.buffer.active;
      const targetLine = this._findCommandLine(previousCommand.command);
      if (targetLine >= 0) {
        this._terminal.scrollToLine(targetLine);
      }
    }
  }
  
  navigateToNextCommand(): void {
    const currentIndex = this._getCurrentCommandIndex();
    if (currentIndex >= 0 && currentIndex < this._commandHistory.length - 1) {
      const nextCommand = this._commandHistory[currentIndex + 1];
      if (this._terminal) {
        const targetLine = this._findCommandLine(nextCommand.command);
        if (targetLine >= 0) {
          this._terminal.scrollToLine(targetLine);
        }
      }
    }
  }
  
  private _getCurrentCommandIndex(): number {
    if (!this._terminal || !this._lastCommand) {
      return -1;
    }
    
    for (let i = this._commandHistory.length - 1; i >= 0; i--) {
      if (this._commandHistory[i].command === this._lastCommand) {
        return i;
      }
    }
    
    return -1;
  }
  
  private _findCommandLine(command: string): number {
    if (!this._terminal) {
      return -1;
    }
    
    const buffer = this._terminal.buffer.active;
    const searchStart = Math.max(0, buffer.baseY + buffer.cursorY - 100);
    const searchEnd = buffer.baseY + buffer.cursorY;
    
    for (let i = searchEnd; i >= searchStart; i--) {
      const line = buffer.getLine(i - buffer.baseY);
      if (line && line.translateToString().includes(command)) {
        return i - buffer.baseY;
      }
    }
    
    return -1;
  }
}