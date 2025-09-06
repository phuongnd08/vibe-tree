/**
 * Terminal Configuration Service
 * Terminal configuration management (based on VSCode architecture)
 */

import { EventEmitter } from 'events';

export interface ITerminalConfigurationService {
  readonly config: ITerminalConfiguration;
  readonly onConfigurationChanged: (listener: (config: ITerminalConfiguration) => void) => void;
  
  get<T>(key: string): T | undefined;
  update(key: string, value: any): void;
  updateConfiguration(config: Partial<ITerminalConfiguration>): void;
  getDefaultShell(): string;
  getDefaultShellArgs(): string | string[];
  getFontFamily(): string;
  getFontSize(): number;
  getLineHeight(): number;
  getLetterSpacing(): number;
  getCursorStyle(): 'block' | 'underline' | 'bar';
  getCursorBlink(): boolean;
  getScrollback(): number;
  getFastScrollSensitivity(): number;
  getTheme(): ITerminalTheme;
  getRightClickBehavior(): 'default' | 'copyPaste' | 'paste' | 'selectWord';
  getMiddleClickBehavior(): 'default' | 'paste';
  getMacOptionIsMeta(): boolean;
  getMacOptionClickForcesSelection(): boolean;
  getRendererType(): 'auto' | 'canvas' | 'dom' | 'webgl';
  getEnvironmentVariables(): Record<string, string>;
  getConfirmOnExit(): 'never' | 'always' | 'hasChildProcesses';
  getEnableBell(): boolean;
  getWordSeparators(): string;
  getWindowsEnableConpty(): boolean;
  getInheritEnv(): boolean;
  getShowExitAlert(): boolean;
  getSplitCwd(): 'workspaceRoot' | 'initial' | 'inherited';
  getWindowsEnableConpty(): boolean;
  getGpuAcceleration(): 'auto' | 'on' | 'canvas' | 'off';
  getRightClickSelectsWord(): boolean;
  getEnableFileLinks(): boolean;
  getUnicodeVersion(): '6' | '11';
  getLocalEchoEnabled(): 'auto' | 'on' | 'off';
  getLocalEchoLatencyThreshold(): number;
  getLocalEchoExcludePrograms(): string[];
  getLocalEchoStyle(): 'bold' | 'dim' | 'italic' | 'underlined' | 'inverted';
  getPersistentSessionReviveProcess(): 'onExit' | 'onExitAndWindowClose' | 'never';
  getIgnoreProcessNames(): string[];
  getAutoReplies(): Record<string, string>;
  getShellIntegrationEnabled(): boolean;
  getShellIntegrationDecorationIconSuccess(): string;
  getShellIntegrationDecorationIconError(): string;
  getCommandsToSkipShell(): string[];
  getAllowChords(): boolean;
  getAllowMnemonics(): boolean;
  getTabStopWidth(): number;
  getMinimumContrastRatio(): number;
  getSmoothScrollDuration(): number;
}

export interface ITerminalConfiguration {
  shell?: {
    linux?: string;
    osx?: string;
    windows?: string;
  };
  shellArgs?: {
    linux?: string | string[];
    osx?: string | string[];
    windows?: string | string[];
  };
  profiles?: {
    linux?: Record<string, ITerminalProfile>;
    osx?: Record<string, ITerminalProfile>;
    windows?: Record<string, ITerminalProfile>;
  };
  defaultProfile?: {
    linux?: string;
    osx?: string;
    windows?: string;
  };
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  fontWeight?: string;
  fontWeightBold?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  scrollback?: number;
  fastScrollSensitivity?: number;
  rightClickBehavior?: 'default' | 'copyPaste' | 'paste' | 'selectWord';
  middleClickBehavior?: 'default' | 'paste';
  macOptionIsMeta?: boolean;
  macOptionClickForcesSelection?: boolean;
  rendererType?: 'auto' | 'canvas' | 'dom' | 'webgl';
  theme?: ITerminalTheme;
  env?: {
    linux?: Record<string, string>;
    osx?: Record<string, string>;
    windows?: Record<string, string>;
  };
  confirmOnExit?: 'never' | 'always' | 'hasChildProcesses';
  enableBell?: boolean;
  wordSeparators?: string;
  windowsEnableConpty?: boolean;
  inheritEnv?: boolean;
  showExitAlert?: boolean;
  splitCwd?: 'workspaceRoot' | 'initial' | 'inherited';
  gpuAcceleration?: 'auto' | 'on' | 'canvas' | 'off';
  rightClickSelectsWord?: boolean;
  enableFileLinks?: boolean;
  unicodeVersion?: '6' | '11';
  localEchoEnabled?: 'auto' | 'on' | 'off';
  localEchoLatencyThreshold?: number;
  localEchoExcludePrograms?: string[];
  localEchoStyle?: 'bold' | 'dim' | 'italic' | 'underlined' | 'inverted';
  persistentSessionReviveProcess?: 'onExit' | 'onExitAndWindowClose' | 'never';
  ignoreProcessNames?: string[];
  autoReplies?: Record<string, string>;
  shellIntegration?: {
    enabled?: boolean;
    decorationsEnabled?: 'both' | 'gutter' | 'overviewRuler' | 'never';
    decorationIconSuccess?: string;
    decorationIconError?: string;
  };
  commandsToSkipShell?: string[];
  allowChords?: boolean;
  allowMnemonics?: boolean;
  tabStopWidth?: number;
  minimumContrastRatio?: number;
  smoothScrollDuration?: number;
}

