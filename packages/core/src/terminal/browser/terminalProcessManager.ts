/**
 * Terminal Process Manager
 * Manages terminal process lifecycle (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import { 
  ITerminalProcessManager,
  ITerminalLaunchConfig,
  ProcessState,
  IEnvironmentVariableInfo,
  IReconnectionProperties,
  OperatingSystem,
  ProcessPropertyType,
  IProcessPropertyMap,
  ISerializedCommandDetectionCapability
} from '../common/terminal';
import { ITerminalBackend } from './baseTerminalBackend';
import { XtermTerminal } from './xterm/xtermTerminal';

export class TerminalProcessManager extends EventEmitter implements ITerminalProcessManager {
  private _processState: ProcessState = ProcessState.Uninitialized;
  private _processId: string | undefined;
  private _shellProcessId: number | undefined;
  private _hasWrittenData = false;
  private _hasChildProcesses = false;
  private _environmentVariableInfo: IEnvironmentVariableInfo | undefined;
  private _reconnectionProperties: IReconnectionProperties | undefined;
  private _initialCwd: string | undefined;
  private _cwd: string | undefined;
  private _ptyProcessReady: Promise<void>;
  private _ptyProcessReadyResolver: (() => void) | undefined;
  
  constructor(
    private readonly backend: ITerminalBackend,
    private readonly shellLaunchConfig: ITerminalLaunchConfig,
    private readonly xtermTerminal: XtermTerminal
  ) {
    super();
    
    this._ptyProcessReady = new Promise<void>((resolve) => {
      this._ptyProcessReadyResolver = resolve;
    });
  }
  
  get processState(): ProcessState {
    return this._processState;
  }
  
  get ptyProcessReady(): Promise<void> {
    return this._ptyProcessReady;
  }
  
  get shellProcessId(): number | undefined {
    return this._shellProcessId;
  }
  
  get remoteAuthority(): string | undefined {
    return this.backend.remoteAuthority;
  }
  
  get os(): OperatingSystem | undefined {
    return this.backend.os;
  }
  
  get userHome(): string | undefined {
    return this.backend.userHome;
  }
  
  get environmentVariableInfo(): IEnvironmentVariableInfo | undefined {
    return this._environmentVariableInfo;
  }
  
  get persistentProcessId(): number | undefined {
    return undefined;
  }
  
  get shouldPersist(): boolean {
    return false;
  }
  
  get hasWrittenData(): boolean {
    return this._hasWrittenData;
  }
  
  get reconnectionProperties(): IReconnectionProperties | undefined {
    return this._reconnectionProperties;
  }
  
  get hasChildProcesses(): boolean {
    return this._hasChildProcesses;
  }
  
  get onPtyDisconnect() {
    return () => this.on('ptyDisconnect', () => {});
  }
  
  get onPtyReconnect() {
    return () => this.on('ptyReconnect', () => {});
  }
  
  get onProcessReady() {
    return (listener: () => void) => {
      this.on('processReady', listener);
    };
  }
  
  get onBeforeProcessData() {
    return (listener: (data: string) => void) => {
      this.on('beforeProcessData', listener);
    };
  }
  
  get onProcessData() {
    return (listener: (data: string) => void) => {
      this.on('processData', listener);
    };
  }
  
  get onEnvironmentVariableInfoChanged() {
    return (listener: (info: IEnvironmentVariableInfo) => void) => {
      this.on('environmentVariableInfoChanged', listener);
    };
  }
  
  get onProcessExit() {
    return (listener: (exitCode: number | undefined) => void) => {
      this.on('processExit', listener);
    };
  }
  
  get onRestoreCommands() {
    return (listener: (commands: ISerializedCommandDetectionCapability) => void) => {
      this.on('restoreCommands', listener);
    };
  }
  
  async createProcess(
    shellLaunchConfig: ITerminalLaunchConfig,
    cols: number,
    rows: number
  ): Promise<void> {
    if (this._processState !== ProcessState.Uninitialized) {
      throw new Error('Process already created');
    }
    
    this._processState = ProcessState.Launching;
    
    try {
      // Create the process through the backend
      const result = await this.backend.createProcess(
        shellLaunchConfig,
        cols,
        rows
      );
      
      if (!result.processId) {
        throw new Error('Failed to create process');
      }
      
      this._processId = result.processId;
      this._shellProcessId = parseInt(result.processId);
      this._initialCwd = result.cwd || shellLaunchConfig.cwd || process.cwd();
      this._cwd = this._initialCwd;
      
      // Subscribe to backend events
      this.backend.onProcessData(this._processId, (data: string) => {
        this._hasWrittenData = true;
        this.emit('beforeProcessData', data);
        this.emit('processData', data);
      });
      
      this.backend.onProcessExit(this._processId, (exitCode: number) => {
        this._processState = ProcessState.KilledByProcess;
        this.emit('processExit', exitCode);
      });
      
      this._processState = ProcessState.Running;
      
      if (this._ptyProcessReadyResolver) {
        this._ptyProcessReadyResolver();
        this._ptyProcessReadyResolver = undefined;
      }
      
      this.emit('processReady');
      
    } catch (error) {
      this._processState = ProcessState.KilledDuringLaunch;
      throw error;
    }
  }
  
  async relaunch(
    shellLaunchConfig: ITerminalLaunchConfig,
    cols: number,
    rows: number,
    reset: boolean
  ): Promise<void> {
    // Kill existing process
    if (this._processId) {
      await this.backend.killProcess(this._processId);
    }
    
    // Reset state
    this._processState = ProcessState.Uninitialized;
    this._processId = undefined;
    this._shellProcessId = undefined;
    this._hasWrittenData = false;
    
    // Create new process
    await this.createProcess(shellLaunchConfig, cols, rows);
  }
  
  async write(data: string): Promise<void> {
    if (!this._processId) {
      throw new Error('No process to write to');
    }
    
    await this.backend.writeProcess(this._processId, data);
  }
  
  async setDimensions(cols: number, rows: number): Promise<void>;
  async setDimensions(cols: number, rows: number, sync: false): Promise<void>;
  setDimensions(cols: number, rows: number, sync: true): void;
  setDimensions(cols: number, rows: number, sync?: boolean): void | Promise<void> {
    if (!this._processId) {
      return sync ? undefined : Promise.resolve();
    }
    
    const resize = () => this.backend.resizeProcess(this._processId!, cols, rows);
    
    if (sync) {
      resize().catch(console.error);
    } else {
      return resize();
    }
  }
  
  async setUnicodeVersion(version: '6' | '11'): Promise<void> {
    // Not implemented in basic version
  }
  
  acknowledgeDataEvent(charCount: number): void {
    // Not implemented in basic version
  }
  
  processPtyWrite(): void {
    // Not implemented in basic version
  }
  
  async freePortKillProcess(port: string, processId: number): Promise<{ port: string; processId: number }> {
    // Not implemented in basic version
    return { port, processId };
  }
  
  async getBackendOS(): Promise<OperatingSystem> {
    return this.backend.os || OperatingSystem.Linux;
  }
  
  async getShellEnvironment(): Promise<typeof process.env> {
    return process.env;
  }
  
  async getDefaultSystemShell(os: OperatingSystem): Promise<string> {
    return this.backend.getDefaultSystemShell(os);
  }
  
  async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<any[]> {
    return this.backend.getProfiles();
  }
  
  async getEnvironment(): Promise<typeof process.env> {
    return process.env;
  }
  
  async getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string> {
    return original;
  }
  
  setNativeDelegate(nativeDelegate: any): void {
    // Not implemented in basic version
  }
  
  installAutoReply(match: string, reply: string): void {
    // Not implemented in basic version
  }
  
  uninstallAutoReply(match: string): void {
    // Not implemented in basic version
  }
  
  async getInitialCwd(): Promise<string> {
    return this._initialCwd || process.cwd();
  }
  
  async refreshProperty<T extends ProcessPropertyType>(property: T): Promise<IProcessPropertyMap[T]> {
    switch (property) {
      case ProcessPropertyType.Cwd:
        return this._cwd as IProcessPropertyMap[T];
      case ProcessPropertyType.InitialCwd:
        return this._initialCwd as IProcessPropertyMap[T];
      case ProcessPropertyType.HasChildProcesses:
        return this._hasChildProcesses as IProcessPropertyMap[T];
      default:
        return undefined as any;
    }
  }
  
  async updateProperty<T extends ProcessPropertyType>(property: T, value: IProcessPropertyMap[T]): Promise<void> {
    switch (property) {
      case ProcessPropertyType.Cwd:
        this._cwd = value as string;
        break;
      case ProcessPropertyType.HasChildProcesses:
        this._hasChildProcesses = value as boolean;
        break;
    }
  }
  
  async detachFromProcess(forcePersist?: boolean): Promise<void> {
    // Not implemented in basic version
  }
  
  dispose(): void {
    if (this._processId) {
      this.backend.killProcess(this._processId).catch(console.error);
    }
    
    this.removeAllListeners();
  }
}