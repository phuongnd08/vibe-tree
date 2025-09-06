/**
 * PTY Host Service Implementation
 * Manages PTY host process communication (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import { ChildProcess, fork } from 'child_process';
import * as path from 'path';
import { IPtyService, IPtyProcessOptions, IPersistentTerminalProcess } from './ptyService';
import { IProcessDataEvent, IProcessReadyEvent, IProcessExitEvent } from '../common/terminal';

export interface IPtyHostService {
  readonly isConnected: boolean;
  readonly onProcessData: (listener: (event: IProcessDataEvent) => void) => void;
  readonly onProcessReady: (listener: (event: IProcessReadyEvent) => void) => void;
  readonly onProcessExit: (listener: (event: IProcessExitEvent) => void) => void;
  readonly onDidChangeConnectionState: (listener: (connected: boolean) => void) => void;
  
  createProcess(shellLaunchConfig: IPtyProcessOptions): Promise<number>;
  attachToProcess(id: number): Promise<void>;
  detachFromProcess(id: number): Promise<void>;
  listProcesses(): Promise<IPersistentTerminalProcess[]>;
  start(): Promise<void>;
  shutdown(): Promise<void>;
  terminateProcess(id: number): Promise<void>;
  resizeProcess(id: number, cols: number, rows: number): Promise<void>;
  getProcessEnvironment(id: number): Promise<Record<string, string>>;
  setProcessEnvironment(id: number, env: Record<string, string>): Promise<void>;
  writeProcessData(id: number, data: string): Promise<void>;
  orphanProcess(id: number): Promise<void>;
  getLatency(): Promise<number>;
  setTerminalLayoutInfo(layout: ITerminalLayoutInfo): Promise<void>;
  getTerminalLayoutInfo(): Promise<ITerminalLayoutInfo | undefined>;
}

export interface ITerminalLayoutInfo {
  tabs: ITerminalTabLayoutInfo[];
}

export interface ITerminalTabLayoutInfo {
  isActive: boolean;
  activePersistentProcessId: number | undefined;
  terminals: IPersistentTerminalProcess[];
}

interface IPtyHostMessage {
  type: 'create' | 'attach' | 'detach' | 'list' | 'terminate' | 'resize' | 'write' | 'orphan' | 'getEnv' | 'setEnv' | 'ping' | 'setLayout' | 'getLayout';
  requestId?: string;
  id?: number;
  options?: IPtyProcessOptions;
  data?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  layout?: ITerminalLayoutInfo;
}

interface IPtyHostResponse {
  type: 'response' | 'event';
  requestId?: string;
  success?: boolean;
  error?: string;
  data?: any;
  event?: 'data' | 'ready' | 'exit' | 'titleChanged' | 'cwdChanged';
  eventData?: any;
}

export class PtyHostService extends EventEmitter implements IPtyHostService {
  private static instance: PtyHostService;
  private _ptyHostProcess: ChildProcess | undefined;
  private _isConnected = false;
  private _pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
  private _processListeners = new Map<number, Set<Function>>();
  private _restartCount = 0;
  private _maxRestarts = 3;
  private _restartDelay = 1000;
  private _heartbeatInterval: NodeJS.Timeout | undefined;
  private _heartbeatTimeout = 5000;
  private _lastHeartbeat = Date.now();
  
  private constructor() {
    super();
  }
  
  static getInstance(): PtyHostService {
    if (!PtyHostService.instance) {
      PtyHostService.instance = new PtyHostService();
    }
    return PtyHostService.instance;
  }
  
  get isConnected(): boolean {
    return this._isConnected;
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
  
  get onDidChangeConnectionState() {
    return (listener: (connected: boolean) => void) => {
      this.on('connectionStateChanged', listener);
    };
  }
  
  async start(): Promise<void> {
    if (this._ptyHostProcess) {
      return;
    }
    
    return this._startPtyHost();
  }
  
  private async _startPtyHost(): Promise<void> {
    return new Promise((resolve, reject) => {
      const hostPath = path.join(__dirname, 'ptyHost.js');
      
      this._ptyHostProcess = fork(hostPath, [], {
        env: { ...process.env },
        silent: true
      });
      
      this._ptyHostProcess.on('message', (message: IPtyHostResponse) => {
        this._handleMessage(message);
      });
      
      this._ptyHostProcess.on('error', (error) => {
        console.error('PTY Host process error:', error);
        this._handleDisconnection();
      });
      
      this._ptyHostProcess.on('exit', (code, signal) => {
        console.log(`PTY Host process exited with code ${code} and signal ${signal}`);
        this._handleDisconnection();
      });
      
      this._ptyHostProcess.once('spawn', () => {
        this._isConnected = true;
        this._startHeartbeat();
        this.emit('connectionStateChanged', true);
        resolve();
      });
      
      setTimeout(() => {
        if (!this._isConnected) {
          reject(new Error('PTY Host process failed to start'));
        }
      }, 5000);
    });
  }
  
  private _handleMessage(message: IPtyHostResponse): void {
    if (message.type === 'response' && message.requestId) {
      const pending = this._pendingRequests.get(message.requestId);
      if (pending) {
        this._pendingRequests.delete(message.requestId);
        if (message.success) {
          pending.resolve(message.data);
        } else {
          pending.reject(new Error(message.error || 'Unknown error'));
        }
      }
    } else if (message.type === 'event') {
      this._handleEvent(message);
    }
  }
  
  private _handleEvent(message: IPtyHostResponse): void {
    switch (message.event) {
      case 'data':
        this.emit('processData', message.eventData);
        break;
      case 'ready':
        this.emit('processReady', message.eventData);
        break;
      case 'exit':
        this.emit('processExit', message.eventData);
        break;
      case 'titleChanged':
        this.emit('processTitleChanged', message.eventData);
        break;
      case 'cwdChanged':
        this.emit('processCwdChanged', message.eventData);
        break;
    }
  }
  
  private _handleDisconnection(): void {
    this._isConnected = false;
    this._stopHeartbeat();
    this._ptyHostProcess = undefined;
    this.emit('connectionStateChanged', false);
    
    for (const [, pending] of this._pendingRequests) {
      pending.reject(new Error('PTY Host disconnected'));
    }
    this._pendingRequests.clear();
    
    if (this._restartCount < this._maxRestarts) {
      this._restartCount++;
      console.log(`Attempting to restart PTY Host (attempt ${this._restartCount}/${this._maxRestarts})`);
      setTimeout(() => {
        this.start().catch(console.error);
      }, this._restartDelay * this._restartCount);
    }
  }
  
  private _startHeartbeat(): void {
    this._heartbeatInterval = setInterval(async () => {
      try {
        const latency = await this.getLatency();
        this._lastHeartbeat = Date.now();
      } catch (error) {
        console.error('Heartbeat failed:', error);
        if (Date.now() - this._lastHeartbeat > this._heartbeatTimeout * 2) {
          console.error('Heartbeat timeout, restarting PTY Host');
          this._handleDisconnection();
        }
      }
    }, this._heartbeatTimeout);
  }
  
  private _stopHeartbeat(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = undefined;
    }
  }
  
  private async _sendRequest(message: IPtyHostMessage): Promise<any> {
    if (!this._isConnected || !this._ptyHostProcess) {
      throw new Error('PTY Host is not connected');
    }
    
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(7);
      message.requestId = requestId;
      
      this._pendingRequests.set(requestId, { resolve, reject });
      
      this._ptyHostProcess!.send(message);
      
      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }
  
  async createProcess(shellLaunchConfig: IPtyProcessOptions): Promise<number> {
    return this._sendRequest({
      type: 'create',
      options: shellLaunchConfig
    });
  }
  
  async attachToProcess(id: number): Promise<void> {
    return this._sendRequest({
      type: 'attach',
      id
    });
  }
  
  async detachFromProcess(id: number): Promise<void> {
    return this._sendRequest({
      type: 'detach',
      id
    });
  }
  
  async listProcesses(): Promise<IPersistentTerminalProcess[]> {
    return this._sendRequest({
      type: 'list'
    });
  }
  
  async terminateProcess(id: number): Promise<void> {
    return this._sendRequest({
      type: 'terminate',
      id
    });
  }
  
  async resizeProcess(id: number, cols: number, rows: number): Promise<void> {
    return this._sendRequest({
      type: 'resize',
      id,
      cols,
      rows
    });
  }
  
  async writeProcessData(id: number, data: string): Promise<void> {
    return this._sendRequest({
      type: 'write',
      id,
      data
    });
  }
  
  async orphanProcess(id: number): Promise<void> {
    return this._sendRequest({
      type: 'orphan',
      id
    });
  }
  
  async getProcessEnvironment(id: number): Promise<Record<string, string>> {
    return this._sendRequest({
      type: 'getEnv',
      id
    });
  }
  
  async setProcessEnvironment(id: number, env: Record<string, string>): Promise<void> {
    return this._sendRequest({
      type: 'setEnv',
      id,
      env
    });
  }
  
  async getLatency(): Promise<number> {
    const start = Date.now();
    await this._sendRequest({ type: 'ping' });
    return Date.now() - start;
  }
  
  async setTerminalLayoutInfo(layout: ITerminalLayoutInfo): Promise<void> {
    return this._sendRequest({
      type: 'setLayout',
      layout
    });
  }
  
  async getTerminalLayoutInfo(): Promise<ITerminalLayoutInfo | undefined> {
    return this._sendRequest({
      type: 'getLayout'
    });
  }
  
  async shutdown(): Promise<void> {
    this._stopHeartbeat();
    
    if (this._ptyHostProcess) {
      this._ptyHostProcess.kill();
      this._ptyHostProcess = undefined;
    }
    
    this._isConnected = false;
    this._pendingRequests.clear();
    this._processListeners.clear();
    this.emit('connectionStateChanged', false);
  }
}