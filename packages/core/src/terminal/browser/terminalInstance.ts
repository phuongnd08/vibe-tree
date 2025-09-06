/**
 * Terminal Instance Implementation
 * Individual terminal instance management (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { 
  ITerminalLaunchConfig, 
  ITerminalDimensions,
  ITerminalCapabilityStore,
  IShellIntegration,
  ProcessState,
  ITerminalProcessManager
} from '../common/terminal';
import { ITerminalConfigurationService } from './terminalConfigurationService';
import { ITerminalBackend } from './baseTerminalBackend';
import { TerminalProcessManager } from './terminalProcessManager';
import { XtermTerminal } from './xterm/xtermTerminal';
import { TerminalCapabilityStore } from './capabilities/terminalCapabilityStore';
import { ShellIntegrationAddon } from './xterm/shellIntegrationAddon';

export interface ITerminalInstance {
  readonly id: number;
  readonly title: string;
  readonly icon: string | undefined;
  readonly color: string | undefined;
  readonly processId: number | undefined;
  readonly processState: ProcessState;
  readonly shellLaunchConfig: ITerminalLaunchConfig;
  readonly areLinksReady: boolean;
  readonly capabilities: ITerminalCapabilityStore;
  readonly xterm: XTerm | undefined;
  readonly cols: number;
  readonly rows: number;
  readonly maxCols: number;
  readonly maxRows: number;
  readonly target: TerminalLocation | undefined;
  readonly shellIntegration: IShellIntegration | undefined;
  
  readonly onDidChangeTitle: (listener: () => void) => void;
  readonly onDidChangeIcon: (listener: () => void) => void;
  readonly onDidChangeColor: (listener: () => void) => void;
  readonly onDisposed: (listener: () => void) => void;
  readonly onLinksReady: (listener: () => void) => void;
  readonly onDimensionsChanged: (listener: () => void) => void;
  readonly onMaximumDimensionsChanged: (listener: () => void) => void;
  readonly onFocus: (listener: () => void) => void;
  readonly onProcessIdReady: (listener: () => void) => void;
  readonly onTitleChanged: (listener: (title: string) => void) => void;
  readonly onData: (listener: (data: string) => void) => void;
  readonly onBinary: (listener: (data: string) => void) => void;
  
  initialize(): Promise<void>;
  attachToElement(element: HTMLElement): void;
  detachFromElement(): void;
  focus(force?: boolean): void;
  blur(): void;
  paste(): Promise<void>;
  sendText(text: string, addNewLine?: boolean): Promise<void>;
  sendSequence(text: string): Promise<void>;
  runCommand(command: string, addNewLine?: boolean): Promise<void>;
  show(focus?: boolean): void;
  hide(): void;
  setVisible(visible: boolean): void;
  scrollDownLine(): void;
  scrollDownPage(): void;
  scrollToBottom(): void;
  scrollUpLine(): void;
  scrollUpPage(): void;
  scrollToTop(): void;
  clearBuffer(): void;
  clearSelection(): void;
  selectAll(): void;
  setDimensions(dimensions: ITerminalDimensions): Promise<void>;
  getInitialCwd(): Promise<string>;
  getCwd(): Promise<string>;
  refreshProperty<T extends any>(property: T): Promise<any>;
  rename(title?: string): void;
  changeIcon(icon?: string): void;
  changeColor(color?: string): void;
  dispose(): void;
}

export enum TerminalLocation {
  Panel = 1,
  Editor = 2
}

export class TerminalInstance extends EventEmitter implements ITerminalInstance {
  private _title: string;
  private _icon: string | undefined;
  private _color: string | undefined;
  private _processId: number | undefined;
  private _areLinksReady = false;
  private _cols = 80;
  private _rows = 30;
  private _xtermTerminal: XtermTerminal | undefined;
  private _processManager: ITerminalProcessManager | undefined;
  private _capabilities: TerminalCapabilityStore;
  private _isDisposed = false;
  private _shellIntegrationAddon: ShellIntegrationAddon | undefined;
  private _container: HTMLElement | undefined;
  
  constructor(
    public readonly id: number,
    public readonly shellLaunchConfig: ITerminalLaunchConfig,
    private readonly configurationService: ITerminalConfigurationService,
    private readonly backend: ITerminalBackend
  ) {
    super();
    this._title = shellLaunchConfig.name || 'Terminal';
    this._capabilities = new TerminalCapabilityStore();
  }
  
  get title(): string {
    return this._title;
  }
  
  get icon(): string | undefined {
    return this._icon;
  }
  
  get color(): string | undefined {
    return this._color;
  }
  
  get processId(): number | undefined {
    return this._processId;
  }
  
  get processState(): ProcessState {
    return this._processManager?.processState || ProcessState.Uninitialized;
  }
  
  get areLinksReady(): boolean {
    return this._areLinksReady;
  }
  
  get capabilities(): ITerminalCapabilityStore {
    return this._capabilities;
  }
  
  get xterm(): XTerm | undefined {
    return this._xtermTerminal?.xterm;
  }
  
  get cols(): number {
    return this._cols;
  }
  
  get rows(): number {
    return this._rows;
  }
  
  get maxCols(): number {
    return 9999;
  }
  
  get maxRows(): number {
    return 9999;
  }
  
  get target(): TerminalLocation | undefined {
    return TerminalLocation.Panel;
  }
  
  get shellIntegration(): IShellIntegration | undefined {
    return this._shellIntegrationAddon;
  }
  
  get onDidChangeTitle() {
    return (listener: () => void) => {
      this.on('didChangeTitle', listener);
    };
  }
  
  get onDidChangeIcon() {
    return (listener: () => void) => {
      this.on('didChangeIcon', listener);
    };
  }
  
  get onDidChangeColor() {
    return (listener: () => void) => {
      this.on('didChangeColor', listener);
    };
  }
  
  get onDisposed() {
    return (listener: () => void) => {
      this.on('disposed', listener);
    };
  }
  
  get onLinksReady() {
    return (listener: () => void) => {
      this.on('linksReady', listener);
    };
  }
  
  get onDimensionsChanged() {
    return (listener: () => void) => {
      this.on('dimensionsChanged', listener);
    };
  }
  
  get onMaximumDimensionsChanged() {
    return (listener: () => void) => {
      this.on('maximumDimensionsChanged', listener);
    };
  }
  
  get onFocus() {
    return (listener: () => void) => {
      this.on('focus', listener);
    };
  }
  
  get onProcessIdReady() {
    return (listener: () => void) => {
      this.on('processIdReady', listener);
    };
  }
  
  get onTitleChanged() {
    return (listener: (title: string) => void) => {
      this.on('titleChanged', listener);
    };
  }
  
  get onData() {
    return (listener: (data: string) => void) => {
      this.on('data', listener);
    };
  }
  
  get onBinary() {
    return (listener: (data: string) => void) => {
      this.on('binary', listener);
    };
  }
  
  async initialize(): Promise<void> {
    // Create XTerm terminal
    this._xtermTerminal = new XtermTerminal(this.configurationService);
    await this._xtermTerminal.initialize();
    
    // Set up shell integration
    this._shellIntegrationAddon = new ShellIntegrationAddon(this._capabilities);
    this._xtermTerminal.xterm.loadAddon(this._shellIntegrationAddon);
    
    // Create process manager
    this._processManager = new TerminalProcessManager(
      this.backend,
      this.shellLaunchConfig,
      this._xtermTerminal
    );
    
    // Subscribe to process manager events
    this._processManager.onProcessReady(() => {
      this._processId = this._processManager!.shellProcessId;
      this.emit('processIdReady');
    });
    
    this._processManager.onProcessData((data: string) => {
      this._xtermTerminal!.write(data);
      this.emit('data', data);
    });
    
    this._processManager.onProcessExit((exitCode: number | undefined) => {
      this._xtermTerminal!.write(`\r\n[Process exited with code ${exitCode}]\r\n`);
    });
    
    // Subscribe to xterm events
    this._xtermTerminal.onData((data: string) => {
      this._processManager!.write(data);
    });
    
    this._xtermTerminal.onResize((dimensions: ITerminalDimensions) => {
      this._cols = dimensions.cols;
      this._rows = dimensions.rows;
      this._processManager!.setDimensions(dimensions.cols, dimensions.rows);
      this.emit('dimensionsChanged');
    });
    
    this._xtermTerminal.onTitleChange((title: string) => {
      this._title = title;
      this.emit('didChangeTitle');
      this.emit('titleChanged', title);
    });
    
    // Start the terminal process
    await this._processManager.createProcess(
      this.shellLaunchConfig,
      this._cols,
      this._rows
    );
    
    // Mark links as ready after a delay
    setTimeout(() => {
      this._areLinksReady = true;
      this.emit('linksReady');
    }, 500);
  }
  
  attachToElement(element: HTMLElement): void {
    if (this._container === element) {
      return;
    }
    
    this._container = element;
    if (this._xtermTerminal) {
      this._xtermTerminal.attachToElement(element);
    }
  }
  
  detachFromElement(): void {
    if (this._xtermTerminal && this._container) {
      this._xtermTerminal.detachFromElement();
    }
    this._container = undefined;
  }
  
  focus(force?: boolean): void {
    if (this._xtermTerminal) {
      this._xtermTerminal.focus();
      this.emit('focus');
    }
  }
  
  blur(): void {
    if (this._xtermTerminal) {
      this._xtermTerminal.blur();
    }
  }
  
  async paste(): Promise<void> {
    if (!this._xtermTerminal) {
      return;
    }
    
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        await this.sendText(text, false);
      }
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  }
  
  async sendText(text: string, addNewLine = false): Promise<void> {
    if (this._processManager) {
      const data = addNewLine ? text + '\r' : text;
      await this._processManager.write(data);
    }
  }
  
  async sendSequence(text: string): Promise<void> {
    await this.sendText(text, false);
  }
  
  async runCommand(command: string, addNewLine = true): Promise<void> {
    await this.sendText(command, addNewLine);
  }
  
  show(focus?: boolean): void {
    this.setVisible(true);
    if (focus) {
      this.focus();
    }
  }
  
  hide(): void {
    this.setVisible(false);
  }
  
  setVisible(visible: boolean): void {
    if (this._container) {
      this._container.style.display = visible ? 'block' : 'none';
    }
  }
  
  scrollDownLine(): void {
    this._xtermTerminal?.scrollDownLine();
  }
  
  scrollDownPage(): void {
    this._xtermTerminal?.scrollDownPage();
  }
  
  scrollToBottom(): void {
    this._xtermTerminal?.scrollToBottom();
  }
  
  scrollUpLine(): void {
    this._xtermTerminal?.scrollUpLine();
  }
  
  scrollUpPage(): void {
    this._xtermTerminal?.scrollUpPage();
  }
  
  scrollToTop(): void {
    this._xtermTerminal?.scrollToTop();
  }
  
  clearBuffer(): void {
    this._xtermTerminal?.clear();
  }
  
  clearSelection(): void {
    this._xtermTerminal?.clearSelection();
  }
  
  selectAll(): void {
    this._xtermTerminal?.selectAll();
  }
  
  async setDimensions(dimensions: ITerminalDimensions): Promise<void> {
    if (this._xtermTerminal) {
      this._cols = dimensions.cols;
      this._rows = dimensions.rows;
      this._xtermTerminal.setDimensions(dimensions);
      
      if (this._processManager) {
        await this._processManager.setDimensions(dimensions.cols, dimensions.rows);
      }
      
      this.emit('dimensionsChanged');
    }
  }
  
  async getInitialCwd(): Promise<string> {
    if (this._processManager) {
      return this._processManager.getInitialCwd();
    }
    return process.cwd();
  }
  
  async getCwd(): Promise<string> {
    const cwdCapability = this._capabilities.get('cwdDetection' as any);
    if (cwdCapability) {
      return (cwdCapability as any).getCwd();
    }
    return this.getInitialCwd();
  }
  
  async refreshProperty<T extends any>(property: T): Promise<any> {
    if (this._processManager) {
      return this._processManager.refreshProperty(property as any);
    }
    return undefined;
  }
  
  rename(title?: string): void {
    this._title = title || 'Terminal';
    this.emit('didChangeTitle');
    this.emit('titleChanged', this._title);
  }
  
  changeIcon(icon?: string): void {
    this._icon = icon;
    this.emit('didChangeIcon');
  }
  
  changeColor(color?: string): void {
    this._color = color;
    this.emit('didChangeColor');
  }
  
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    
    this._isDisposed = true;
    
    this.detachFromElement();
    
    if (this._processManager) {
      this._processManager.dispose();
    }
    
    if (this._xtermTerminal) {
      this._xtermTerminal.dispose();
    }
    
    this._capabilities = null as any;
    
    this.emit('disposed');
    this.removeAllListeners();
  }
}