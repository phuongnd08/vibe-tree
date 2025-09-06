import { Emitter, Event } from 'vscode-jsonrpc';
import { Terminal as XTerm } from '@xterm/xterm';
import {
  ITerminalInstance,
  IShellLaunchConfig,
  ITerminalDimensions,
  ITerminalProcessManager,
  ITerminalBackend,
  ITerminalConfigurationService
} from '../common/terminal';
import { XtermTerminal } from './xterm/xtermTerminal';
import { TerminalProcessManager } from './terminalProcessManager';

export class TerminalInstance implements ITerminalInstance {
  private _id: number;
  private _title: string;
  private _shellLaunchConfig: IShellLaunchConfig;
  private _xterm: XtermTerminal | undefined;
  private _processManager: ITerminalProcessManager | undefined;
  private _cols: number = 80;
  private _rows: number = 30;
  private _isDisposed: boolean = false;
  private _disposables: any[] = [];
  private _backend: ITerminalBackend | undefined;
  private _configService: ITerminalConfigurationService | undefined;
  private _container: HTMLElement | undefined;
  
  private readonly _onDisposed = new Emitter<void>();
  readonly onDisposed: Event<void> = this._onDisposed.event;
  
  private readonly _onTitleChanged = new Emitter<string>();
  readonly onTitleChanged: Event<string> = this._onTitleChanged.event;
  
  private readonly _onDimensionsChanged = new Emitter<void>();
  readonly onDimensionsChanged: Event<void> = this._onDimensionsChanged.event;
  
  private readonly _onFocused = new Emitter<void>();
  readonly onFocused: Event<void> = this._onFocused.event;
  
  private readonly _onProcessIdReady = new Emitter<void>();
  readonly onProcessIdReady: Event<void> = this._onProcessIdReady.event;
  
  private readonly _onLinksReady = new Emitter<void>();
  readonly onLinksReady: Event<void> = this._onLinksReady.event;
  
  private readonly _onRequestExtHostProcess = new Emitter<void>();
  readonly onRequestExtHostProcess: Event<void> = this._onRequestExtHostProcess.event;
  
  constructor(
    id: number,
    shellLaunchConfig: IShellLaunchConfig,
    backend?: ITerminalBackend,
    configService?: ITerminalConfigurationService
  ) {
    this._id = id;
    this._shellLaunchConfig = shellLaunchConfig;
    this._title = shellLaunchConfig.name || `Terminal ${id}`;
    this._backend = backend;
    this._configService = configService;
  }
  
  get id(): number {
    return this._id;
  }
  
  get cols(): number {
    return this._cols;
  }
  
  get rows(): number {
    return this._rows;
  }
  
  get title(): string {
    return this._title;
  }
  
  get processId(): number | undefined {
    return this._processManager?.processId;
  }
  
  get shellLaunchConfig(): IShellLaunchConfig {
    return this._shellLaunchConfig;
  }
  
  get xterm(): XTerm | undefined {
    return this._xterm?.raw;
  }
  
  async attachToElement(container: HTMLElement): Promise<void> {
    if (this._isDisposed) {
      return;
    }
    
    this._container = container;
    
    this._xterm = new XtermTerminal(this._configService);
    await this._xterm.attachToElement(container);
    
    this._processManager = new TerminalProcessManager(
      this._shellLaunchConfig,
      this._backend
    );
    
    this._setupXtermListeners();
    this._setupProcessListeners();
    
    await this._processManager.createProcess(
      this._shellLaunchConfig,
      this._cols,
      this._rows
    );
    
    this._xterm.focus();
  }
  
