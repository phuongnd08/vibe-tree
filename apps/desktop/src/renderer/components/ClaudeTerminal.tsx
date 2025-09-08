import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code2 } from 'lucide-react';
import { useToast } from './ui/use-toast';
import '@xterm/xterm/css/xterm.css';

interface ClaudeTerminalProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
  isVisible?: boolean;
}

// Cache for terminal instances per worktree - persistent across show/hide
const terminalInstanceCache = new Map<string, {
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  processId: string;
  container: HTMLDivElement;
  removeListeners: Array<() => void>;
}>();

// Cache for terminal states per worktree
const terminalStateCache = new Map<string, string>();

export function ClaudeTerminal({ worktreePath, theme = 'dark', isVisible = true }: ClaudeTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [detectedIDEs, setDetectedIDEs] = useState<Array<{ name: string; command: string }>>([]);
  const { toast } = useToast();
  const cacheEntryRef = useRef<typeof terminalInstanceCache extends Map<string, infer T> ? T : never>();

  useEffect(() => {
    if (!containerRef.current) return;

    // Check if we already have a cached terminal instance for this worktree
    let cached = terminalInstanceCache.get(worktreePath);
    
    if (cached) {
      // Reuse existing terminal instance
      console.log('Reusing cached terminal for:', worktreePath);
      
      // Move the terminal DOM element to our container
      containerRef.current.appendChild(cached.container);
      
      // Update our refs
      cacheEntryRef.current = cached;
      setTerminal(cached.terminal);
      
      // Focus terminal if visible
      if (isVisible) {
        setTimeout(() => {
          cached.terminal.focus();
          try {
            if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
              cached.fitAddon.fit();
            }
          } catch (err) {
            console.error('Error fitting cached terminal:', err);
          }
        }, 50);
      }
      
      return;
    }

    // Create new terminal instance
    console.log('Creating new terminal for:', worktreePath);

    // Create terminal instance with theme-aware colors  
    const getTerminalTheme = (currentTheme: 'light' | 'dark') => {
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
    };

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
      // Handle screen clearing properly
      windowsMode: false,
      // Allow proposed API for Unicode11 addon
      allowProposedApi: true,
      // Enable Option key as Meta on macOS
      macOptionIsMeta: true
    });

    // Add addons
    const fitAddon = new FitAddon();
    
    // Configure WebLinksAddon with custom handler for opening links
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      // Open in default browser using Electron's shell.openExternal
      window.electronAPI.shell.openExternal(uri);
    });
    term.loadAddon(webLinksAddon);
    
    const serializeAddon = new SerializeAddon();
    term.loadAddon(serializeAddon);
    
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);

    // Create a dedicated container div for this terminal
    const terminalContainer = document.createElement('div');
    terminalContainer.className = `flex-1 h-full ${theme === 'light' ? 'bg-white' : 'bg-black'}`;
    terminalContainer.style.minHeight = '100px';
    terminalContainer.style.width = '100%';
    terminalContainer.style.height = '100%';
    
    // Open terminal in the dedicated container
    term.open(terminalContainer);
    
    // Append to our container
    containerRef.current.appendChild(terminalContainer);
    
    // Load fit addon after terminal is opened
    term.loadAddon(fitAddon);
    
    // Activate unicode addon
    unicode11Addon.activate(term);
    
    // Fit and focus after a small delay to ensure proper rendering
    setTimeout(() => {
      try {
        // Ensure the terminal container has dimensions before fitting
        if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
          fitAddon.fit();
        }
        term.focus();
      } catch (err) {
        console.error('Error during initial fit:', err);
        // Try to focus without fit
        term.focus();
      }
    }, 100);

    // Store in cache
    const cacheEntry = {
      terminal: term,
      fitAddon,
      serializeAddon,
      processId: '',
      container: terminalContainer,
      removeListeners: [] as Array<() => void>
    };
    terminalInstanceCache.set(worktreePath, cacheEntry);
    cacheEntryRef.current = cacheEntry;
    setTerminal(term);

    // Handle bell character - play sound when bell is triggered
    const bellDisposable = term.onBell(() => {
      console.log('Bell triggered in ClaudeTerminal!');
      // Create an audio element and play the bell sound
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==');
      audio.volume = 0.5; // Set volume to 50%
      console.log('Playing bell sound at 50% volume...');
      audio.play()
        .then(() => {
          console.log('Bell sound played successfully');
        })
        .catch(err => {
          console.error('Bell sound playback failed:', err);
        });
    });

    // Handle window resize
    const handleResize = () => {
      // Only fit if the terminal container has dimensions
      if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
        try {
          fitAddon.fit();
          // Resize the PTY to match terminal dimensions
          if (cacheEntry.processId) {
            window.electronAPI.shell.resize(
              cacheEntry.processId, 
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
    
    // Store cleanup function in cache
    cacheEntry.removeListeners.push(() => {
      window.removeEventListener('resize', handleResize);
      bellDisposable.dispose();
    });

    return () => {
      // When component unmounts, just detach the terminal container from DOM
      // but keep the terminal instance alive in cache
      if (containerRef.current && cacheEntry.container.parentNode === containerRef.current) {
        containerRef.current.removeChild(cacheEntry.container);
      }
    };
  }, [worktreePath, theme]);

  // Save terminal state periodically
  useEffect(() => {
    if (!cacheEntryRef.current) return;
    
    const saveState = () => {
      const cached = cacheEntryRef.current;
      if (cached && cached.serializeAddon && cached.processId) {
        const serializedState = cached.serializeAddon.serialize();
        terminalStateCache.set(cached.processId, serializedState);
      }
    };
    
    const interval = setInterval(saveState, 5000);
    return () => {
      clearInterval(interval);
      saveState(); // Save one final time
    };
  }, [terminal, worktreePath]);


  // Auto-start shell when terminal is created
  useEffect(() => {
    if (!terminal || !worktreePath || !cacheEntryRef.current) return;
    
    const cached = cacheEntryRef.current;
    
    // If this terminal already has a process, skip initialization
    if (cached.processId) {
      console.log('Shell already running for:', worktreePath, 'processId:', cached.processId);
      return;
    }

    // Clean up old listeners first
    cached.removeListeners = cached.removeListeners.filter(listener => {
      // Keep resize and bell listeners, remove others
      return true;
    });

    const startShell = async () => {
      try {
        // Get current terminal dimensions
        const cols = terminal.cols;
        const rows = terminal.rows;
        
        const result = await window.electronAPI.shell.start(worktreePath, cols, rows);
        
        if (!result.success) {
          terminal.writeln(`\r\nError: ${result.error || 'Failed to start shell'}\r\n`);
          return;
        }

        cached.processId = result.processId!;
        console.log(`Shell started: ${result.processId}, isNew: ${result.isNew}, worktree: ${worktreePath}`);

        // Handle terminal state
        if (result.isNew) {
          // Clear terminal for new shells
          terminal.clear();
        } else {
          // Restore cached state for existing shells
          const cachedState = terminalStateCache.get(result.processId!);
          terminal.clear();
          
          // Use setTimeout to ensure terminal is ready
          setTimeout(() => {
            if (cachedState) {
              terminal.write(cachedState);
            }
          }, 50);
        }
        
        // Focus terminal
        terminal.focus();
        
        // Set initial PTY size
        if (cached.fitAddon && containerRef.current) {
          // Give the terminal time to render before fitting
          setTimeout(() => {
            try {
              // Ensure the terminal container has dimensions
              if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
                cached.fitAddon.fit();
                window.electronAPI.shell.resize(
                  result.processId!,
                  terminal.cols,
                  terminal.rows
                );
              } else {
                // Use default dimensions if container not ready
                window.electronAPI.shell.resize(
                  result.processId!,
                  80,
                  24
                );
              }
            } catch (err) {
              console.error('Error during PTY resize fit:', err);
              // Still try to resize with default cols/rows
              window.electronAPI.shell.resize(
                result.processId!,
                80,
                24
              );
            }
          }, 100);
        }

        // Handle terminal input - simply pass it to the PTY
        const disposable = terminal.onData((data) => {
          if (cached.processId) {
            window.electronAPI.shell.write(cached.processId, data);
          }
        });

        // Set up output listener with special handling for Claude
        let lastWasClear = false;
        const removeOutputListener = window.electronAPI.shell.onOutput(result.processId!, (data) => {
          // Check if Claude is trying to clear the screen
          if (data.includes('\x1b[2J') && data.includes('\x1b[H')) {
            // Claude is clearing screen and moving cursor home
            terminal.clear();
            terminal.write('\x1b[H');
            lastWasClear = true;
            
            // Write any remaining data after the clear sequence
            // eslint-disable-next-line no-control-regex
            const afterClear = data.split(/\x1b\[2J.*?\x1b\[H/)[1];
            if (afterClear) {
              terminal.write(afterClear);
            }
          } else if (lastWasClear && data.startsWith('\n')) {
            // Skip extra newlines after clear
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
          cached.processId = '';
        });

        // Store listeners for cleanup
        cached.removeListeners.push(
          () => disposable.dispose(),
          removeOutputListener,
          removeExitListener
        );

      } catch (error) {
        terminal.writeln(`\r\nError starting shell: ${error}\r\n`);
      }
    };

    startShell();

    // No cleanup - terminal persists
  }, [terminal, worktreePath]);

  // Detect available IDEs
  useEffect(() => {
    window.electronAPI.ide.detect().then(setDetectedIDEs);
  }, []);

  // Update theme when prop changes
  useEffect(() => {
    if (!terminal) return;

    const getTerminalTheme = (currentTheme: 'light' | 'dark') => {
      if (currentTheme === 'light') {
        return {
          background: '#ffffff',
          foreground: '#000000',
          cursor: '#000000',
          cursorAccent: '#ffffff',
          selectionBackground: '#b5b5b5'
        };
      } else {
        return {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#ffffff',
          cursorAccent: '#000000',
          selectionBackground: '#4a4a4a'
        };
      }
    };

    terminal.options.theme = getTerminalTheme(theme);
  }, [terminal, theme]);

  // Handle visibility changes - focus terminal when it becomes visible
  useEffect(() => {
    if (!terminal || !isVisible || !cacheEntryRef.current) return;

    // Focus the terminal when it becomes visible
    // Use a small timeout to ensure the DOM is ready
    const focusTimeout = setTimeout(() => {
      terminal.focus();
      
      // Also trigger a resize to ensure proper rendering
      const cached = cacheEntryRef.current;
      if (cached && cached.fitAddon && containerRef.current) {
        try {
          if (containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
            cached.fitAddon.fit();
          }
        } catch (err) {
          console.error('Error fitting terminal on visibility change:', err);
        }
      }
    }, 50);

    return () => clearTimeout(focusTimeout);
  }, [terminal, isVisible]);

  const handleOpenInIDE = async (ideName: string) => {
    try {
      const result = await window.electronAPI.ide.open(ideName, worktreePath);
      if (!result.success) {
        toast({
          title: "Error",
          description: result.error || "Failed to open IDE",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open IDE",
        variant: "destructive",
      });
    }
  };




  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-[57px] px-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Terminal</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
        <div className="flex items-center gap-1">
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
        ref={containerRef} 
        className="flex-1 h-full"
        style={{ minHeight: '100px' }}
      />
    </div>
  );
}