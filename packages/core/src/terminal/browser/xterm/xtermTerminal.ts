import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Emitter, Event } from 'vscode-jsonrpc';
import { ITerminalDimensions, ITerminalConfigurationService, ITerminalTheme } from '../../common/terminal';
import '@xterm/xterm/css/xterm.css';

export class XtermTerminal {
  private _xterm: XTerm | undefined;
  private _container: HTMLElement | undefined;
  private _fitAddon: FitAddon | undefined;
  private _searchAddon: SearchAddon | undefined;
  private _serializeAddon: SerializeAddon | undefined;
  private _webglAddon: WebglAddon | undefined;
  private _webLinksAddon: WebLinksAddon | undefined;
  private _unicode11Addon: Unicode11Addon | undefined;
  private _configService: ITerminalConfigurationService | undefined;
  private _isDisposed: boolean = false;
  private _escapeSequenceLoggingEnabled: boolean = false;
  
  private readonly _onData = new Emitter<string>();
  readonly onData: Event<string> = this._onData.event;
  
  private readonly _onResize = new Emitter<ITerminalDimensions>();
  readonly onResize: Event<ITerminalDimensions> = this._onResize.event;
  
  private readonly _onFocus = new Emitter<void>();
  readonly onFocus: Event<void> = this._onFocus.event;
  
  private readonly _onBlur = new Emitter<void>();
  readonly onBlur: Event<void> = this._onBlur.event;
  
  private readonly _onTitleChange = new Emitter<string>();
  readonly onTitleChange: Event<string> = this._onTitleChange.event;
  
  private readonly _onBell = new Emitter<void>();
  readonly onBell: Event<void> = this._onBell.event;
  
  constructor(configService?: ITerminalConfigurationService) {
    this._configService = configService;
  }
  
  get raw(): XTerm | undefined {
    return this._xterm;
  }
  
