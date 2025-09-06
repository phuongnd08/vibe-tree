/**
 * Terminal Common Types and Interfaces
 * Based on VSCode terminal architecture
 */

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

export interface ITerminalDimensions {
  cols: number;
  rows: number;
}

export interface ITerminalLaunchConfig {
  name?: string;
  shellPath?: string;
  shellArgs?: string[] | string;
  cwd?: string;
  env?: { [key: string]: string | null };
  strictEnv?: boolean;
  hideFromUser?: boolean;
  isFeatureTerminal?: boolean;
  isExtensionTerminal?: boolean;
  initialText?: string;
  waitOnExit?: boolean | string;
  ignoreConfigurationCwd?: boolean;
}

export interface ITerminalCapabilityStore {
  items: Map<TerminalCapability, any>;
  onDidAddCapability: (capability: TerminalCapability) => void;
  onDidRemoveCapability: (capability: TerminalCapability) => void;
  get<T extends TerminalCapability>(capability: T): ITerminalCapability<T> | undefined;
  has(capability: TerminalCapability): boolean;
}

export enum TerminalCapability {
  CwdDetection = 'cwdDetection',
  CommandDetection = 'commandDetection',
  NaiveCwdDetection = 'naiveCwdDetection',
  PartialCommandDetection = 'partialCommandDetection',
  BufferMarkDetection = 'bufferMarkDetection'
}

export interface ITerminalCapability<T extends TerminalCapability = TerminalCapability> {
  type: T;
  onDidChange?: () => void;
}

export interface ICommandDetectionCapability extends ITerminalCapability<TerminalCapability.CommandDetection> {
  readonly commands: readonly ITerminalCommand[];
  readonly executingCommand: string | undefined;
  readonly executingCommandObject: ITerminalCommand | undefined;
  readonly currentCommand: ICurrentPartialCommand | undefined;
  readonly onCommandStarted: (command: ITerminalCommand) => void;
  readonly onCommandFinished: (command: ITerminalCommand) => void;
  readonly onCommandExecuted: (command: ITerminalCommand) => void;
  readonly onCommandInvalidated: (commands: ITerminalCommand[]) => void;
  readonly onCurrentCommandInvalidated: (request: ICurrentCommandInvalidateRequest) => void;
  setCwd(cwd: string): void;
  setIsWindowsPty(isWindowsPty: boolean): void;
  setIsCommandStorageDisabled(): void;
  handlePromptStart(options?: IHandleCommandOptions): void;
  handleContinuationStart(): void;
  handleContinuationEnd(): void;
  handleRightPromptStart(): void;
  handleRightPromptEnd(): void;
  handleCommandStart(options?: IHandleCommandOptions): void;
  handleCommandExecuted(options?: IHandleCommandOptions): void;
  handleCommandFinished(exitCode?: number, options?: IHandleCommandOptions): void;
  invalidateCurrentCommand(request: ICurrentCommandInvalidateRequest): void;
  setContinuationPrompt(value: string): void;
  serialize(): ISerializedCommandDetectionCapability;
  deserialize(serialized: ISerializedCommandDetectionCapability): void;
}