export interface ITerminalProfile {
  path?: string;
  args?: string | string[];
  env?: Record<string, string>;
  icon?: string;
  color?: string;
  overrideName?: boolean;
}

export interface ITerminalTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  selectionInactiveBackground?: string;
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

export class TerminalConfigurationService extends EventEmitter implements ITerminalConfigurationService {
  private static instance: TerminalConfigurationService;
  private _config: ITerminalConfiguration;
  
  constructor(initialConfig?: ITerminalConfiguration) {
    super();
    this._config = this._getDefaultConfig();
    if (initialConfig) {
      this._config = { ...this._config, ...initialConfig };
    }
  }
  
  static getInstance(initialConfig?: ITerminalConfiguration): TerminalConfigurationService {
    if (!TerminalConfigurationService.instance) {
      TerminalConfigurationService.instance = new TerminalConfigurationService(initialConfig);
    }
    return TerminalConfigurationService.instance;
  }
  
  get config(): ITerminalConfiguration {
    return { ...this._config };
  }
  
  get onConfigurationChanged() {
    return (listener: (config: ITerminalConfiguration) => void) => {
      this.on('configurationChanged', listener);
    };
  }
  
  private _getDefaultConfig(): ITerminalConfiguration {
    const platform = this._getPlatform();
    
    return {
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1,
      letterSpacing: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      cursorStyle: 'block',
      cursorBlink: false,
      scrollback: 10000,
      fastScrollSensitivity: 5,
      rightClickBehavior: 'default',
      middleClickBehavior: 'paste',
      macOptionIsMeta: false,
      macOptionClickForcesSelection: false,
      rendererType: 'auto',
      confirmOnExit: 'never',
      enableBell: true,
      wordSeparators: ' ()[]{}\'":,.;<>~!@#$%^&*|+=`',
      windowsEnableConpty: true,
      inheritEnv: true,
      showExitAlert: true,
      splitCwd: 'inherited',
      gpuAcceleration: 'auto',
      rightClickSelectsWord: true,
      enableFileLinks: true,
      unicodeVersion: '11',
      localEchoEnabled: 'auto',
      localEchoLatencyThreshold: 30,
      localEchoExcludePrograms: ['vim', 'vi', 'nano', 'tmux'],
      localEchoStyle: 'dim',
      persistentSessionReviveProcess: 'onExit',
      ignoreProcessNames: [],
      autoReplies: {},
      shellIntegration: {
        enabled: true,
        decorationsEnabled: 'both',
        decorationIconSuccess: '✓',
        decorationIconError: '✗'
      },
      commandsToSkipShell: [],
      allowChords: true,
      allowMnemonics: true,
      tabStopWidth: 8,
      minimumContrastRatio: 1,
      smoothScrollDuration: 0,
      theme: this._getDefaultTheme()
    };
  }
  
  private _getDefaultTheme(): ITerminalTheme {
    return {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#ffffff',
      cursorAccent: '#000000',
      selectionBackground: '#3a3d41',
      selectionForeground: undefined,
      selectionInactiveBackground: '#3a3d41',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5'
    };
  }
  
  private _getPlatform(): 'linux' | 'osx' | 'windows' {
    if (process.platform === 'win32') {
      return 'windows';
    } else if (process.platform === 'darwin') {
      return 'osx';
    } else {
      return 'linux';
    }
  }
  
  get<T>(key: string): T | undefined {
    const keys = key.split('.');
    let value: any = this._config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value as T;
  }
  
  update(key: string, value: any): void {
    const keys = key.split('.');
    let target: any = this._config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }
    