  async attachToElement(container: HTMLElement): Promise<void> {
    if (this._isDisposed) {
      return;
    }
    
    this._container = container;
    
    const config = this._configService?.config;
    const theme = config?.theme || this._getDefaultTheme();
    
    this._xterm = new XTerm({
      theme: theme,
      fontFamily: config?.fontFamily || 'Menlo, Monaco, "Courier New", monospace',
      fontSize: config?.fontSize || 14,
      lineHeight: config?.lineHeight || 1.2,
      cursorBlink: config?.cursorBlink ?? true,
      cursorStyle: config?.cursorStyle || 'block',
      scrollback: config?.scrollback || 10000,
      tabStopWidth: config?.tabStopWidth || 8,
      drawBoldTextInBrightColors: config?.drawBoldTextInBrightColors ?? true,
      fastScrollSensitivity: config?.fastScrollSensitivity || 5,
      rightClickSelectsWord: config?.rightClickSelectsWord ?? true,
      macOptionIsMeta: config?.macOptionIsMeta ?? true,
      allowTransparency: false,
      windowsMode: false,
      convertEol: true,
      allowProposedApi: true
    });
    
    this._fitAddon = new FitAddon();
    this._xterm.loadAddon(this._fitAddon);
    
    this._searchAddon = new SearchAddon();
    this._xterm.loadAddon(this._searchAddon);
    
    this._serializeAddon = new SerializeAddon();
    this._xterm.loadAddon(this._serializeAddon);
    
    this._unicode11Addon = new Unicode11Addon();
    this._xterm.loadAddon(this._unicode11Addon);
    
    this._webLinksAddon = new WebLinksAddon((event, uri) => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.shell?.openExternal) {
        (window as any).electronAPI.shell.openExternal(uri);
      } else {
        window.open(uri, '_blank');
      }
    });
    this._xterm.loadAddon(this._webLinksAddon);
    
    try {
      this._webglAddon = new WebglAddon();
      this._xterm.loadAddon(this._webglAddon);
    } catch (error) {
      console.warn('WebGL addon failed to load, falling back to canvas renderer:', error);
    }
    
    this._xterm.open(container);
    
    this._unicode11Addon.activate(this._xterm);
    
    this._setupListeners();
    
    setTimeout(() => {
      this.fit();
      this._xterm?.focus();
    }, 10);
  }
  
  private _setupListeners(): void {
    if (!this._xterm) {
      return;
    }
    
    this._xterm.onData((data: string) => {
      if (this._escapeSequenceLoggingEnabled) {
        console.log('Terminal input:', JSON.stringify(data));
      }
      this._onData.fire(data);
    });
    
    this._xterm.onResize((event: { cols: number; rows: number }) => {
      this._onResize.fire({ cols: event.cols, rows: event.rows });
    });
    
    this._xterm.onTitleChange((title: string) => {
      this._onTitleChange.fire(title);
    });
    
    this._xterm.onBell(() => {
      this._onBell.fire();
      this._playBellSound();
    });
    
    const handleResize = () => {
      if (this._container && this._container.offsetWidth > 0 && this._container.offsetHeight > 0) {
        this.fit();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    if (this._container && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(this._container);
    }
  }
  
  private _playBellSound(): void {
    const config = this._configService?.config;
    const bellSound = config?.bellSound;
    
    if (bellSound === null) {
      return;
    }
    
    const audioData = bellSound || 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==';
    
    const audio = new Audio(audioData);
    audio.volume = 0.5;
    audio.play().catch(err => {
      console.debug('Bell sound playback failed:', err);
    });
    
    const duration = config?.bellDuration || 100;
    if (duration > 0) {
      setTimeout(() => {
        audio.pause();
      }, duration);
    }
  }
  
  private _getDefaultTheme(): ITerminalTheme {
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
  }
  
  write(data: string): void {
    if (this._xterm) {
      if (this._escapeSequenceLoggingEnabled) {
        console.log('Terminal output:', JSON.stringify(data));
      }
      this._xterm.write(data);
    }
  }
  
  writeln(data: string): void {
    if (this._xterm) {
      this._xterm.writeln(data);
    }
  }
  
  clear(): void {
    if (this._xterm) {
      this._xterm.clear();
    }
  }
  
  clearBuffer(): void {
    if (this._xterm) {
      this._xterm.clear();
      this._xterm.reset();
    }
  }
  
  focus(): void {
    if (this._xterm) {
      this._xterm.focus();
    }
  }
  
  blur(): void {
    if (this._xterm) {
      this._xterm.blur();
    }
  }
  
  fit(): void {
    if (this._fitAddon && this._xterm) {
      this._fitAddon.fit();
      this._xterm.scrollToBottom();
    }
  }
  
  resize(cols: number, rows: number): void {
    if (this._xterm) {
      this._xterm.resize(cols, rows);
    }
  }
  
  scrollToTop(): void {
    if (this._xterm) {
      this._xterm.scrollToTop();
    }
  }
  
  scrollToBottom(): void {
    if (this._xterm) {
      this._xterm.scrollToBottom();
    }
  }
  
  scrollToLine(line: number): void {
    if (this._xterm) {
      this._xterm.scrollToLine(line);
    }
  }
  
  findNext(term: string, options?: { regex?: boolean; wholeWord?: boolean; caseSensitive?: boolean }): boolean {
    if (this._searchAddon) {
      return this._searchAddon.findNext(term, options);
    }
    return false;
  }
  
  findPrevious(term: string, options?: { regex?: boolean; wholeWord?: boolean; caseSensitive?: boolean }): boolean {
    if (this._searchAddon) {
      return this._searchAddon.findPrevious(term, options);
    }
    return false;
  }
  
  serialize(): string | undefined {
    if (this._serializeAddon) {
      return this._serializeAddon.serialize();
    }
    return undefined;
  }
  
  updateTheme(theme: ITerminalTheme): void {
    if (this._xterm) {
      this._xterm.options.theme = theme;
    }
  }
  
  toggleEscapeSequenceLogging(): void {
    this._escapeSequenceLoggingEnabled = !this._escapeSequenceLoggingEnabled;
    console.log(`Escape sequence logging ${this._escapeSequenceLoggingEnabled ? 'enabled' : 'disabled'}`);
  }
  
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    
    this._isDisposed = true;
    
    this._fitAddon?.dispose();
    this._searchAddon?.dispose();
    this._webglAddon?.dispose();
    this._xterm?.dispose();
    
    this._onData.dispose();
    this._onResize.dispose();
    this._onFocus.dispose();
    this._onBlur.dispose();
    this._onTitleChange.dispose();
    this._onBell.dispose();
  }
}