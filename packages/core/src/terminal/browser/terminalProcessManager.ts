import { Emitter, Event } from 'vscode-jsonrpc';
import {
  ITerminalProcessManager,
  IShellLaunchConfig,
  ITerminalBackend
} from '../common/terminal';

export class TerminalProcessManager implements ITerminalProcessManager {
  private _processId: number | undefined;
  private _shellLaunchConfig: IShellLaunchConfig;
  private _backend: ITerminalBackend | undefined;
  private _isDisposed: boolean = false;
  private _processReady: boolean = false;
  private _cols: number = 80;
  private _rows: number = 30;
  private _dataBuffer: string[] = [];
  private _isProcessing: boolean = false;
  
  private readonly _onProcessData = new Emitter<string>();
  readonly onProcessData: Event<string> = this._onProcessData.event;
  
  private readonly _onProcessExit = new Emitter<number | undefined>();
  readonly onProcessExit: Event<number | undefined> = this._onProcessExit.event;
  
  private readonly _onProcessReady = new Emitter<{ pid: number; cwd: string }>();
  readonly onProcessReady: Event<{ pid: number; cwd: string }> = this._onProcessReady.event;
  
  private readonly _onProcessTitleChanged = new Emitter<string>();
  readonly onProcessTitleChanged: Event<string> = this._onProcessTitleChanged.event;
  
  constructor(
    shellLaunchConfig: IShellLaunchConfig,
    backend?: ITerminalBackend
  ) {
    this._shellLaunchConfig = shellLaunchConfig;
    this._backend = backend;
  }
  
  get processId(): number | undefined {
    return this._processId;
  }
  
  get shellLaunchConfig(): IShellLaunchConfig {
    return this._shellLaunchConfig;
  }
  
  async createProcess(
    shellLaunchConfig: IShellLaunchConfig,
    cols: number,
    rows: number
  ): Promise<void> {
    if (this._isDisposed) {
      return;
    }
    
    this._cols = cols;
    this._rows = rows;
    this._shellLaunchConfig = shellLaunchConfig;
    
    try {
      if (this._backend) {
        const env = await this._getEnvironment();
        const cwd = shellLaunchConfig.cwd || process.cwd();
        
        this._processId = await this._backend.createProcess(
          shellLaunchConfig,
          cwd,
          cols,
          rows,
          env,
          true,
          !shellLaunchConfig.disablePersistence
        );
        
        this._processReady = true;
        this._onProcessReady.fire({ pid: this._processId, cwd });
        
        this._startDataListener();
      } else {
        this._simulateLocalProcess(shellLaunchConfig, cols, rows);
      }
    } catch (error) {
      console.error('Failed to create terminal process:', error);
      this._onProcessExit.fire(1);
    }
  }
  
  private async _getEnvironment(): Promise<{ [key: string]: string | null }> {
    const baseEnv = this._backend ? await this._backend.getShellEnvironment() : { ...process.env };
    const customEnv = this._shellLaunchConfig.env || {};
    
    if (this._shellLaunchConfig.strictEnv) {
      return customEnv;
    }
    
    const result: { [key: string]: string | null } = {};
    
    // Copy base environment
    for (const key in baseEnv) {
      const value = baseEnv[key];
      if (value !== undefined) {
        result[key] = value;
      }
    }
    
    // Override with custom environment
    for (const key in customEnv) {
      result[key] = customEnv[key];
    }
    
    return result;
  }
  
  private _simulateLocalProcess(
    shellLaunchConfig: IShellLaunchConfig,
    cols: number,
    rows: number
  ): void {
    this._processId = Math.floor(Math.random() * 100000);
    this._processReady = true;
    
    const cwd = shellLaunchConfig.cwd || process.cwd();
    this._onProcessReady.fire({ pid: this._processId, cwd });
    
    if (shellLaunchConfig.initialText) {
      setTimeout(() => {
        this._onProcessData.fire(shellLaunchConfig.initialText + '\r\n');
      }, 100);
    }
    
    const shellName = shellLaunchConfig.executable || 
                     (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash');
    const title = shellLaunchConfig.name || shellName;
    
    setTimeout(() => {
      this._onProcessTitleChanged.fire(title);
    }, 200);
    
    setTimeout(() => {
      this._onProcessData.fire(`Welcome to ${title}\r\n`);
      this._onProcessData.fire(`PID: ${this._processId}\r\n`);
      this._onProcessData.fire(`CWD: ${cwd}\r\n`);
      this._onProcessData.fire(`\r\n$ `);
    }, 300);
  }
  
  private _startDataListener(): void {
    if (!this._backend || !this._processId) {
      return;
    }
    
    const checkForData = () => {
      if (this._isDisposed || !this._processReady) {
        return;
      }
      
      this._processBufferedData();
      
      setTimeout(checkForData, 16);
    };
    
    checkForData();
  }
  
  private _processBufferedData(): void {
    if (this._isProcessing || this._dataBuffer.length === 0) {
      return;
    }
    
    this._isProcessing = true;
    
    while (this._dataBuffer.length > 0) {
      const data = this._dataBuffer.shift();
      if (data) {
        this._onProcessData.fire(data);
      }
    }
    
    this._isProcessing = false;
  }
  
  write(data: string): void {
    if (this._isDisposed || !this._processReady) {
      return;
    }
    
    if (this._backend && this._processId) {
    } else {
      this._handleLocalInput(data);
    }
  }
  
  private _handleLocalInput(data: string): void {
    this._onProcessData.fire(data);
    
    if (data === '\r' || data === '\n') {
      setTimeout(() => {
        this._onProcessData.fire('\r\n$ ');
      }, 10);
    }
    
    if (data === '\x03') {
      this._onProcessData.fire('^C\r\n$ ');
    }
    
    if (data === '\x04') {
      this.kill();
    }
  }
  
  resize(cols: number, rows: number): void {
    if (this._isDisposed || !this._processReady) {
      return;
    }
    
    this._cols = cols;
    this._rows = rows;
    
    if (this._backend && this._processId) {
    }
  }
  
  acknowledgeDataEvent(charCount: number): void {
  }
  
  kill(immediate?: boolean): void {
    if (this._isDisposed) {
      return;
    }
    
    if (this._backend && this._processId) {
    } else {
      this._onProcessData.fire('\r\nProcess terminated.\r\n');
      this._onProcessExit.fire(0);
    }
    
    this.dispose();
  }
  
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    
    this._isDisposed = true;
    this._processReady = false;
    
    this._onProcessData.dispose();
    this._onProcessExit.dispose();
    this._onProcessReady.dispose();
    this._onProcessTitleChanged.dispose();
  }
}