    target[keys[keys.length - 1]] = value;
    this.emit('configurationChanged', this._config);
  }
  
  updateConfiguration(config: Partial<ITerminalConfiguration>): void {
    this._config = { ...this._config, ...config };
    this.emit('configurationChanged', this._config);
  }
  
  getDefaultShell(): string {
    const platform = this._getPlatform();
    const shellConfig = this._config.shell?.[platform];
    
    if (shellConfig) {
      return shellConfig;
    }
    
    if (platform === 'windows') {
      return process.env.COMSPEC || 'cmd.exe';
    } else {
      return process.env.SHELL || '/bin/bash';
    }
  }
  
  getDefaultShellArgs(): string | string[] {
    const platform = this._getPlatform();
    return this._config.shellArgs?.[platform] || [];
  }
  
  getFontFamily(): string {
    return this._config.fontFamily || 'Menlo, Monaco, "Courier New", monospace';
  }
  
  getFontSize(): number {
    return this._config.fontSize || 14;
  }
  
  getLineHeight(): number {
    return this._config.lineHeight || 1;
  }
  
  getLetterSpacing(): number {
    return this._config.letterSpacing || 0;
  }
  
  getCursorStyle(): 'block' | 'underline' | 'bar' {
    return this._config.cursorStyle || 'block';
  }
  
  getCursorBlink(): boolean {
    return this._config.cursorBlink ?? false;
  }
  
  getScrollback(): number {
    return this._config.scrollback || 10000;
  }
  
  getFastScrollSensitivity(): number {
    return this._config.fastScrollSensitivity || 5;
  }
  
  getTheme(): ITerminalTheme {
    return this._config.theme || this._getDefaultTheme();
  }
  
  getRightClickBehavior(): 'default' | 'copyPaste' | 'paste' | 'selectWord' {
    return this._config.rightClickBehavior || 'default';
  }
  
  getMiddleClickBehavior(): 'default' | 'paste' {
    return this._config.middleClickBehavior || 'paste';
  }
  
  getMacOptionIsMeta(): boolean {
    return this._config.macOptionIsMeta ?? false;
  }
  
  getMacOptionClickForcesSelection(): boolean {
    return this._config.macOptionClickForcesSelection ?? false;
  }
  
  getRendererType(): 'auto' | 'canvas' | 'dom' | 'webgl' {
    return this._config.rendererType || 'auto';
  }
  
  getEnvironmentVariables(): Record<string, string> {
    const platform = this._getPlatform();
    return this._config.env?.[platform] || {};
  }
  
  getConfirmOnExit(): 'never' | 'always' | 'hasChildProcesses' {
    return this._config.confirmOnExit || 'never';
  }
  
  getEnableBell(): boolean {
    return this._config.enableBell ?? true;
  }
  
  getWordSeparators(): string {
    return this._config.wordSeparators || ' ()[]{}\'":,.;<>~!@#$%^&*|+=`';
  }
  
  getWindowsEnableConpty(): boolean {
    return this._config.windowsEnableConpty ?? true;
  }
  
  getInheritEnv(): boolean {
    return this._config.inheritEnv ?? true;
  }
  
  getShowExitAlert(): boolean {
    return this._config.showExitAlert ?? true;
  }
  
  getSplitCwd(): 'workspaceRoot' | 'initial' | 'inherited' {
    return this._config.splitCwd || 'inherited';
  }
  
  getGpuAcceleration(): 'auto' | 'on' | 'canvas' | 'off' {
    return this._config.gpuAcceleration || 'auto';
  }
  
  getRightClickSelectsWord(): boolean {
    return this._config.rightClickSelectsWord ?? true;
  }
  
  getEnableFileLinks(): boolean {
    return this._config.enableFileLinks ?? true;
  }
  
  getUnicodeVersion(): '6' | '11' {
    return this._config.unicodeVersion || '11';
  }
  
  getLocalEchoEnabled(): 'auto' | 'on' | 'off' {
    return this._config.localEchoEnabled || 'auto';
  }
  
  getLocalEchoLatencyThreshold(): number {
    return this._config.localEchoLatencyThreshold || 30;
  }
  
  getLocalEchoExcludePrograms(): string[] {
    return this._config.localEchoExcludePrograms || ['vim', 'vi', 'nano', 'tmux'];
  }
  
  getLocalEchoStyle(): 'bold' | 'dim' | 'italic' | 'underlined' | 'inverted' {
    return this._config.localEchoStyle || 'dim';
  }
  
  getPersistentSessionReviveProcess(): 'onExit' | 'onExitAndWindowClose' | 'never' {
    return this._config.persistentSessionReviveProcess || 'onExit';
  }
  
  getIgnoreProcessNames(): string[] {
    return this._config.ignoreProcessNames || [];
  }
  
  getAutoReplies(): Record<string, string> {
    return this._config.autoReplies || {};
  }
  
  getShellIntegrationEnabled(): boolean {
    return this._config.shellIntegration?.enabled ?? true;
  }
  
  getShellIntegrationDecorationIconSuccess(): string {
    return this._config.shellIntegration?.decorationIconSuccess || '✓';
  }
  
  getShellIntegrationDecorationIconError(): string {
    return this._config.shellIntegration?.decorationIconError || '✗';
  }
  
  getCommandsToSkipShell(): string[] {
    return this._config.commandsToSkipShell || [];
  }
  
  getAllowChords(): boolean {
    return this._config.allowChords ?? true;
  }
  
  getAllowMnemonics(): boolean {
    return this._config.allowMnemonics ?? true;
  }
  
  getTabStopWidth(): number {
    return this._config.tabStopWidth || 8;
  }
  
  getMinimumContrastRatio(): number {
    return this._config.minimumContrastRatio || 1;
  }
  
  getSmoothScrollDuration(): number {
    return this._config.smoothScrollDuration || 0;
  }
}