  private _setupXtermListeners(): void {
    if (!this._xterm) {
      return;
    }
    
    this._disposables.push(
      this._xterm.onData((data: string) => {
        this._processManager?.write(data);
      })
    );
    
    this._disposables.push(
      this._xterm.onResize((dimensions: ITerminalDimensions) => {
        this._cols = dimensions.cols;
        this._rows = dimensions.rows;
        this._processManager?.resize(dimensions.cols, dimensions.rows);
        this._onDimensionsChanged.fire();
      })
    );
    
    this._disposables.push(
      this._xterm.onFocus(() => {
        this._onFocused.fire();
      })
    );
    
    this._disposables.push(
      this._xterm.onTitleChange((title: string) => {
        this._title = title;
        this._onTitleChanged.fire(title);
      })
    );
  }
  
  private _setupProcessListeners(): void {
    if (!this._processManager) {
      return;
    }
    
    this._disposables.push(
      this._processManager.onProcessData((data: string) => {
        this._xterm?.write(data);
      })
    );
    
    this._disposables.push(
      this._processManager.onProcessExit((exitCode: number | undefined) => {
        if (this._shellLaunchConfig.waitOnExit) {
          const message = typeof this._shellLaunchConfig.waitOnExit === 'string'
            ? this._shellLaunchConfig.waitOnExit
            : `Process exited with code ${exitCode}. Press any key to close.`;
          this._xterm?.write(`\r\n${message}\r\n`);
        } else {
          this.dispose();
        }
      })
    );
    
    this._disposables.push(
      this._processManager.onProcessReady((event: { pid: number; cwd: string }) => {
        this._onProcessIdReady.fire();
      })
    );
    
    this._disposables.push(
      this._processManager.onProcessTitleChanged((title: string) => {
        if (!this._shellLaunchConfig.name) {
          this._title = title;
          this._onTitleChanged.fire(title);
        }
      })
    );
  }
  
  focus(force?: boolean): void {
    if (this._xterm) {
      this._xterm.focus();
    }
  }
  
  sendText(text: string, addNewLine: boolean = true): void {
    if (this._processManager) {
      const data = addNewLine ? `${text}\r` : text;
      this._processManager.write(data);
      
      if (this._xterm) {
        this._xterm.scrollToBottom();
      }
    }
  }
  
  async paste(): Promise<void> {
    if (!this._xterm) {
      return;
    }
    
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        this.sendText(text, false);
      }
    } catch (error) {
      console.error('Failed to paste:', error);
    }
  }
  
  clear(): void {
    if (this._xterm) {
      this._xterm.clear();
    }
  }
  
  clearBuffer(): void {
    if (this._xterm) {
      this._xterm.clearBuffer();
    }
  }
  
  kill(immediate?: boolean): void {
    if (this._processManager) {
      this._processManager.kill(immediate);
    }
  }
  
  resize(): void {
    if (this._xterm && this._container) {
      this._xterm.fit();
    }
  }
  
  setDimensions(dimensions: ITerminalDimensions): void {
    if (this._xterm) {
      this._cols = dimensions.cols;
      this._rows = dimensions.rows;
      this._xterm.resize(dimensions.cols, dimensions.rows);
      this._processManager?.resize(dimensions.cols, dimensions.rows);
      this._onDimensionsChanged.fire();
    }
  }
  
  addDisposable(disposable: any): void {
    this._disposables.push(disposable);
  }
  
  toggleEscapeSequenceLogging(): void {
    if (this._xterm) {
      this._xterm.toggleEscapeSequenceLogging();
    }
  }
  
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    
    this._isDisposed = true;
    
    this._disposables.forEach(d => {
      if (d && typeof d.dispose === 'function') {
        d.dispose();
      }
    });
    this._disposables = [];
    
    this._processManager?.dispose();
    this._xterm?.dispose();
    
    this._onDisposed.fire();
    
    this._onDisposed.dispose();
    this._onTitleChanged.dispose();
    this._onDimensionsChanged.dispose();
    this._onFocused.dispose();
    this._onProcessIdReady.dispose();
    this._onLinksReady.dispose();
    this._onRequestExtHostProcess.dispose();
  }
}