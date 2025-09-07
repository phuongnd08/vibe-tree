import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code2, Columns2, X } from 'lucide-react';
import { useToast } from './ui/use-toast';
import '@xterm/xterm/css/xterm.css';

// Cache terminal state per worktree:terminalId combination
const terminalStateCache = new Map<string, string>();

interface ClaudeTerminalSingleProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
  terminalId: string;
  onSplit: () => void;
  onClose: () => void;
  canClose: boolean;
}

export function ClaudeTerminalSingle({ 
  worktreePath, 
  theme = 'dark', 
  terminalId,
  onSplit,
  onClose,
  canClose
}: ClaudeTerminalSingleProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const processIdRef = useRef<string>('');
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const removeListenersRef = useRef<Array<() => void>>([]);
  const previousWorktreeRef = useRef<string>('');
  const [detectedIDEs, setDetectedIDEs] = useState<Array<{ name: string; command: string }>>([]);
  const { toast } = useToast();
  
  const getCacheKey = (worktree: string, id: string) => `${worktree}:${id}`;

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

    console.log(`Initializing terminal ${terminalId}...`);

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
      macOptionIsMeta: true
    });

    // Add addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    
    const serializeAddon = new SerializeAddon();
    serializeAddonRef.current = serializeAddon;
    term.loadAddon(serializeAddon);
    
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.electronAPI.shell.openExternal(uri);
    });
    term.loadAddon(webLinksAddon);
    
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
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==');
      audio.volume = 0.5;
      audio.play().catch(err => {
        console.error('Bell sound playback failed:', err);
      });
    });

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
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
      bellDisposable.dispose();
      term.dispose();
    };
  }, [theme, getTerminalTheme, terminalId]);

  // Auto-start shell when worktree changes
  useEffect(() => {
    if (!terminal || !worktreePath) return;

    // Save current terminal state before switching
    if (previousWorktreeRef.current && previousWorktreeRef.current !== worktreePath && serializeAddonRef.current) {
      const previousKey = getCacheKey(previousWorktreeRef.current, terminalId);
      const serialized = serializeAddonRef.current.serialize();
      terminalStateCache.set(previousKey, serialized);
      console.log(`Saved terminal state for ${previousKey}`);
    }

    removeListenersRef.current.forEach(remove => remove());
    removeListenersRef.current = [];

    const startShell = async () => {
      try {
        const cols = terminal.cols;
        const rows = terminal.rows;
        
        // Check if we're switching worktrees
        const isSwitchingWorktree = previousWorktreeRef.current && previousWorktreeRef.current !== worktreePath;
        
        const result = await window.electronAPI.shell.start(worktreePath, cols, rows, false, terminalId); // Use terminal ID for session isolation
        
        if (!result.success) {
          terminal.writeln(`\r\nError: ${result.error || 'Failed to start shell'}\r\n`);
          return;
        }

        processIdRef.current = result.processId!;
        console.log(`Shell started for ${terminalId}: ${result.processId}, isNew: ${result.isNew}, worktree: ${worktreePath}, switching: ${isSwitchingWorktree}`);

        // Clear terminal and restore cached state if available
        terminal.clear();
        
        if (!result.isNew) {
          // Try to restore cached terminal state for this worktree
          const cacheKey = getCacheKey(worktreePath, terminalId);
          const cachedState = terminalStateCache.get(cacheKey);
          if (cachedState) {
            terminal.write(cachedState);
            console.log(`Restored terminal state for ${cacheKey}`);
          }
        }
        
        // Update previous worktree ref
        previousWorktreeRef.current = worktreePath;
        
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
            const cacheKey = getCacheKey(worktreePath, terminalId);
            const serialized = serializeAddonRef.current.serialize();
            terminalStateCache.set(cacheKey, serialized);
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
      // Save terminal state before cleanup
      if (serializeAddonRef.current && processIdRef.current) {
        const cacheKey = getCacheKey(worktreePath, terminalId);
        const serialized = serializeAddonRef.current.serialize();
        terminalStateCache.set(cacheKey, serialized);
      }
      
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
    };
  }, [terminal, worktreePath, terminalId]);

  // Detect available IDEs
  useEffect(() => {
    window.electronAPI.ide.detect().then(setDetectedIDEs);
  }, []);

  // Update theme when prop changes
  useEffect(() => {
    if (!terminal) return;
    terminal.options.theme = getTerminalTheme(theme);
  }, [terminal, theme, getTerminalTheme]);

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
          <h3 className="font-semibold">Terminal {terminalId}</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={onSplit}
            title="Split Terminal"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          {canClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
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