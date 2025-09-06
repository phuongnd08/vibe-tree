/**
 * Base Terminal Backend
 * Abstract backend implementation (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import { 
  ITerminalLaunchConfig,
  ITerminalProfile,
  OperatingSystem
} from '../common/terminal';

export interface ITerminalBackend {
  readonly remoteAuthority: string | undefined;
  readonly os: OperatingSystem | undefined;
  readonly userHome: string | undefined;
  
  onProcessData(processId: string, listener: (data: string) => void): void;
  onProcessExit(processId: string, listener: (exitCode: number) => void): void;
  
  createProcess(
    shellLaunchConfig: ITerminalLaunchConfig,
    cols: number,
    rows: number
  ): Promise<ICreateProcessResult>;
  
  writeProcess(processId: string, data: string): Promise<void>;
  resizeProcess(processId: string, cols: number, rows: number): Promise<void>;
  killProcess(processId: string): Promise<void>;
  
  getDefaultSystemShell(os: OperatingSystem): Promise<string>;
  getProfiles(): Promise<ITerminalProfile[]>;
  
  dispose(): void;
}

export interface ICreateProcessResult {
  processId: string;
  cwd?: string;
}

export abstract class BaseTerminalBackend extends EventEmitter implements ITerminalBackend {
  protected _processDataListeners = new Map<string, Set<(data: string) => void>>();
  protected _processExitListeners = new Map<string, Set<(exitCode: number) => void>>();
  
  abstract get remoteAuthority(): string | undefined;
  abstract get os(): OperatingSystem | undefined;
  abstract get userHome(): string | undefined;
  
  onProcessData(processId: string, listener: (data: string) => void): void {
    if (!this._processDataListeners.has(processId)) {
      this._processDataListeners.set(processId, new Set());
    }
    this._processDataListeners.get(processId)!.add(listener);
  }
  
  onProcessExit(processId: string, listener: (exitCode: number) => void): void {
    if (!this._processExitListeners.has(processId)) {
      this._processExitListeners.set(processId, new Set());
    }
    this._processExitListeners.get(processId)!.add(listener);
  }
  
  protected emitProcessData(processId: string, data: string): void {
    const listeners = this._processDataListeners.get(processId);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }
  
  protected emitProcessExit(processId: string, exitCode: number): void {
    const listeners = this._processExitListeners.get(processId);
    if (listeners) {
      listeners.forEach(listener => listener(exitCode));
    }
    
    // Clean up listeners
    this._processDataListeners.delete(processId);
    this._processExitListeners.delete(processId);
  }
  
  abstract createProcess(
    shellLaunchConfig: ITerminalLaunchConfig,
    cols: number,
    rows: number
  ): Promise<ICreateProcessResult>;
  
  abstract writeProcess(processId: string, data: string): Promise<void>;
  abstract resizeProcess(processId: string, cols: number, rows: number): Promise<void>;
  abstract killProcess(processId: string): Promise<void>;
  
  async getDefaultSystemShell(os: OperatingSystem): Promise<string> {
    switch (os) {
      case OperatingSystem.Windows:
        return 'cmd.exe';
      case OperatingSystem.Macintosh:
        return '/bin/zsh';
      case OperatingSystem.Linux:
      default:
        return '/bin/bash';
    }
  }
  
  abstract getProfiles(): Promise<ITerminalProfile[]>;
  
  dispose(): void {
    this._processDataListeners.clear();
    this._processExitListeners.clear();
    this.removeAllListeners();
  }
}