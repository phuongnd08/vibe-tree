import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SerializeAddon } from '@xterm/addon-serialize';

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  processId: string;
  worktreePath: string;
  terminalId: string;
  container: HTMLDivElement | null;
  listeners: Array<() => void>;
  isAttached: boolean;
}

interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

class TerminalManager {
  private terminals: Map<string, TerminalInstance> = new Map();
  private activeTerminal: string | null = null;

  private getTerminalKey(worktreePath: string, terminalId: string): string {
    return `${worktreePath}:${terminalId}`;
  }

  private getTerminalTheme(theme: 'light' | 'dark'): TerminalTheme {
    if (theme === 'light') {
      return {
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
      };
    } else {
      return {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#4a4a4a',
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
  }

  public getOrCreateTerminal(
    worktreePath: string,
    terminalId: string,
    container: HTMLDivElement,
    theme: 'light' | 'dark' = 'dark'
  ): TerminalInstance {
    const key = this.getTerminalKey(worktreePath, terminalId);
    
    // Check if terminal already exists
    let instance = this.terminals.get(key);
    
    if (instance) {
      // Terminal exists, reattach it if needed
      if (!instance.isAttached && container) {
        this.attachTerminal(instance, container);
      }
      return instance;
    }

    // Create new terminal
    console.log(`Creating new terminal ${terminalId} for worktree ${worktreePath}`);
    
    const term = new Terminal({
      theme: this.getTerminalTheme(theme),
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      convertEol: true,
      scrollback: 10000,
      tabStopWidth: 4,
      windowsMode: false,
      allowProposedApi: true,
      macOptionIsMeta: true,
      scrollOnUserInput: false
    });

    // Add addons
    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.electronAPI.shell.openExternal(uri);
    });
    const unicode11Addon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(serializeAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);

    // Create terminal instance
    instance = {
      terminal: term,
      fitAddon,
      serializeAddon,
      processId: '',
      worktreePath,
      terminalId,
      container: null,
      listeners: [],
      isAttached: false
    };

    // Store the instance
    this.terminals.set(key, instance);

    // Attach to container
    if (container) {
      this.attachTerminal(instance, container);
    }

    // Activate unicode support
    unicode11Addon.activate(term);

    return instance;
  }

  private attachTerminal(instance: TerminalInstance, container: HTMLDivElement): void {
    if (instance.isAttached && instance.container === container) {
      return; // Already attached to the same container
    }

    // If terminal is attached to a different container, check if we should move it
    if (instance.isAttached && instance.container && instance.container !== container) {
      // Check if the existing container is still in DOM and visible
      const existingContainerVisible = document.body.contains(instance.container) && 
                                       instance.container.offsetParent !== null;
      
      if (existingContainerVisible) {
        // Don't move terminal from a visible container
        console.log(`Terminal ${instance.terminalId} is already visible in another container, skipping attachment`);
        return;
      }
      
      // Detach from the old non-visible container
      this.detachTerminal(instance);
    }

    console.log(`Attaching terminal ${instance.terminalId} to container`);
    
    // Open terminal in new container
    instance.terminal.open(container);
    instance.container = container;
    instance.isAttached = true;

    // Fit terminal to container
    setTimeout(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        instance.fitAddon.fit();
        instance.terminal.focus();
      }
    }, 10);

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        instance.fitAddon.fit();
        if (instance.processId) {
          window.electronAPI.shell.resize(
            instance.processId,
            instance.terminal.cols,
            instance.terminal.rows
          );
        }
      }
    });
    resizeObserver.observe(container);

    // Store cleanup function
    instance.listeners.push(() => {
      resizeObserver.disconnect();
    });
  }

  public detachTerminal(instance: TerminalInstance): void {
    if (!instance.isAttached || !instance.container) {
      return;
    }

    console.log(`Detaching terminal ${instance.terminalId}`);
    
    // Clear the container
    if (instance.container) {
      instance.container.innerHTML = '';
    }
    
    instance.container = null;
    instance.isAttached = false;

    // Clean up listeners
    instance.listeners.forEach(cleanup => cleanup());
    instance.listeners = [];
  }

  public showTerminal(worktreePath: string, terminalId: string, container: HTMLDivElement): TerminalInstance | null {
    const key = this.getTerminalKey(worktreePath, terminalId);
    const instance = this.terminals.get(key);
    
    if (!instance) {
      return null;
    }

    // Hide currently active terminal if different
    if (this.activeTerminal && this.activeTerminal !== key) {
      const activeInstance = this.terminals.get(this.activeTerminal);
      if (activeInstance && activeInstance.container) {
        activeInstance.container.style.display = 'none';
      }
    }

    // Show this terminal
    if (container) {
      container.style.display = 'block';
      if (!instance.isAttached || instance.container !== container) {
        this.attachTerminal(instance, container);
      }
      instance.terminal.focus();
    }

    this.activeTerminal = key;
    return instance;
  }

  public hideTerminal(worktreePath: string, terminalId: string): void {
    const key = this.getTerminalKey(worktreePath, terminalId);
    const instance = this.terminals.get(key);
    
    if (instance && instance.container) {
      instance.container.style.display = 'none';
    }
  }

  public updateTheme(theme: 'light' | 'dark'): void {
    const themeConfig = this.getTerminalTheme(theme);
    this.terminals.forEach(instance => {
      instance.terminal.options.theme = themeConfig;
    });
  }

  public getTerminal(worktreePath: string, terminalId: string): TerminalInstance | null {
    const key = this.getTerminalKey(worktreePath, terminalId);
    return this.terminals.get(key) || null;
  }

  public destroyTerminal(worktreePath: string, terminalId: string): void {
    const key = this.getTerminalKey(worktreePath, terminalId);
    const instance = this.terminals.get(key);
    
    if (!instance) {
      return;
    }

    console.log(`Destroying terminal ${terminalId} for worktree ${worktreePath}`);

    // Clean up shell process if exists
    // Note: The shell process will be cleaned up on the backend when the terminal is destroyed

    // Detach and dispose terminal
    this.detachTerminal(instance);
    instance.terminal.dispose();
    
    // Remove from map
    this.terminals.delete(key);

    // Update active terminal if needed
    if (this.activeTerminal === key) {
      this.activeTerminal = null;
    }
  }

  public resizeTerminal(worktreePath: string, terminalId: string): void {
    const instance = this.getTerminal(worktreePath, terminalId);
    if (instance && instance.isAttached && instance.container) {
      if (instance.container.offsetWidth > 0 && instance.container.offsetHeight > 0) {
        instance.fitAddon.fit();
        if (instance.processId) {
          window.electronAPI.shell.resize(
            instance.processId,
            instance.terminal.cols,
            instance.terminal.rows
          );
        }
      }
    }
  }

  public getAllTerminals(): Map<string, TerminalInstance> {
    return this.terminals;
  }
}

// Export singleton instance
export const terminalManager = new TerminalManager();
export type { TerminalInstance };