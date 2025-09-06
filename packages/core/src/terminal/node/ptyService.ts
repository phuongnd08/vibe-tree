/**
 * PTY Service Implementation
 * PTY process management (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import { TerminalProcess } from './terminalProcess';
import { IProcessDataEvent, IProcessReadyEvent, IProcessExitEvent } from '../common/terminal';

export interface IPtyService {
  readonly onProcessData: (listener: (event: IProcessDataEvent) => void) => void;
  readonly onProcessReady: (listener: (event: IProcessReadyEvent) => void) => void;
  readonly onProcessExit: (listener: (event: IProcessExitEvent) => void) => void;
  readonly onProcessTitleChanged: (listener: (event: { id: number; title: string }) => void) => void;
  readonly onProcessCwdChanged: (listener: (event: { id: number; cwd: string }) => void) => void;
  
  createProcess(shellLaunchConfig: IPtyProcessOptions): Promise<number>;
  attachToProcess(id: number): Promise<void>;
  detachFromProcess(id: number): Promise<void>;
  listProcesses(): Promise<IPersistentTerminalProcess[]>;
  terminateProcess(id: number): Promise<void>;
  resizeProcess(id: number, cols: number, rows: number): Promise<void>;
  writeProcessData(id: number, data: string): Promise<void>;
  orphanProcess(id: number): Promise<void>;
  getProcessEnvironment(id: number): Promise<Record<string, string>>;
  setProcessEnvironment(id: number, env: Record<string, string>): Promise<void>;
  shutdown(): void;
}

export interface IPtyProcessOptions {
  shellPath?: string;
  shellArgs?: string | string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
  executable?: string;
  persistentProcessId?: number;
  shouldPersist?: boolean;
  isOrphan?: boolean;
  icon?: string;
  color?: string;
  initialText?: string;
  waitOnExit?: boolean | string;
  ignoreConfigurationCwd?: boolean;
  flowControl?: boolean;
}

export interface IPersistentTerminalProcess {
  id: number;
  pid: number | undefined;
  title: string;
  titleSource: 'process' | 'sequence' | 'api';
  icon?: string;
  color?: string;
  cwd: string;
  isOrphan: boolean;
  hasChildProcesses: boolean;
  shellLaunchConfig: IPtyProcessOptions;
}

interface IBufferedData {
  id: number;
  data: string[];
  size: number;
}

export class PtyService extends EventEmitter implements IPtyService {
  private _processes = new Map<number, TerminalProcess>();
  private _persistentProcesses = new Map<number, IPersistentTerminalProcess>();
  private _nextProcessId = 1;
  private _dataBuffer = new Map<number, IBufferedData>();
  private _bufferFlushInterval: NodeJS.Timeout | undefined;
  private _maxBufferSize = 65536;
  private _bufferFlushDelay = 5;
  
  constructor() {
    super();
    this._startBufferFlushInterval();
  }
  
  get onProcessData() {
    return (listener: (event: IProcessDataEvent) => void) => {
      this.on('processData', listener);
    };
  }
  
  get onProcessReady() {
    return (listener: (event: IProcessReadyEvent) => void) => {
      this.on('processReady', listener);
    };
  }
  
  get onProcessExit() {
    return (listener: (event: IProcessExitEvent) => void) => {
      this.on('processExit', listener);
    };
  }
  
  get onProcessTitleChanged() {
    return (listener: (event: { id: number; title: string }) => void) => {
      this.on('processTitleChanged', listener);
    };
  }
  
  get onProcessCwdChanged() {
    return (listener: (event: { id: number; cwd: string }) => void) => {
      this.on('processCwdChanged', listener);
    };
  }
  
  private _startBufferFlushInterval(): void {
    this._bufferFlushInterval = setInterval(() => {
      this._flushAllBuffers();
    }, this._bufferFlushDelay);
  }
  
  private _stopBufferFlushInterval(): void {
    if (this._bufferFlushInterval) {
      clearInterval(this._bufferFlushInterval);
      this._bufferFlushInterval = undefined;
    }
  }
  
  private _flushAllBuffers(): void {
    for (const [id, buffer] of this._dataBuffer) {
      if (buffer.data.length > 0) {
        this._flushBuffer(id);
      }
    }
  }
  
  private _flushBuffer(id: number): void {
    const buffer = this._dataBuffer.get(id);
    if (!buffer || buffer.data.length === 0) {
      return;
    }
    
    const data = buffer.data.join('');
    buffer.data = [];
    buffer.size = 0;
    
    this.emit('processData', { id, data });
  }
  
  private _bufferData(id: number, data: string): void {
    let buffer = this._dataBuffer.get(id);
    if (!buffer) {
      buffer = { id, data: [], size: 0 };
      this._dataBuffer.set(id, buffer);
    }
    
    buffer.data.push(data);
    buffer.size += data.length;
    
    if (buffer.size >= this._maxBufferSize) {
      this._flushBuffer(id);
    }
  }
  
  async createProcess(shellLaunchConfig: IPtyProcessOptions): Promise<number> {
    const id = this._nextProcessId++;
    
    const persistentProcess: IPersistentTerminalProcess = {
      id,
      pid: undefined,
      title: shellLaunchConfig.name || 'Terminal',
      titleSource: 'api',
      icon: shellLaunchConfig.icon,
      color: shellLaunchConfig.color,
      cwd: shellLaunchConfig.cwd || process.cwd(),
      isOrphan: shellLaunchConfig.isOrphan || false,
      hasChildProcesses: false,
      shellLaunchConfig
    };
    
    if (shellLaunchConfig.shouldPersist) {
      this._persistentProcesses.set(id, persistentProcess);
    }
    
    const terminalProcess = new TerminalProcess(id, shellLaunchConfig);
    this._processes.set(id, terminalProcess);
    
    terminalProcess.onData((data) => {
      if (shellLaunchConfig.flowControl !== false) {
        this._bufferData(id, data);
      } else {
        this.emit('processData', { id, data });
      }
    });
    
    terminalProcess.onReady((event) => {
      persistentProcess.pid = event.pid;
      this.emit('processReady', { id, ...event });
    });
    
    terminalProcess.onExit((event) => {
      this._dataBuffer.delete(id);
      this._processes.delete(id);
      if (!persistentProcess.isOrphan) {
        this._persistentProcesses.delete(id);
      }
      this.emit('processExit', { id, ...event });
    });
    
    terminalProcess.onTitleChanged((title) => {
      persistentProcess.title = title;
      persistentProcess.titleSource = 'process';
      this.emit('processTitleChanged', { id, title });
    });
    
    terminalProcess.onCwdChanged((cwd) => {
      persistentProcess.cwd = cwd;
      this.emit('processCwdChanged', { id, cwd });
    });
    
    await terminalProcess.start();
    
    if (shellLaunchConfig.initialText) {
      await this.writeProcessData(id, shellLaunchConfig.initialText);
    }
    
    return id;
  }
  
  async attachToProcess(id: number): Promise<void> {
    const persistentProcess = this._persistentProcesses.get(id);
    if (!persistentProcess) {
      throw new Error(`Process ${id} not found`);
    }
    
    if (this._processes.has(id)) {
      return;
    }
    
    const terminalProcess = new TerminalProcess(id, persistentProcess.shellLaunchConfig);
    this._processes.set(id, terminalProcess);
    
    terminalProcess.onData((data) => {
      if (persistentProcess.shellLaunchConfig.flowControl !== false) {
        this._bufferData(id, data);
      } else {
        this.emit('processData', { id, data });
      }
    });
    
    terminalProcess.onExit((event) => {
      this._dataBuffer.delete(id);
      this._processes.delete(id);
      if (!persistentProcess.isOrphan) {
        this._persistentProcesses.delete(id);
      }
      this.emit('processExit', { id, ...event });
    });
    
    terminalProcess.onTitleChanged((title) => {
      persistentProcess.title = title;
      this.emit('processTitleChanged', { id, title });
    });
    
    terminalProcess.onCwdChanged((cwd) => {
      persistentProcess.cwd = cwd;
      this.emit('processCwdChanged', { id, cwd });
    });
    
    await terminalProcess.start();
  }
  
  async detachFromProcess(id: number): Promise<void> {
    const terminalProcess = this._processes.get(id);
    if (!terminalProcess) {
      return;
    }
    
    this._flushBuffer(id);
    terminalProcess.removeAllListeners();
    this._processes.delete(id);
  }
  
  async listProcesses(): Promise<IPersistentTerminalProcess[]> {
    return Array.from(this._persistentProcesses.values());
  }
  
  async terminateProcess(id: number): Promise<void> {
    const terminalProcess = this._processes.get(id);
    if (terminalProcess) {
      await terminalProcess.shutdown();
    }
    
    this._dataBuffer.delete(id);
    this._processes.delete(id);
    this._persistentProcesses.delete(id);
  }
  
  async resizeProcess(id: number, cols: number, rows: number): Promise<void> {
    const terminalProcess = this._processes.get(id);
    if (!terminalProcess) {
      throw new Error(`Process ${id} not found`);
    }
    
    terminalProcess.resize(cols, rows);
  }
  
  async writeProcessData(id: number, data: string): Promise<void> {
    const terminalProcess = this._processes.get(id);
    if (!terminalProcess) {
      throw new Error(`Process ${id} not found`);
    }
    
    terminalProcess.write(data);
  }
  
  async orphanProcess(id: number): Promise<void> {
    const persistentProcess = this._persistentProcesses.get(id);
    if (persistentProcess) {
      persistentProcess.isOrphan = true;
    }
    
    await this.detachFromProcess(id);
  }
  
  async getProcessEnvironment(id: number): Promise<Record<string, string>> {
    const terminalProcess = this._processes.get(id);
    if (!terminalProcess) {
      const persistentProcess = this._persistentProcesses.get(id);
      if (persistentProcess) {
        return persistentProcess.shellLaunchConfig.env || {};
      }
      throw new Error(`Process ${id} not found`);
    }
    
    return terminalProcess.getEnvironment();
  }
  
  async setProcessEnvironment(id: number, env: Record<string, string>): Promise<void> {
    const persistentProcess = this._persistentProcesses.get(id);
    if (persistentProcess) {
      persistentProcess.shellLaunchConfig.env = env;
    }
    
    const terminalProcess = this._processes.get(id);
    if (terminalProcess) {
      terminalProcess.setEnvironment(env);
    }
  }
  
  shutdown(): void {
    this._stopBufferFlushInterval();
    this._flushAllBuffers();
    
    for (const terminalProcess of this._processes.values()) {
      terminalProcess.shutdown();
    }
    
    this._processes.clear();
    this._persistentProcesses.clear();
    this._dataBuffer.clear();
  }
}