import { Emitter, Event } from 'vscode-jsonrpc';
import { 
  ITerminalService, 
  ITerminalInstance, 
  IShellLaunchConfig, 
  TerminalConnectionState,
  ITerminalBackend,
  ITerminalGroup,
  ITerminalConfigurationService
} from '../common/terminal';

export class TerminalService implements ITerminalService {
  readonly _serviceBrand: undefined;
  
  private _instances: ITerminalInstance[] = [];
  private _activeInstance: ITerminalInstance | undefined;
  private _connectionState: TerminalConnectionState = TerminalConnectionState.Connecting;
  private _instanceIdCounter = 0;
  private _backend: ITerminalBackend | undefined;
  private _groups: ITerminalGroup[] = [];
  private _configService: ITerminalConfigurationService | undefined;
  
  private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
  readonly onDidChangeActiveInstance: Event<ITerminalInstance | undefined> = this._onDidChangeActiveInstance.event;
  
  private readonly _onDidCreateInstance = new Emitter<ITerminalInstance>();
  readonly onDidCreateInstance: Event<ITerminalInstance> = this._onDidCreateInstance.event;
  
  private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
  readonly onDidDisposeInstance: Event<ITerminalInstance> = this._onDidDisposeInstance.event;
  
  private readonly _onDidChangeInstanceDimensions = new Emitter<ITerminalInstance>();
  readonly onDidChangeInstanceDimensions: Event<ITerminalInstance> = this._onDidChangeInstanceDimensions.event;
  
  private readonly _onDidChangeInstanceTitle = new Emitter<ITerminalInstance>();
  readonly onDidChangeInstanceTitle: Event<ITerminalInstance> = this._onDidChangeInstanceTitle.event;
  
  private readonly _onDidChangeConnectionState = new Emitter<void>();
  readonly onDidChangeConnectionState: Event<void> = this._onDidChangeConnectionState.event;
  
  private _whenConnected: Promise<void>;
  private _whenConnectedResolve!: () => void;
  
  constructor(
    backend?: ITerminalBackend,
    configService?: ITerminalConfigurationService
  ) {
    this._backend = backend;
    this._configService = configService;
    
    this._whenConnected = new Promise<void>(resolve => {
      this._whenConnectedResolve = resolve;
    });
    
    this._initialize();
  }
  
  private async _initialize(): Promise<void> {
    await this._connectToBackend();
  }
  
  private async _connectToBackend(): Promise<void> {
    try {
      if (this._backend) {
        this._connectionState = TerminalConnectionState.Connected;
        this._onDidChangeConnectionState.fire();
        this._whenConnectedResolve();
      }
    } catch (error) {
      console.error('Failed to connect to terminal backend:', error);
      this._connectionState = TerminalConnectionState.Disconnected;
      this._onDidChangeConnectionState.fire();
    }
  }
  
  get instances(): ITerminalInstance[] {
    return [...this._instances];
  }
  
  get activeInstance(): ITerminalInstance | undefined {
    return this._activeInstance;
  }
  
  get connectionState(): TerminalConnectionState {
    return this._connectionState;
  }
  
  async createTerminal(options?: IShellLaunchConfig): Promise<ITerminalInstance> {
    await this._whenConnected;
    
    const instanceId = ++this._instanceIdCounter;
    const shellLaunchConfig = options || {};
    
    if (!shellLaunchConfig.name) {
      shellLaunchConfig.name = `Terminal ${instanceId}`;
    }
    
    const { TerminalInstance } = await import('./terminalInstance');
    
    const instance = new TerminalInstance(
      instanceId,
      shellLaunchConfig,
      this._backend,
      this._configService
    );
    
    this._instances.push(instance);
    this._activeInstance = instance;
    
    instance.onDisposed(() => {
      this._removeInstance(instance);
    });
    
    instance.onTitleChanged(() => {
      this._onDidChangeInstanceTitle.fire(instance);
    });
    
    instance.onDimensionsChanged(() => {
      this._onDidChangeInstanceDimensions.fire(instance);
    });
    
    instance.onFocused(() => {
      this.setActiveInstance(instance);
    });
    
    this._onDidCreateInstance.fire(instance);
    this._onDidChangeActiveInstance.fire(instance);
    
    return instance;
  }
  
  getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
    return this._instances.find(instance => instance.id === terminalId);
  }
  
  setActiveInstance(instance: ITerminalInstance): void {
    if (this._activeInstance !== instance) {
      this._activeInstance = instance;
      this._onDidChangeActiveInstance.fire(instance);
    }
  }
  
  private _removeInstance(instance: ITerminalInstance): void {
    const index = this._instances.indexOf(instance);
    if (index !== -1) {
      this._instances.splice(index, 1);
      
      if (this._activeInstance === instance) {
        this._activeInstance = this._instances.length > 0 ? this._instances[0] : undefined;
        this._onDidChangeActiveInstance.fire(this._activeInstance);
      }
      
      this._onDidDisposeInstance.fire(instance);
    }
  }
  
  dispose(): void {
    this._instances.forEach(instance => instance.dispose());
    this._instances = [];
    this._activeInstance = undefined;
    
    this._onDidChangeActiveInstance.dispose();
    this._onDidCreateInstance.dispose();
    this._onDidDisposeInstance.dispose();
    this._onDidChangeInstanceDimensions.dispose();
    this._onDidChangeInstanceTitle.dispose();
    this._onDidChangeConnectionState.dispose();
  }
  
  async splitInstance(instance: ITerminalInstance): Promise<ITerminalInstance | undefined> {
    const index = this._instances.indexOf(instance);
    if (index === -1) {
      return undefined;
    }
    
    const newShellLaunchConfig: IShellLaunchConfig = {
      ...instance.shellLaunchConfig,
      name: `${instance.title} (split)`
    };
    
    const newInstance = await this.createTerminal(newShellLaunchConfig);
    
    const instanceIndex = this._instances.indexOf(instance);
    const newInstanceIndex = this._instances.indexOf(newInstance);
    
    if (newInstanceIndex !== -1) {
      this._instances.splice(newInstanceIndex, 1);
    }
    
    this._instances.splice(instanceIndex + 1, 0, newInstance);
    
    return newInstance;
  }
  
  async focusNext(): Promise<void> {
    if (this._instances.length === 0) {
      return;
    }
    
    if (!this._activeInstance) {
      this.setActiveInstance(this._instances[0]);
      return;
    }
    
    const currentIndex = this._instances.indexOf(this._activeInstance);
    const nextIndex = (currentIndex + 1) % this._instances.length;
    this.setActiveInstance(this._instances[nextIndex]);
    this._instances[nextIndex].focus();
  }
  
  async focusPrevious(): Promise<void> {
    if (this._instances.length === 0) {
      return;
    }
    
    if (!this._activeInstance) {
      this.setActiveInstance(this._instances[this._instances.length - 1]);
      return;
    }
    
    const currentIndex = this._instances.indexOf(this._activeInstance);
    const prevIndex = currentIndex === 0 ? this._instances.length - 1 : currentIndex - 1;
    this.setActiveInstance(this._instances[prevIndex]);
    this._instances[prevIndex].focus();
  }
}