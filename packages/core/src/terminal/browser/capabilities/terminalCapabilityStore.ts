/**
 * Terminal Capability Store
 * Terminal capability system (based on VSCode architecture)
 */

import { EventEmitter } from 'events';

export interface ITerminalCapabilityStore {
  readonly capabilities: Map<TerminalCapability, ITerminalCapabilityImplementation>;
  has(capability: TerminalCapability): boolean;
  get<T extends ITerminalCapabilityImplementation>(capability: TerminalCapability): T | undefined;
  add(capability: TerminalCapability, implementation: ITerminalCapabilityImplementation): void;
  remove(capability: TerminalCapability): void;
  readonly onDidAddCapability: (listener: (capability: TerminalCapability) => void) => void;
  readonly onDidRemoveCapability: (listener: (capability: TerminalCapability) => void) => void;
}

export enum TerminalCapability {
  CommandDetection = 'commandDetection',
  CwdDetection = 'cwdDetection',
  BufferMarkDetection = 'bufferMarkDetection',
  NaiveCwdDetection = 'naiveCwdDetection',
  PartialCommandDetection = 'partialCommandDetection',
  ShellIntegration = 'shellIntegration'
}

export interface ITerminalCapabilityImplementation {
  readonly type: TerminalCapability;
  activate?(): void;
  dispose?(): void;
}

export interface ICommandDetectionCapability extends ITerminalCapabilityImplementation {
  readonly type: TerminalCapability.CommandDetection;
  readonly commands: readonly ICommand[];
  readonly currentCommand: ICommand | undefined;
  readonly onCommandStarted: (listener: (command: ICommand) => void) => void;
  readonly onCommandFinished: (listener: (command: ICommand) => void) => void;
  readonly onCommandInvalidated: (listener: (commands: ICommand[]) => void) => void;
  setCommandLine(commandLine: string): void;
  setIsWindowsPty(isWindowsPty: boolean): void;
  setIsCommandStorageDisabled(isDisabled: boolean): void;
}

export interface ICommand {
  readonly command: string;
  readonly timestamp: number;
  readonly cwd?: string;
  readonly exitCode?: number;
  readonly marker?: IMarker;
  readonly endMarker?: IMarker;
  readonly executedMarker?: IMarker;
  readonly aliases?: string[][];
  readonly wasReplayed?: boolean;
  readonly isInvalid?: boolean;
  readonly genericMarkProperties?: IGenericMarkProperties;
}

export interface IMarker {
  readonly line: number;
  readonly id: number;
  readonly isDisposed: boolean;
  dispose(): void;
  onDispose: (listener: () => void) => void;
}

export interface IGenericMarkProperties {
  hoverMessage?: string;
  disableCommandStorage?: boolean;
}

export interface ICwdDetectionCapability extends ITerminalCapabilityImplementation {
  readonly type: TerminalCapability.CwdDetection;
  readonly cwd: string;
  readonly onDidChangeCwd: (listener: (cwd: string) => void) => void;
  updateCwd(cwd: string): void;
  getCwd(): Promise<string>;
}

export interface IBufferMarkCapability extends ITerminalCapabilityImplementation {
  readonly type: TerminalCapability.BufferMarkDetection;
  readonly markers: readonly IMarker[];
  addMark(properties?: IMarkProperties): IMarker;
  clearMarker(marker: IMarker): void;
  scrollToMark(marker: IMarker, position?: ScrollPosition): void;
}

export interface IMarkProperties {
  line?: number;
  hoverMessage?: string;
  identifier?: string;
}

export enum ScrollPosition {
  Top = 'top',
  Middle = 'middle',
  Bottom = 'bottom'
}

export interface IShellIntegrationCapability extends ITerminalCapabilityImplementation {
  readonly type: TerminalCapability.ShellIntegration;
  readonly shellType: string | undefined;
  readonly isIntegrated: boolean;
  readonly onDidChangeShellType: (listener: (shellType: string | undefined) => void) => void;
  readonly onIntegrationChange: (listener: (isIntegrated: boolean) => void) => void;
  deserialize(data: string): void;
  serialize(): string;
}

