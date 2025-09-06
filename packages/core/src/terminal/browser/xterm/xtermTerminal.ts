/**
 * XTerm Terminal Wrapper
 * Wrapper around xterm.js library (based on VSCode architecture)
 */

import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { ITerminalDimensions } from '../../common/terminal';
import { ITerminalConfigurationService } from '../terminalConfigurationService';

export class XtermTerminal {
  private _xterm: XTerm | undefined;
  private _fitAddon: FitAddon | undefined;
  private _serializeAddon: SerializeAddon | undefined;
  private _searchAddon: SearchAddon | undefined;
  private _webglAddon: WebglAddon | undefined;
  private _container: HTMLElement | undefined;
  private _onDataListeners: Array<(data: string) => void> = [];
  private _onResizeListeners: Array<(dimensions: ITerminalDimensions) => void> = [];
  private _onTitleChangeListeners: Array<(title: string) => void> = [];
  
  constructor(
    private readonly configurationService: ITerminalConfigurationService
  ) {}
  
  get xterm(): XTerm {
    if (!this._xterm) {
      throw new Error('XTerm not initialized');
    }
    return this._xterm;
  }
  
  async initialize(): Promise<void> {
    const config = this.configurationService.config;
    
    // Create XTerm instance
    this._xterm = new XTerm({
      theme: this.getTheme(config.theme || 'dark'),
      fontFamily: config.fontFamily || 'Menlo, Monaco, "Courier New", monospace',
      fontSize: config.fontSize || 14,
      lineHeight: config.lineHeight || 1.2,
      cursorBlink: config.cursorBlink !== false,
      cursorStyle: config.cursorStyle || 'block',
      cursorWidth: config.cursorWidth || 1,
      bellStyle: config.bellStyle || 'none',
      allowTransparency: config.allowTransparency || false,
      macOptionIsMeta: config.macOptionIsMeta !== false,
      macOptionClickForcesSelection: config.macOptionClickForcesSelection || false,
      rightClickSelectsWord: config.rightClickSelectsWord || false,
      scrollback: config.scrollback || 10000,
      tabStopWidth: config.tabStopWidth || 8,
      drawBoldTextInBrightColors: config.drawBoldTextInBrightColors !== false,
      fastScrollModifier: config.fastScrollModifier || 'alt',
      fastScrollSensitivity: config.fastScrollSensitivity || 5,
      scrollSensitivity: config.scrollSensitivity || 1,
      screenReaderMode: config.screenReaderMode || false,
      wordSeparator: config.wordSeparator || ' ()[]{}\',"`',
      windowsMode: config.windowsMode || false,
      convertEol: config.convertEol !== false,
      cols: config.cols || 80,
      rows: config.rows || 30,
      allowProposedApi: true
    });
    
    // Load core addons
    this._fitAddon = new FitAddon();
    this._xterm.loadAddon(this._fitAddon);
    
    this._serializeAddon = new SerializeAddon();
    this._xterm.loadAddon(this._serializeAddon);
    
    this._searchAddon = new SearchAddon();
    this._xterm.loadAddon(this._searchAddon);
    
    // Load unicode addon
    const unicode11Addon = new Unicode11Addon();
    this._xterm.loadAddon(unicode11Addon);
    
    // Load web links addon
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      this.handleLink(uri);
    });
    this._xterm.loadAddon(webLinksAddon);
    
    // Set up event handlers
    this._xterm.onData((data) => {
      this._onDataListeners.forEach(listener => listener(data));
    });
    
    this._xterm.onResize((event) => {
      const dimensions: ITerminalDimensions = {
        cols: event.cols,
        rows: event.rows
      };
      this._onResizeListeners.forEach(listener => listener(dimensions));
    });
    
    this._xterm.onTitleChange((title) => {
      this._onTitleChangeListeners.forEach(listener => listener(title));
    });
    
    // Activate unicode support
    unicode11Addon.activate(this._xterm);
  }
  
  attachToElement(element: HTMLElement): void {
    if (this._container === element) {
      return;
    }
    
    this.detachFromElement();
    
    this._container = element;
    if (this._xterm) {
      this._xterm.open(element);
      
      // Try to enable WebGL renderer for better performance
      if (this.configurationService.config.rendererType === 'webgl') {
        this.enableWebglRenderer();
      }
      
      // Fit terminal to container
      setTimeout(() => {
        this.fit();
      }, 0);
    }
  }
  
  detachFromElement(): void {
    if (this._webglAddon) {
      this._webglAddon.dispose();
      this._webglAddon = undefined;
    }
    
    this._container = undefined;
  }
  
  private async enableWebglRenderer(): Promise<void> {
    if (!this._xterm || this._webglAddon) {
      return;
    }
    
    try {
      this._webglAddon = new WebglAddon();
      this._webglAddon.onContextLoss(() => {
        this._webglAddon?.dispose();
        this._webglAddon = undefined;
      });
      this._xterm.loadAddon(this._webglAddon);
    } catch (err) {
      console.warn('Failed to enable WebGL renderer:', err);
    }
  }
  
  write(data: string): void {
    this._xterm?.write(data);
  }
  
  writeln(data: string): void {
    this._xterm?.writeln(data);
  }
  
  clear(): void {
    this._xterm?.clear();
  }
  
  focus(): void {
    this._xterm?.focus();
  }
  
  blur(): void {
    this._xterm?.blur();
  }
  
  fit(): void {
    if (this._fitAddon && this._container) {
      try {
        this._fitAddon.fit();
      } catch (err) {
        console.warn('Failed to fit terminal:', err);
      }
    }
  }
  
  setDimensions(dimensions: ITerminalDimensions): void {
    if (this._xterm) {
      this._xterm.resize(dimensions.cols, dimensions.rows);
    }
  }
  
  scrollDownLine(): void {
    this._xterm?.scrollLines(1);
  }
  
  scrollDownPage(): void {
    this._xterm?.scrollPages(1);
  }
  
  scrollToBottom(): void {
    this._xterm?.scrollToBottom();
  }
  
  scrollUpLine(): void {
    this._xterm?.scrollLines(-1);
  }
  
  scrollUpPage(): void {
    this._xterm?.scrollPages(-1);
  }
  
  scrollToTop(): void {
    this._xterm?.scrollToTop();
  }
  
  clearSelection(): void {
    this._xterm?.clearSelection();
  }
  
  selectAll(): void {
    this._xterm?.selectAll();
  }
  
  findNext(term: string, options?: any): boolean {
    if (this._searchAddon) {
      return this._searchAddon.findNext(term, options);
    }
    return false;
  }
  
  findPrevious(term: string, options?: any): boolean {
    if (this._searchAddon) {
      return this._searchAddon.findPrevious(term, options);
    }
    return false;
  }
  
  serialize(): string {
    return this._serializeAddon?.serialize() || '';
  }
  
  onData(listener: (data: string) => void): void {
    this._onDataListeners.push(listener);
  }
  
  onResize(listener: (dimensions: ITerminalDimensions) => void): void {
    this._onResizeListeners.push(listener);
  }
  
  onTitleChange(listener: (title: string) => void): void {
    this._onTitleChangeListeners.push(listener);
  }
  
  private handleLink(uri: string): void {
    // Handle link click
    if (typeof window !== 'undefined') {
      // Check if we're in Electron
      if ((window as any).electronAPI?.shell?.openExternal) {
        (window as any).electronAPI.shell.openExternal(uri);
      } else {
        // Fallback to browser
        window.open(uri, '_blank');
      }
    }
  }
  
  private getTheme(theme: 'light' | 'dark'): any {
    const themes = {
      light: {
        background: '#ffffff',
        foreground: '#000000',
        cursor: '#000000',
        cursorAccent: '#ffffff',
        selectionBackground: '#b5b5b5',
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
      },
      dark: {
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
        brightWhite: '#ffffff'
      }
    };
    
    return themes[theme];
  }
  
  dispose(): void {
    this._onDataListeners = [];
    this._onResizeListeners = [];
    this._onTitleChangeListeners = [];
    
    if (this._webglAddon) {
      this._webglAddon.dispose();
    }
    
    if (this._xterm) {
      this._xterm.dispose();
    }
    
    this._xterm = undefined;
    this._fitAddon = undefined;
    this._serializeAddon = undefined;
    this._searchAddon = undefined;
    this._webglAddon = undefined;
    this._container = undefined;
  }
}