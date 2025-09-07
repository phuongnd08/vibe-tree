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
}

// Cache for terminal states per worktree
// Cache terminal state per worktree path instead of per process ID
// This ensures proper isolation between worktrees
const terminalStateCache = new Map<string, string>();

// Cache for output buffers per worktree to prevent cross-contamination
const outputBufferCache = new Map<string, string[]>();

export function ClaudeTerminal({ worktreePath, theme = 'dark' }: ClaudeTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const processIdRef = useRef<string>('');
  const currentWorktreeRef = useRef<string>('');
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const removeListenersRef = useRef<Array<() => void>>([]);
  const [detectedIDEs, setDetectedIDEs] = useState<Array<{ name: string; command: string }>>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!terminalRef.current) return;

    console.log('Initializing terminal...');

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
    fitAddonRef.current = fitAddon;
    
    // Configure WebLinksAddon with custom handler for opening links
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      // Open in default browser using Electron's shell.openExternal
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
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        try {
          fitAddon.fit();
          // Resize the PTY to match terminal dimensions
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
      // Clean up listeners
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
      bellDisposable.dispose();
      term.dispose();
    };
  }, [theme]);

  // Save terminal state before unmounting or changing worktree
  useEffect(() => {
    const previousWorktree = currentWorktreeRef.current;
    return () => {
      if (terminal && serializeAddonRef.current && previousWorktree) {
        // Save the terminal state for the PREVIOUS worktree, not the new one
        const serializedState = serializeAddonRef.current.serialize();
        console.log(`[SAVE] Saving terminal state for worktree: ${previousWorktree}`);
        console.log(`[SAVE] State length: ${serializedState.length}`);
        console.log(`[SAVE] State preview: ${serializedState.substring(0, 200)}...`);
        terminalStateCache.set(previousWorktree, serializedState);
      }
    };
  }, [terminal, worktreePath]);

  // Auto-start shell when worktree changes
  useEffect(() => {
    console.log(`[EFFECT] Worktree change effect triggered, worktreePath: ${worktreePath}`);
    if (!terminal || !worktreePath) {
      console.log(`[EFFECT] Early return - terminal: ${!!terminal}, worktreePath: ${worktreePath}`);
      return;
    }

    // CRITICAL FIX: Save current terminal state immediately BEFORE doing anything else
    // This prevents contamination from new shell output
    const previousWorktree = currentWorktreeRef.current;
    if (previousWorktree && serializeAddonRef.current && previousWorktree !== worktreePath) {
      const serializedState = serializeAddonRef.current.serialize();
      console.log(`[IMMEDIATE-SAVE] Saving state for ${previousWorktree} before switching to ${worktreePath}`);
      console.log(`[IMMEDIATE-SAVE] State length: ${serializedState.length}, preview: ${serializedState.substring(0, 100)}...`);
      terminalStateCache.set(previousWorktree, serializedState);
    }

    // Clean up old listeners first
    console.log(`[CLEANUP] Cleaning up ${removeListenersRef.current.length} listeners`);
    removeListenersRef.current.forEach(remove => remove());
    removeListenersRef.current = [];

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

        processIdRef.current = result.processId!;
        currentWorktreeRef.current = worktreePath;
        console.log(`[SHELL] Shell started: ${result.processId}, isNew: ${result.isNew}, worktree: ${worktreePath}`);

        // Clear terminal when switching to a different worktree to prevent contamination
        // Each worktree should have isolated terminal content
        if (previousWorktree && previousWorktree !== worktreePath) {
          console.log(`[SWITCH] Clearing terminal when switching from ${previousWorktree} to ${worktreePath}`);
          terminal.clear();
        }
        
        console.log(`[SWITCH] Switching to worktree ${worktreePath}`);
        
        // If this is a new session, it will start fresh naturally
        // If it's an existing session, we'll let the PTY handle restoring its state
        
        // Focus terminal
        terminal.focus();
        
        // Set initial PTY size
        if (fitAddonRef.current && terminalRef.current) {
          // Give the terminal time to render before fitting
          setTimeout(() => {
            try {
              // Ensure the terminal container has dimensions
              if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
                fitAddonRef.current!.fit();
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
          if (processIdRef.current) {
            window.electronAPI.shell.write(processIdRef.current, data);
          }
        });

        // Set up output listener with special handling for Claude
        let lastWasClear = false;
        
        const removeOutputListener = window.electronAPI.shell.onOutput(result.processId!, (data) => {
          console.log(`[OUTPUT] Received output for process ${result.processId}, worktree: ${worktreePath}`);
          console.log(`[OUTPUT] Current worktree ref: ${currentWorktreeRef.current}`);
          console.log(`[OUTPUT] Data length: ${data.length}, preview: ${data.substring(0, 100).replace(/\n/g, '\\n')}...`);
          
          // CRITICAL: Only process output if this is still the current worktree
          // This prevents contamination when switching between worktrees
          if (currentWorktreeRef.current !== worktreePath) {
            console.log(`[OUTPUT] SKIPPING - wrong worktree (current: ${currentWorktreeRef.current}, output from: ${worktreePath})`);
            // Buffer the output for this worktree instead of dropping it
            const buffer = outputBufferCache.get(worktreePath) || [];
            buffer.push(data);
            outputBufferCache.set(worktreePath, buffer);
            return;
          }
          
          console.log(`[OUTPUT] WRITING to terminal for worktree: ${worktreePath}`);
          
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
          processIdRef.current = '';
        });

        // Periodically save terminal state
        const saveInterval = setInterval(() => {
          if (serializeAddonRef.current && currentWorktreeRef.current) {
            const serializedState = serializeAddonRef.current.serialize();
            console.log(`[PERIODIC-SAVE] Saving state for worktree: ${currentWorktreeRef.current}, length: ${serializedState.length}`);
            terminalStateCache.set(currentWorktreeRef.current, serializedState);
          }
        }, 5000); // Save every 5 seconds

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
      // Save state before cleaning up
      if (serializeAddonRef.current && processIdRef.current) {
        const serializedState = serializeAddonRef.current.serialize();
        terminalStateCache.set(processIdRef.current, serializedState);
      }
      
      // Clean up listeners when worktree changes
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
    };
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
      <div className="h-[57px] px-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Terminal</h3>
          <p className="text-xs text-muted-foreground truncate">{worktreePath}</p>
        </div>
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

      <div 
        ref={terminalRef} 
        className={`flex-1 min-h-0 ${theme === 'light' ? 'bg-white' : 'bg-black'}`}
        style={{ minHeight: '100px' }}
      />
    </div>
  );
}