export class TerminalCapabilityStore extends EventEmitter implements ITerminalCapabilityStore {
  private _capabilities = new Map<TerminalCapability, ITerminalCapabilityImplementation>();
  
  get capabilities(): Map<TerminalCapability, ITerminalCapabilityImplementation> {
    return new Map(this._capabilities);
  }
  
  get onDidAddCapability() {
    return (listener: (capability: TerminalCapability) => void) => {
      this.on('didAddCapability', listener);
    };
  }
  
  get onDidRemoveCapability() {
    return (listener: (capability: TerminalCapability) => void) => {
      this.on('didRemoveCapability', listener);
    };
  }
  
  has(capability: TerminalCapability): boolean {
    return this._capabilities.has(capability);
  }
  
  get<T extends ITerminalCapabilityImplementation>(capability: TerminalCapability): T | undefined {
    return this._capabilities.get(capability) as T | undefined;
  }
  
  add(capability: TerminalCapability, implementation: ITerminalCapabilityImplementation): void {
    if (this._capabilities.has(capability)) {
      this.remove(capability);
    }
    
    this._capabilities.set(capability, implementation);
    
    if (implementation.activate) {
      implementation.activate();
    }
    
    this.emit('didAddCapability', capability);
  }
  
  remove(capability: TerminalCapability): void {
    const implementation = this._capabilities.get(capability);
    if (!implementation) {
      return;
    }
    
    if (implementation.dispose) {
      implementation.dispose();
    }
    
    this._capabilities.delete(capability);
    this.emit('didRemoveCapability', capability);
  }
  
  dispose(): void {
    for (const [capability, implementation] of this._capabilities) {
      if (implementation.dispose) {
        implementation.dispose();
      }
    }
    
    this._capabilities.clear();
    this.removeAllListeners();
  }
}

export class CommandDetectionCapability extends EventEmitter implements ICommandDetectionCapability {
  readonly type = TerminalCapability.CommandDetection;
  private _commands: ICommand[] = [];
  private _currentCommand: ICommand | undefined;
  private _isWindowsPty = false;
  private _isCommandStorageDisabled = false;
  
  get commands(): readonly ICommand[] {
    return [...this._commands];
  }
  
  get currentCommand(): ICommand | undefined {
    return this._currentCommand;
  }
  
  get onCommandStarted() {
    return (listener: (command: ICommand) => void) => {
      this.on('commandStarted', listener);
    };
  }
  
  get onCommandFinished() {
    return (listener: (command: ICommand) => void) => {
      this.on('commandFinished', listener);
    };
  }
  
  get onCommandInvalidated() {
    return (listener: (commands: ICommand[]) => void) => {
      this.on('commandInvalidated', listener);
    };
  }
  
  setCommandLine(commandLine: string): void {
    if (this._currentCommand) {
      this._currentCommand = { ...this._currentCommand, command: commandLine };
    }
  }
  
  setIsWindowsPty(isWindowsPty: boolean): void {
    this._isWindowsPty = isWindowsPty;
  }
  
  setIsCommandStorageDisabled(isDisabled: boolean): void {
    this._isCommandStorageDisabled = isDisabled;
  }
  
  handleCommandStart(command: string, cwd?: string): void {
    this._currentCommand = {
      command,
      timestamp: Date.now(),
      cwd
    };
    
    if (!this._isCommandStorageDisabled) {
      this._commands.push(this._currentCommand);
      if (this._commands.length > 1000) {
        this._commands.shift();
      }
    }
    
    this.emit('commandStarted', this._currentCommand);
  }
  
  handleCommandFinish(exitCode?: number): void {
    if (this._currentCommand) {
      this._currentCommand = { ...this._currentCommand, exitCode };
      this.emit('commandFinished', this._currentCommand);
      this._currentCommand = undefined;
    }
  }
  
  invalidateCommands(commands: ICommand[]): void {
    for (const command of commands) {
      (command as any).isInvalid = true;
    }
    this.emit('commandInvalidated', commands);
  }
  
  dispose(): void {
    this._commands = [];
    this._currentCommand = undefined;
    this.removeAllListeners();
  }
}