export interface ITerminalCommand {
  command: string;
  isTrusted: boolean;
  timestamp: number;
  cwd?: string;
  exitCode?: number;
  duration?: number;
  marker?: IXtermMarker;
  endMarker?: IXtermMarker;
  executedMarker?: IXtermMarker;
  commandStartLineContent?: string;
  getOutput(): string | undefined;
  getOutputMatch(outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined;
  hasOutput(): boolean;
}

export interface ICurrentPartialCommand {
  commandStartMarker?: IXtermMarker;
  commandStartX?: number;
  commandStartLineContent?: string;
  commandRightPromptStartX?: number;
  commandRightPromptEndX?: number;
  commandExecutedMarker?: IXtermMarker;
  commandExecutedX?: number;
  commandFinishedMarker?: IXtermMarker;
  currentContinuationMarker?: IXtermMarker;
  continuations?: { marker: IXtermMarker; end: number }[];
  command?: string;
  isTrusted?: boolean;
  cwd?: string;
  commandExecutedTimestamp?: number;
  commandFinishedTimestamp?: number;
  executedCommandLineContent?: string;
  dirtyCommandLines?: Set<number>;
}

export interface IHandleCommandOptions {
  ignoreCommandLine?: boolean;
  marker?: IXtermMarker;
  markProperties?: IMarkProperties;
}

export interface ICurrentCommandInvalidateRequest {
  reason: CommandInvalidationReason;
  getCancelPositionY?(): number | undefined;
}

export enum CommandInvalidationReason {
  Windows = 'windows',
  NoProblemsReported = 'noProblemsReported'
}

export interface ISerializedCommandDetectionCapability {
  isWindowsPty: boolean;
  commands: ISerializedTerminalCommand[];
}

export interface ISerializedTerminalCommand {
  command: string;
  isTrusted: boolean;
  cwd: string | undefined;
  exitCode: number | undefined;
  commandStartLineContent: string | undefined;
  timestamp: number;
  startLine: number | undefined;
  startX: number | undefined;
  endLine: number | undefined;
  endX: number | undefined;
  executedLine: number | undefined;
  executedX: number | undefined;
}

export interface ITerminalOutputMatcher {
  lineMatcher: string | RegExp;
  anchor?: 'top' | 'bottom';
  offset?: number;
  length?: number;
}

export interface ITerminalOutputMatch {
  regexMatch: RegExpMatchArray | null;
  outputLines: string[];
}

export interface IXtermMarker {
  readonly id: number;
  readonly isDisposed: boolean;
  readonly line: number;
  dispose(): void;
  onDispose(listener: () => void): void;
}

export interface IMarkProperties {
  hoverMessage?: string;
  disableCommandStorage?: boolean;
  hidden?: boolean;
}

export interface ICwdDetectionCapability extends ITerminalCapability<TerminalCapability.CwdDetection> {
  readonly cwd: string;
  readonly onDidChangeCwd: (cwd: string) => void;
  updateCwd(cwd: string): void;
  getCwd(): Promise<string>;
}

export interface IBufferMarkCapability extends ITerminalCapability<TerminalCapability.BufferMarkDetection> {
  markers(): IterableIterator<IMarker>;
  onMarkAdded: (mark: IMarker) => void;
}

export interface IMarker extends IXtermMarker {
  id: number;
  offset: number;
}

export interface IShellIntegration {
  readonly capabilities: ITerminalCapabilityStore;
  readonly status: ShellIntegrationStatus;
  readonly onDidChangeStatus: (status: ShellIntegrationStatus) => void;
  readonly deserializer?: ITerminalCapabilityImports;
}

export enum ShellIntegrationStatus {
  Off,
  FinalTerm,
  VSCode
}

export interface ITerminalCapabilityImports {
  cwdDetection?: ICwdDetectionCapability;
  commandDetection?: ICommandDetectionCapability;
}

export interface ITerminalProcessManager {
  readonly processState: ProcessState;
  readonly ptyProcessReady: Promise<void>;
  readonly shellProcessId: number | undefined;
  readonly remoteAuthority: string | undefined;
  readonly os: OperatingSystem | undefined;
  readonly userHome: string | undefined;
  readonly environmentVariableInfo: IEnvironmentVariableInfo | undefined;
  readonly persistentProcessId: number | undefined;
  readonly shouldPersist: boolean;
  readonly hasWrittenData: boolean;
  readonly reconnectionProperties: IReconnectionProperties | undefined;
  readonly hasChildProcesses: boolean;
  readonly onPtyDisconnect: () => void;
  readonly onPtyReconnect: () => void;
  readonly onProcessReady: () => void;
  readonly onBeforeProcessData: (data: string) => void;
  readonly onProcessData: (data: string) => void;
  readonly onEnvironmentVariableInfoChanged: (info: IEnvironmentVariableInfo) => void;
  readonly onProcessExit: (exitCode: number | undefined) => void;
  readonly onRestoreCommands: (commands: ISerializedCommandDetectionCapability) => void;
  dispose(): void;
  detachFromProcess(forcePersist?: boolean): Promise<void>;
  createProcess(shellLaunchConfig: ITerminalLaunchConfig, cols: number, rows: number): Promise<void>;
  relaunch(shellLaunchConfig: ITerminalLaunchConfig, cols: number, rows: number, reset: boolean): Promise<void>;
  write(data: string): Promise<void>;
  setDimensions(cols: number, rows: number): Promise<void>;
  setDimensions(cols: number, rows: number, sync: false): Promise<void>;
  setDimensions(cols: number, rows: number, sync: true): void;
  setUnicodeVersion(version: '6' | '11'): Promise<void>;
  acknowledgeDataEvent(charCount: number): void;
  processPtyWrite(): void;
  freePortKillProcess(port: string, processId: number): Promise<{ port: string; processId: number }>;
  getBackendOS(): Promise<OperatingSystem>;
  getShellEnvironment(): Promise<typeof process.env>;
  getDefaultSystemShell(os: OperatingSystem): Promise<string>;
  getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]>;
  getEnvironment(): Promise<typeof process.env>;
  getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string>;
  setNativeDelegate(nativeDelegate: ITerminalProcessHost): void;
  installAutoReply(match: string, reply: string): void;
  uninstallAutoReply(match: string): void;
  getInitialCwd(): Promise<string>;
  refreshProperty<T extends ProcessPropertyType>(property: T): Promise<IProcessPropertyMap[T]>;
  updateProperty<T extends ProcessPropertyType>(property: T, value: IProcessPropertyMap[T]): Promise<void>;
}

