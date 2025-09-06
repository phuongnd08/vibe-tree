import { Event } from 'vscode-jsonrpc';
import { Terminal as XTerm } from '@xterm/xterm';

export enum TerminalLocation {
  Panel = 'panel',
  Editor = 'editor',
  Split = 'split'
}

export enum TerminalConnectionState {
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected'
}

export interface IShellLaunchConfig {
  name?: string;
  executable?: string;
  args?: string[] | string;
  cwd?: string;
  env?: { [key: string]: string | null };
  strictEnv?: boolean;
  hideFromUser?: boolean;
  isExtensionOwnedTerminal?: boolean;
  icon?: string;
  color?: string;
  initialText?: string;
  waitOnExit?: boolean | string;
  disablePersistence?: boolean;
}

export interface ITerminalDimensions {
  cols: number;
  rows: number;
}

export interface ITerminalProcessManager {
  readonly processId: number | undefined;
  readonly shellLaunchConfig: IShellLaunchConfig;
  readonly onProcessData: Event<string>;
  readonly onProcessExit: Event<number | undefined>;
  readonly onProcessReady: Event<{ pid: number; cwd: string }>;
  readonly onProcessTitleChanged: Event<string>;
  
  createProcess(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  acknowledgeDataEvent(charCount: number): void;
  kill(immediate?: boolean): void;
  dispose(): void;
}

export interface ITerminalInstance {
  readonly id: number;
  readonly cols: number;
  readonly rows: number;
  readonly title: string;
  readonly processId: number | undefined;
  readonly shellLaunchConfig: IShellLaunchConfig;
  readonly xterm: XTerm | undefined;
  readonly onDisposed: Event<void>;
  readonly onTitleChanged: Event<string>;
  readonly onDimensionsChanged: Event<void>;
  readonly onFocused: Event<void>;
  readonly onProcessIdReady: Event<void>;
  readonly onLinksReady: Event<void>;
  readonly onRequestExtHostProcess: Event<void>;
  
  attachToElement(container: HTMLElement): Promise<void>;
  focus(force?: boolean): void;
  sendText(text: string, addNewLine?: boolean): void;
  paste(): Promise<void>;
  clear(): void;
  clearBuffer(): void;
  dispose(): void;
  kill(immediate?: boolean): void;
  resize(): void;
  setDimensions(dimensions: ITerminalDimensions): void;
  addDisposable(disposable: any): void;
  toggleEscapeSequenceLogging(): void;
}

export interface ITerminalGroup {
  readonly activeInstance: ITerminalInstance | undefined;
  readonly instances: ITerminalInstance[];
  readonly onDisposed: Event<void>;
  readonly onInstancesChanged: Event<void>;
  readonly onActiveInstanceChanged: Event<ITerminalInstance | undefined>;
  
  addInstance(instance: ITerminalInstance): void;
  removeInstance(instance: ITerminalInstance): void;
  setActiveInstance(instance: ITerminalInstance): void;
  split(instance: ITerminalInstance): ITerminalInstance | undefined;
  dispose(): void;
}

export interface ITerminalService {
  readonly _serviceBrand: undefined;
  readonly instances: ITerminalInstance[];
  readonly activeInstance: ITerminalInstance | undefined;
  readonly connectionState: TerminalConnectionState;
  readonly onDidChangeActiveInstance: Event<ITerminalInstance | undefined>;
  readonly onDidCreateInstance: Event<ITerminalInstance>;
  readonly onDidDisposeInstance: Event<ITerminalInstance>;
  readonly onDidChangeInstanceDimensions: Event<ITerminalInstance>;
  readonly onDidChangeInstanceTitle: Event<ITerminalInstance>;
  readonly onDidChangeConnectionState: Event<void>;
  
  createTerminal(options?: IShellLaunchConfig): Promise<ITerminalInstance>;
  getInstanceFromId(terminalId: number): ITerminalInstance | undefined;
  setActiveInstance(instance: ITerminalInstance): void;
  splitInstance(instance: ITerminalInstance): Promise<ITerminalInstance | undefined>;
  dispose(): void;
}

export interface ITerminalBackend {
  readonly remoteAuthority: string | undefined;
  
  createProcess(
    shellLaunchConfig: IShellLaunchConfig,
    cwd: string,
    cols: number,
    rows: number,
    env: { [key: string]: string | null },
    windowsEnableConpty: boolean,
    shouldPersist: boolean
  ): Promise<number>;
  
  attachToProcess(id: number): Promise<void>;
  listProcesses(): Promise<Array<{ id: number; title: string }>>;
  updateTitle(processId: number, title: string, titleSource: string): Promise<void>;
  updateIcon(processId: number, icon: string, color?: string): Promise<void>;
  getDefaultSystemShell(os: string): Promise<string>;
  getShellEnvironment(): Promise<{ [key: string]: string }>;
  setTerminalLayoutInfo(layoutInfo: any): Promise<void>;
  getTerminalLayoutInfo(): Promise<any>;
}

export interface ITerminalConfigurationService {
  readonly config: ITerminalConfiguration;
  readonly onConfigChanged: Event<void>;
  
  getDefaultShell(): string;
  getDefaultShellArgs(): string[] | string;
  getFontFamily(): string;
  getFontSize(): number;
  getLineHeight(): number;
  getCursorBlink(): boolean;
  getCursorStyle(): string;
  getScrollback(): number;
  getTabStopWidth(): number;
}

export interface ITerminalConfiguration {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorBlink: boolean;
  cursorStyle: 'block' | 'underline' | 'bar';
  scrollback: number;
  tabStopWidth: number;
  bellDuration: number;
  bellSound: string | null;
  macOptionIsMeta: boolean;
  rightClickSelectsWord: boolean;
  copyOnSelection: boolean;
  drawBoldTextInBrightColors: boolean;
  fastScrollSensitivity: number;
  theme: ITerminalTheme;
}

export interface ITerminalTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface ITerminalProfile {
  profileName: string;
  path: string;
  args?: string[] | string;
  env?: { [key: string]: string | null };
  icon?: string;
  color?: string;
  overrideName?: boolean;
  isAutoDetected?: boolean;
}

export interface ITerminalProfileService {
  readonly availableProfiles: ITerminalProfile[];
  readonly defaultProfile: ITerminalProfile | undefined;
  readonly onDidChangeAvailableProfiles: Event<ITerminalProfile[]>;
  
  getDefaultProfile(): ITerminalProfile | undefined;
  getAvailableProfiles(): Promise<ITerminalProfile[]>;
  createContributedTerminalProfile(extensionIdentifier: string, id: string, options: any): Promise<void>;
}