export class CwdDetectionCapability extends EventEmitter implements ICwdDetectionCapability {
  readonly type = TerminalCapability.CwdDetection;
  private _cwd: string;
  
  constructor(initialCwd: string) {
    super();
    this._cwd = initialCwd;
  }
  
  get cwd(): string {
    return this._cwd;
  }
  
  get onDidChangeCwd() {
    return (listener: (cwd: string) => void) => {
      this.on('didChangeCwd', listener);
    };
  }
  
  updateCwd(cwd: string): void {
    if (this._cwd !== cwd) {
      this._cwd = cwd;
      this.emit('didChangeCwd', cwd);
    }
  }
  
  async getCwd(): Promise<string> {
    return this._cwd;
  }
  
  dispose(): void {
    this.removeAllListeners();
  }
}

export class BufferMarkCapability extends EventEmitter implements IBufferMarkCapability {
  readonly type = TerminalCapability.BufferMarkDetection;
  private _markers: Set<IMarker> = new Set();
  private _nextMarkerId = 1;
  
  get markers(): readonly IMarker[] {
    return Array.from(this._markers);
  }
  
  addMark(properties?: IMarkProperties): IMarker {
    const marker = new TerminalMarker(this._nextMarkerId++, properties?.line || 0);
    
    if (properties?.hoverMessage) {
      (marker as any).hoverMessage = properties.hoverMessage;
    }
    
    if (properties?.identifier) {
      (marker as any).identifier = properties.identifier;
    }
    
    this._markers.add(marker);
    
    marker.onDispose(() => {
      this._markers.delete(marker);
    });
    
    return marker;
  }
  
  clearMarker(marker: IMarker): void {
    if (this._markers.has(marker)) {
      marker.dispose();
      this._markers.delete(marker);
    }
  }
  
  scrollToMark(marker: IMarker, position: ScrollPosition = ScrollPosition.Middle): void {
    console.log(`Scrolling to marker ${marker.id} at position ${position}`);
  }
  
  dispose(): void {
    for (const marker of this._markers) {
      marker.dispose();
    }
    this._markers.clear();
    this.removeAllListeners();
  }
}

class TerminalMarker extends EventEmitter implements IMarker {
  private _isDisposed = false;
  
  constructor(
    public readonly id: number,
    public readonly line: number
  ) {
    super();
  }
  
  get isDisposed(): boolean {
    return this._isDisposed;
  }
  
  onDispose(listener: () => void): void {
    this.on('dispose', listener);
  }
  
  dispose(): void {
    if (!this._isDisposed) {
      this._isDisposed = true;
      this.emit('dispose');
      this.removeAllListeners();
    }
  }
}

export class ShellIntegrationCapability extends EventEmitter implements IShellIntegrationCapability {
  readonly type = TerminalCapability.ShellIntegration;
  private _shellType: string | undefined;
  private _isIntegrated = false;
  
  get shellType(): string | undefined {
    return this._shellType;
  }
  
  get isIntegrated(): boolean {
    return this._isIntegrated;
  }
  
  get onDidChangeShellType() {
    return (listener: (shellType: string | undefined) => void) => {
      this.on('didChangeShellType', listener);
    };
  }
  
  get onIntegrationChange() {
    return (listener: (isIntegrated: boolean) => void) => {
      this.on('integrationChange', listener);
    };
  }
  
  setShellType(shellType: string | undefined): void {
    if (this._shellType !== shellType) {
      this._shellType = shellType;
      this.emit('didChangeShellType', shellType);
    }
  }
  
  setIntegrationStatus(isIntegrated: boolean): void {
    if (this._isIntegrated !== isIntegrated) {
      this._isIntegrated = isIntegrated;
      this.emit('integrationChange', isIntegrated);
    }
  }
  
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this._shellType = parsed.shellType;
      this._isIntegrated = parsed.isIntegrated;
    } catch (error) {
      console.error('Failed to deserialize shell integration data:', error);
    }
  }
  
  serialize(): string {
    return JSON.stringify({
      shellType: this._shellType,
      isIntegrated: this._isIntegrated
    });
  }
  
  dispose(): void {
    this.removeAllListeners();
  }
}