export enum ProcessState {
  Uninitialized = 1,
  Launching = 2,
  Running = 3,
  KilledDuringLaunch = 4,
  KilledByUser = 5,
  KilledByProcess = 6
}

export interface IEnvironmentVariableInfo {
  requiresAction: boolean;
}

export interface IReconnectionProperties {
  reconnectionToken: string;
  reconnectionId: string;
  ownerId: string;
}

export enum OperatingSystem {
  Windows = 1,
  Macintosh = 2,
  Linux = 3
}

export interface ITerminalProcessHost {
  onPtyHostExit?: () => void;
  onPtyHostStart?: () => void;
  onPtyHostUnresponsive?: () => void;
  onPtyHostResponsive?: () => void;
  onPtyHostRequestResolveVariables?: (e: IRequestResolveVariablesEvent) => void;
  getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]>;
  getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string>;
  getEnvironment(): Promise<typeof process.env>;
  getDefaultSystemShell(os: OperatingSystem): Promise<string>;
  getShellEnvironment(): Promise<typeof process.env>;
}

export interface IRequestResolveVariablesEvent {
  requestId: number;
  workspaceId: string;
}

export enum ProcessPropertyType {
  Cwd = 'cwd',
  InitialCwd = 'initialCwd',
  FixedDimensions = 'fixedDimensions',
  Title = 'title',
  ShellType = 'shellType',
  HasChildProcesses = 'hasChildProcesses',
  ResolvedShellLaunchConfig = 'resolvedShellLaunchConfig',
  OverrideDimensions = 'overrideDimensions',
  FailedShellIntegrationActivation = 'failedShellIntegrationActivation',
  UsedShellIntegrationInjection = 'usedShellIntegrationInjection'
}

export interface IProcessPropertyMap {
  [ProcessPropertyType.Cwd]: string;
  [ProcessPropertyType.InitialCwd]: string;
  [ProcessPropertyType.FixedDimensions]: ITerminalDimensions;
  [ProcessPropertyType.Title]: string;
  [ProcessPropertyType.ShellType]: TerminalShellType | undefined;
  [ProcessPropertyType.HasChildProcesses]: boolean;
  [ProcessPropertyType.ResolvedShellLaunchConfig]: ITerminalLaunchConfig;
  [ProcessPropertyType.OverrideDimensions]: ITerminalDimensions | undefined;
  [ProcessPropertyType.FailedShellIntegrationActivation]: boolean;
  [ProcessPropertyType.UsedShellIntegrationInjection]: boolean | undefined;
}

export enum TerminalShellType {
  Cmd = 'cmd',
  PowerShell = 'pwsh',
  Bash = 'bash',
  Zsh = 'zsh',
  Fish = 'fish'
}