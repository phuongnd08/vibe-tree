/**
 * Terminal Service Implementation
 * Central service managing all terminal instances (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import { ITerminalInstance } from './terminalInstance';
import { ITerminalProfile, ITerminalLaunchConfig, ITerminalDimensions } from '../common/terminal';
import { ITerminalConfigurationService } from './terminalConfigurationService';
import { ITerminalProfileService } from './terminalProfileService';
import { ITerminalBackend } from './baseTerminalBackend';

export interface ITerminalService {
  readonly instances: ITerminalInstance[];
  readonly activeInstance: ITerminalInstance | undefined;
  readonly onDidCreateInstance: (instance: ITerminalInstance) => void;
  readonly onDidDisposeInstance: (instance: ITerminalInstance) => void;
  readonly onDidChangeActiveInstance: (instance: ITerminalInstance | undefined) => void;
  readonly onDidChangeInstances: () => void;
  readonly onDidChangeInstanceTitle: (instance: ITerminalInstance) => void;
  readonly onDidChangeInstanceIcon: (instance: ITerminalInstance) => void;
  readonly onDidChangeInstanceColor: (instance: ITerminalInstance) => void;
  readonly onDidChangeInstancePrimaryStatus: (instance: ITerminalInstance) => void;
  
  createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance>;
  getInstanceFromId(terminalId: number): ITerminalInstance | undefined;
  setActiveInstance(terminal: ITerminalInstance): void;
  disposeInstance(instance: ITerminalInstance): void;
  focusActiveInstance(): Promise<void>;
  
  registerBackend(backend: ITerminalBackend): void;
  getBackend(remoteAuthority?: string): ITerminalBackend | undefined;
}

export interface ICreateTerminalOptions {
  config?: ITerminalLaunchConfig;
  profile?: ITerminalProfile;
  location?: TerminalLocation;
  target?: TerminalLocationOptions;
}

export enum TerminalLocation {
  Panel = 1,
  Editor = 2
}

export interface TerminalLocationOptions {
  viewColumn?: number;
  preserveFocus?: boolean;
}

export class TerminalService extends EventEmitter implements ITerminalService {
  private static instance: TerminalService;
  private _instances: Map<number, ITerminalInstance> = new Map();
  private _activeInstance: ITerminalInstance | undefined;
  private _nextInstanceId = 1;
  private _backends: Map<string, ITerminalBackend> = new Map();
  
  constructor(
    private readonly configurationService: ITerminalConfigurationService,
    private readonly profileService: ITerminalProfileService
  ) {
    super();
  }
  
  static getInstance(
    configurationService: ITerminalConfigurationService,
    profileService: ITerminalProfileService
  ): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService(configurationService, profileService);
    }
    return TerminalService.instance;
  }
  
  get instances(): ITerminalInstance[] {
    return Array.from(this._instances.values());
  }
  
  get activeInstance(): ITerminalInstance | undefined {
    return this._activeInstance;
  }
  
  get onDidCreateInstance() {
    return (listener: (instance: ITerminalInstance) => void) => {
      this.on('didCreateInstance', listener);
    };
  }
  
  get onDidDisposeInstance() {
    return (listener: (instance: ITerminalInstance) => void) => {
      this.on('didDisposeInstance', listener);
    };
  }
  
  get onDidChangeActiveInstance() {
    return (listener: (instance: ITerminalInstance | undefined) => void) => {
      this.on('didChangeActiveInstance', listener);
    };
  }
  
  get onDidChangeInstances() {
    return (listener: () => void) => {
      this.on('didChangeInstances', listener);
    };
  }
  
  get onDidChangeInstanceTitle() {
    return (listener: (instance: ITerminalInstance) => void) => {
      this.on('didChangeInstanceTitle', listener);
    };
  }
  
  get onDidChangeInstanceIcon() {
    return (listener: (instance: ITerminalInstance) => void) => {
      this.on('didChangeInstanceIcon', listener);
    };
  }
  
  get onDidChangeInstanceColor() {
    return (listener: (instance: ITerminalInstance) => void) => {
      this.on('didChangeInstanceColor', listener);
    };
  }
  
  get onDidChangeInstancePrimaryStatus() {
    return (listener: (instance: ITerminalInstance) => void) => {
      this.on('didChangeInstancePrimaryStatus', listener);
    };
  }
  
  async createTerminal(options: ICreateTerminalOptions = {}): Promise<ITerminalInstance> {
    const instanceId = this._nextInstanceId++;
    
    // Get the appropriate backend
    const backend = this.getBackend();
    if (!backend) {
      throw new Error('No terminal backend available');
    }
    
    // Get terminal profile if not provided
    const profile = options.profile || await this.profileService.getDefaultProfile();
    
    // Create terminal launch config
    const launchConfig: ITerminalLaunchConfig = options.config || {
      name: profile.profileName,
      shellPath: profile.path,
      shellArgs: profile.args,
      env: profile.env,
      cwd: options.config?.cwd
    };
    
    // Import TerminalInstance dynamically to avoid circular dependency
    const { TerminalInstance } = await import('./terminalInstance');
    
    // Create the terminal instance
    const instance = new TerminalInstance(
      instanceId,
      launchConfig,
      this.configurationService,
      backend
    );
    
    // Initialize the instance
    await instance.initialize();
    
    // Register instance
    this._instances.set(instanceId, instance);
    
    // Set as active if it's the first instance
    if (this._instances.size === 1) {
      this.setActiveInstance(instance);
    }
    
    // Subscribe to instance events
    instance.onDidChangeTitle(() => {
      this.emit('didChangeInstanceTitle', instance);
    });
    
    instance.onDidChangeIcon(() => {
      this.emit('didChangeInstanceIcon', instance);
    });
    
    instance.onDisposed(() => {
      this.disposeInstance(instance);
    });
    
    // Emit events
    this.emit('didCreateInstance', instance);
    this.emit('didChangeInstances');
    
    return instance;
  }
  
  getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
    return this._instances.get(terminalId);
  }
  
  setActiveInstance(terminal: ITerminalInstance): void {
    if (this._activeInstance === terminal) {
      return;
    }
    
    this._activeInstance = terminal;
    this.emit('didChangeActiveInstance', terminal);
  }
  
  disposeInstance(instance: ITerminalInstance): void {
    const removed = this._instances.delete(instance.id);
    if (!removed) {
      return;
    }
    
    // Update active instance if needed
    if (this._activeInstance === instance) {
      const remainingInstances = Array.from(this._instances.values());
      this._activeInstance = remainingInstances.length > 0 ? remainingInstances[0] : undefined;
      this.emit('didChangeActiveInstance', this._activeInstance);
    }
    
    // Dispose the instance
    instance.dispose();
    
    // Emit events
    this.emit('didDisposeInstance', instance);
    this.emit('didChangeInstances');
  }
  
  async focusActiveInstance(): Promise<void> {
    if (this._activeInstance) {
      await this._activeInstance.focus();
    }
  }
  
  registerBackend(backend: ITerminalBackend): void {
    const key = backend.remoteAuthority || 'local';
    this._backends.set(key, backend);
  }
  
  getBackend(remoteAuthority?: string): ITerminalBackend | undefined {
    const key = remoteAuthority || 'local';
    return this._backends.get(key);
  }
  
  dispose(): void {
    // Dispose all instances
    for (const instance of this._instances.values()) {
      instance.dispose();
    }
    this._instances.clear();
    
    // Dispose all backends
    for (const backend of this._backends.values()) {
      backend.dispose();
    }
    this._backends.clear();
    
    this.removeAllListeners();
  }
}