import { Emitter, Event } from 'vscode-jsonrpc';
import {
  ITerminalConfigurationService,
  ITerminalConfiguration,
  ITerminalTheme
} from '../common/terminal';

export class TerminalConfigurationService implements ITerminalConfigurationService {
  private _config: ITerminalConfiguration;
  
  private readonly _onConfigChanged = new Emitter<void>();
  readonly onConfigChanged: Event<void> = this._onConfigChanged.event;
  
  constructor(config?: Partial<ITerminalConfiguration>) {
    this._config = this._getDefaultConfiguration();
    
    if (config) {
      this._config = { ...this._config, ...config };
    }
    
    this._loadUserConfiguration();
  }
  
  get config(): ITerminalConfiguration {
    return { ...this._config };
  }
  
  private _getDefaultConfiguration(): ITerminalConfiguration {
    const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
    const isMac = typeof process !== 'undefined' && process.platform === 'darwin';
    
    return {
      fontFamily: this._getDefaultFontFamily(),
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      tabStopWidth: 8,
      bellDuration: 100,
      bellSound: null,
      macOptionIsMeta: isMac,
      rightClickSelectsWord: !isWindows,
      copyOnSelection: false,
      drawBoldTextInBrightColors: true,
      fastScrollSensitivity: 5,
      theme: this._getDefaultTheme()
    };
  }
  
  private _getDefaultFontFamily(): string {
    const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
    const isMac = typeof process !== 'undefined' && process.platform === 'darwin';
    
    if (isMac) {
      return 'Menlo, Monaco, "Courier New", monospace';
    } else if (isWindows) {
      return 'Consolas, "Courier New", monospace';
    } else {
      return '"Droid Sans Mono", "monospace", monospace';
    }
  }
  
  private _getDefaultTheme(): ITerminalTheme {
    const isDarkMode = this._isDarkMode();
    
    if (isDarkMode) {
      return {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#3a3d41',
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
    } else {
      return {
        background: '#ffffff',
        foreground: '#333333',
        cursor: '#000000',
        cursorAccent: '#ffffff',
        selectionBackground: '#b5b5b5',
        black: '#000000',
        red: '#cd3131',
        green: '#00bc00',
        yellow: '#949800',
        blue: '#0451a5',
        magenta: '#bc05bc',
        cyan: '#0598bc',
        white: '#555555',
        brightBlack: '#666666',
        brightRed: '#cd3131',
        brightGreen: '#14ce14',
        brightYellow: '#b5ba00',
        brightBlue: '#0451a5',
        brightMagenta: '#bc05bc',
        brightCyan: '#0598bc',
        brightWhite: '#a5a5a5'
      };
    }
  }
  
  private _isDarkMode(): boolean {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  }
  
  private _loadUserConfiguration(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const storedConfig = localStorage.getItem('terminal-config');
        if (storedConfig) {
          const userConfig = JSON.parse(storedConfig);
          this._config = { ...this._config, ...userConfig };
        }
      } catch (error) {
        console.error('Failed to load terminal configuration:', error);
      }
    }
  }
  
  private _saveUserConfiguration(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('terminal-config', JSON.stringify(this._config));
      } catch (error) {
        console.error('Failed to save terminal configuration:', error);
      }
    }
  }
  
  getDefaultShell(): string {
    const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
    
    if (isWindows) {
      return process.env.COMSPEC || 'cmd.exe';
    }
    
    return process.env.SHELL || '/bin/bash';
  }
  
  getDefaultShellArgs(): string[] | string {
    const shell = this.getDefaultShell();
    
    if (shell.includes('zsh') || shell.includes('bash')) {
      return ['-l'];
    }
    
    return [];
  }
  
  getFontFamily(): string {
    return this._config.fontFamily;
  }
  
  getFontSize(): number {
    return this._config.fontSize;
  }
  
  getLineHeight(): number {
    return this._config.lineHeight;
  }
  
  getCursorBlink(): boolean {
    return this._config.cursorBlink;
  }
  
  getCursorStyle(): string {
    return this._config.cursorStyle;
  }
  
  getScrollback(): number {
    return this._config.scrollback;
  }
  
  getTabStopWidth(): number {
    return this._config.tabStopWidth;
  }
  
  updateConfiguration(config: Partial<ITerminalConfiguration>): void {
    const oldConfig = { ...this._config };
    this._config = { ...this._config, ...config };
    
    if (JSON.stringify(oldConfig) !== JSON.stringify(this._config)) {
      this._saveUserConfiguration();
      this._onConfigChanged.fire();
    }
  }
  
  updateTheme(theme: Partial<ITerminalTheme>): void {
    this._config.theme = { ...this._config.theme, ...theme };
    this._saveUserConfiguration();
    this._onConfigChanged.fire();
  }
  
  resetConfiguration(): void {
    this._config = this._getDefaultConfiguration();
    this._saveUserConfiguration();
    this._onConfigChanged.fire();
  }
  
  dispose(): void {
    this._onConfigChanged.dispose();
  }
}