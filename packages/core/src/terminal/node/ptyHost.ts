/**
 * PTY Host Process
 * Isolated process that manages all terminal processes (based on VSCode architecture)
 */

import { PtyService } from './ptyService';

interface IPtyHostMessage {
  type: 'create' | 'attach' | 'detach' | 'list' | 'terminate' | 'resize' | 'write' | 'orphan' | 'getEnv' | 'setEnv' | 'ping' | 'setLayout' | 'getLayout';
  requestId?: string;
  id?: number;
  options?: any;
  data?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  layout?: any;
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

class PtyHost {
  private ptyService: PtyService;
  private terminalLayouts: any = undefined;
  
  constructor() {
    this.ptyService = new PtyService();
    this.initialize();
  }
  
  private initialize(): void {
    process.on('message', async (message: IPtyHostMessage) => {
      try {
        const response = await this.handleMessage(message);
        if (response && message.requestId) {
          this.sendResponse({
            type: 'response',
            requestId: message.requestId,
            success: true,
            data: response
          });
        }
      } catch (error: any) {
        if (message.requestId) {
          this.sendResponse({
            type: 'response',
            requestId: message.requestId,
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      }
    });
    
    process.on('disconnect', () => {
      this.shutdown();
    });
    
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in PTY Host:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection in PTY Host:', reason);
    });
    
    this.setupEventForwarding();
  }
  
  private setupEventForwarding(): void {
    this.ptyService.onProcessData((event) => {
      this.sendEvent('data', event);
    });
    
    this.ptyService.onProcessReady((event) => {
      this.sendEvent('ready', event);
    });
    
    this.ptyService.onProcessExit((event) => {
      this.sendEvent('exit', event);
    });
    
    this.ptyService.onProcessTitleChanged((event) => {
      this.sendEvent('titleChanged', event);
    });
    
    this.ptyService.onProcessCwdChanged((event) => {
      this.sendEvent('cwdChanged', event);
    });
  }
  
  private async handleMessage(message: IPtyHostMessage): Promise<any> {
    switch (message.type) {
      case 'create':
        return this.ptyService.createProcess(message.options!);
        
      case 'attach':
        return this.ptyService.attachToProcess(message.id!);
        
      case 'detach':
        return this.ptyService.detachFromProcess(message.id!);
        
      case 'list':
        return this.ptyService.listProcesses();
        
      case 'terminate':
        return this.ptyService.terminateProcess(message.id!);
        
      case 'resize':
        return this.ptyService.resizeProcess(message.id!, message.cols!, message.rows!);
        
      case 'write':
        return this.ptyService.writeProcessData(message.id!, message.data!);
        
      case 'orphan':
        return this.ptyService.orphanProcess(message.id!);
        
      case 'getEnv':
        return this.ptyService.getProcessEnvironment(message.id!);
        
      case 'setEnv':
        return this.ptyService.setProcessEnvironment(message.id!, message.env!);
        
      case 'ping':
        return 'pong';
        
      case 'setLayout':
        this.terminalLayouts = message.layout;
        return;
        
      case 'getLayout':
        return this.terminalLayouts;
        
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }
  
  private sendResponse(response: IPtyHostResponse): void {
    if (process.send) {
      process.send(response);
    }
  }
  
  private sendEvent(event: string, data: any): void {
    this.sendResponse({
      type: 'event',
      event: event as any,
      eventData: data
    });
  }
  
  private shutdown(): void {
    this.ptyService.shutdown();
    process.exit(0);
  }
}

const host = new PtyHost();