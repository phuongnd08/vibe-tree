import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code2, Columns2, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  id: string;
  worktreePath: string;
  theme?: 'light' | 'dark';
  onSplit: (paneId: string) => void;
  onClose: (paneId: string) => void;
  canClose: boolean;
  detectedIDEs?: Array<{ name: string; command: string }>;
  onOpenInIDE?: (ideName: string) => void;
}

// Cache for terminal states per worktree
const terminalStateCache = new Map<string, string>();

export function TerminalPane({ 
  id, 
  worktreePath, 
  theme = 'dark', 
  onSplit, 
  onClose, 
  canClose,
  detectedIDEs = [],
  onOpenInIDE
}: TerminalPaneProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const processIdRef = useRef<string>('');
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const removeListenersRef = useRef<Array<() => void>>([]);

  const getTerminalTheme = useCallback((currentTheme: 'light' | 'dark') => {
    if (currentTheme === 'light') {
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
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    console.log(`Initializing terminal pane ${id}...`);

    const term = new Terminal({
      theme: getTerminalTheme(theme),
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
      scrollOnUserInput: false // Don't auto-scroll on user input to preserve scroll position
    });

    // Add addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.electronAPI.shell.openExternal(uri);
    });
    term.loadAddon(webLinksAddon);
    
    const serializeAddon = new SerializeAddon();
    serializeAddonRef.current = serializeAddon;
    term.loadAddon(serializeAddon);
    
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);

    // Open terminal in container
    term.open(terminalRef.current);
    term.loadAddon(fitAddon);
    unicode11Addon.activate(term);
    
    // Fit and focus after a small delay
    setTimeout(() => {
      try {
        if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
          fitAddon.fit();
        }
        term.focus();
      } catch (err) {
        console.error('Error during initial fit:', err);
        term.focus();
      }
    }, 100);

    setTerminal(term);

    // Handle bell character
    const bellDisposable = term.onBell(() => {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==');
      audio.volume = 0.5;
      audio.play().catch(err => {
        console.error('Bell sound playback failed:', err);
      });
    });

    // Custom mouse wheel handler to prevent arrow key emulation in alternate buffer
    // This ensures mouse scroll only scrolls the terminal viewport, not send arrow keys
    const handleWheel = (event: WheelEvent) => {
      // Check if we're in alternate buffer (like vim, less, etc)
      // In alternate buffer, we want to prevent default to avoid arrow key simulation
      // In normal buffer, let the terminal handle scrolling naturally
      const buffer = term.buffer.active;
      const isAlternateBuffer = buffer.type === 'alternate';
      
      if (isAlternateBuffer) {
        // In alternate buffer (vim, less, etc), prevent arrow key emulation
        event.preventDefault();
        event.stopPropagation();
        
        // Calculate scroll amount (normalize across different browsers/platforms)
        const scrollLines = Math.abs(event.deltaY) > 0 ? Math.sign(event.deltaY) * 3 : 0;
        
        if (scrollLines !== 0) {
          // Use xterm's built-in scrolling API
          term.scrollLines(scrollLines);
        }
        
        return false;
      }
      // In normal buffer, let the terminal handle scrolling naturally
      // This preserves the native scrollbar functionality
      return true;
    };

    // Attach wheel event listener to terminal element
    if (terminalRef.current) {
      terminalRef.current.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Handle window resize
    const handleResize = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        try {
          fitAddon.fit();
          if (processIdRef.current) {
            window.electronAPI.shell.resize(
              processIdRef.current, 
              term.cols, 
              term.rows
            );
          }
        } catch (err) {
          console.error('Error during resize fit:', err);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (terminalRef.current) {
        terminalRef.current.removeEventListener('wheel', handleWheel);
      }
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
      bellDisposable.dispose();
      term.dispose();
    };
  }, [theme, getTerminalTheme, id]);

  // Save terminal state before unmounting
  useEffect(() => {
    return () => {
      if (terminal && serializeAddonRef.current && processIdRef.current) {
        const serializedState = serializeAddonRef.current.serialize();
        terminalStateCache.set(processIdRef.current, serializedState);
      }
    };
  }, [terminal, worktreePath]);

  // Auto-start shell when worktree changes
  useEffect(() => {
    if (!terminal || !worktreePath) return;

    removeListenersRef.current.forEach(remove => remove());
    removeListenersRef.current = [];

    const startShell = async () => {
      try {
        const cols = terminal.cols;
        const rows = terminal.rows;
        
        const result = await window.electronAPI.shell.start(worktreePath, cols, rows, true); // Always force new for panes
        
        if (!result.success) {
          terminal.writeln(`\r\nError: ${result.error || 'Failed to start shell'}\r\n`);
          return;
        }

        processIdRef.current = result.processId!;
        console.log(`Shell started for pane ${id}: ${result.processId}, isNew: ${result.isNew}, worktree: ${worktreePath}`);

        if (result.isNew) {
          terminal.clear();
        } else {
          const cachedState = terminalStateCache.get(result.processId!);
          // Don't clear when restoring - this preserves scrollback
          // The cached state already contains the full terminal content
          
          if (cachedState) {
            // Reset terminal to home position without clearing buffer
            terminal.reset();
            // Write the cached state which includes scrollback
            terminal.write(cachedState);
          }
        }
        
        terminal.focus();
        
        // Set initial PTY size
        if (fitAddonRef.current && terminalRef.current) {
          setTimeout(() => {
            try {
              if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
                fitAddonRef.current!.fit();
                window.electronAPI.shell.resize(
                  result.processId!,
                  terminal.cols,
                  terminal.rows
                );
              } else {
                window.electronAPI.shell.resize(
                  result.processId!,
                  80,
                  24
                );
              }
            } catch (err) {
              console.error('Error during PTY resize fit:', err);
              window.electronAPI.shell.resize(
                result.processId!,
                80,
                24
              );
            }
          }, 100);
        }

        // Handle terminal input
        const disposable = terminal.onData((data) => {
          if (processIdRef.current) {
            window.electronAPI.shell.write(processIdRef.current, data);
          }
        });

        // Set up output listener
        let lastWasClear = false;
        const removeOutputListener = window.electronAPI.shell.onOutput(result.processId!, (data) => {
          if (data.includes('\x1b[2J') && data.includes('\x1b[H')) {
            terminal.clear();
            terminal.write('\x1b[H');
            lastWasClear = true;
            // eslint-disable-next-line no-control-regex
            const afterClear = data.split(/\x1b\[2J.*?\x1b\[H/)[1];
            if (afterClear) {
              terminal.write(afterClear);
            }
          } else if (lastWasClear && data.startsWith('\n')) {
            lastWasClear = false;
            terminal.write(data.substring(1));
          } else {
            lastWasClear = false;
            terminal.write(data);
          }
        });

        // Set up exit listener
        const removeExitListener = window.electronAPI.shell.onExit(result.processId!, (code) => {
          terminal.writeln(`\r\n[Shell exited with code ${code}]`);
          processIdRef.current = '';
        });

        // Periodically save terminal state
        const saveInterval = setInterval(() => {
          if (serializeAddonRef.current && processIdRef.current) {
            const serializedState = serializeAddonRef.current.serialize();
            terminalStateCache.set(processIdRef.current, serializedState);
          }
        }, 5000);

        // Store listeners for cleanup
        removeListenersRef.current = [
          () => disposable.dispose(),
          removeOutputListener,
          removeExitListener,
          () => clearInterval(saveInterval)
        ];

      } catch (error) {
        terminal.writeln(`\r\nError starting shell: ${error}\r\n`);
      }
    };

    startShell();

    return () => {
      if (serializeAddonRef.current && processIdRef.current) {
        const serializedState = serializeAddonRef.current.serialize();
        terminalStateCache.set(processIdRef.current, serializedState);
      }
      
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
    };
  }, [terminal, worktreePath, id]);

  // Update theme when prop changes
  useEffect(() => {
    if (!terminal) return;
    terminal.options.theme = getTerminalTheme(theme);
  }, [terminal, theme, getTerminalTheme]);

  const handleSplit = () => {
    onSplit(id);
  };

  const handleClose = () => {
    if (canClose) {
      onClose(id);
    }
  };

  const handleOpenInIDE = async (ideName: string) => {
    if (onOpenInIDE) {
      onOpenInIDE(ideName);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-[57px] px-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Terminal {id}</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSplit}
            title="Split Terminal"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          {canClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleClose}
              title="Close Terminal"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          {detectedIDEs.length > 0 && (
            detectedIDEs.length === 1 ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleOpenInIDE(detectedIDEs[0].name)}
                title={`Open in ${detectedIDEs[0].name}`}
              >
                <Code2 className="h-4 w-4" />
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Code2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {detectedIDEs.map((ide) => (
                    <DropdownMenuItem
                      key={ide.name}
                      onClick={() => handleOpenInIDE(ide.name)}
                    >
                      Open in {ide.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          )}
        </div>
      </div>

      {/* Terminal container */}
      <div 
        ref={terminalRef} 
        className={`flex-1 h-full ${theme === 'light' ? 'bg-white' : 'bg-black'}`}
        style={{ minHeight: '100px' }}
      />
    </div>
  );
}