import { useEffect, useRef, useState } from 'react';
import { terminalManager, type TerminalInstance } from '../services/TerminalManager';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Code2, Columns2, X } from 'lucide-react';
import { useToast } from './ui/use-toast';
import '@xterm/xterm/css/xterm.css';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [terminalInstance, setTerminalInstance] = useState<TerminalInstance | null>(null);
  const [detectedIDEs, setDetectedIDEs] = useState<Array<{ name: string; command: string }>>([]);
  const { toast } = useToast();
  const removeListenersRef = useRef<Array<() => void>>([]);

  // Initialize or reattach terminal
  useEffect(() => {
    if (!containerRef.current) return;

    console.log(`Setting up terminal ${terminalId} for worktree ${worktreePath}`);
    
    // Get or create terminal instance
    const instance = terminalManager.getOrCreateTerminal(
      worktreePath,
      terminalId,
      containerRef.current,
      theme
    );
    
    setTerminalInstance(instance);

    // Show this terminal
    terminalManager.showTerminal(worktreePath, terminalId, containerRef.current);

    // Handle window resize
    const handleResize = () => {
      terminalManager.resizeTerminal(worktreePath, terminalId);
    };

    window.addEventListener('resize', handleResize);

    // Custom mouse wheel handler to prevent arrow key emulation in alternate buffer
    const handleWheel = (event: WheelEvent) => {
      if (!instance.terminal) return;
      
      const buffer = instance.terminal.buffer.active;
      const isAlternateBuffer = buffer.type === 'alternate';
      
      if (isAlternateBuffer) {
        event.preventDefault();
        event.stopPropagation();
        
        const scrollLines = Math.abs(event.deltaY) > 0 ? Math.sign(event.deltaY) * 3 : 0;
        
        if (scrollLines !== 0) {
          instance.terminal.scrollLines(scrollLines);
        }
        
        return false;
      }
      return true;
    };

    // Attach wheel event listener
    if (containerRef.current) {
      containerRef.current.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        containerRef.current.removeEventListener('wheel', handleWheel);
      }
      removeListenersRef.current.forEach(remove => remove());
      removeListenersRef.current = [];
      
      // Don't hide the terminal on unmount - it might still be visible in another component
      // The terminal will only be destroyed when explicitly closed
    };
  }, [worktreePath, terminalId, theme]);

  // Start shell process if needed
  useEffect(() => {
    if (!terminalInstance || !worktreePath) return;

    // Clean up previous listeners
    removeListenersRef.current.forEach(remove => remove());
    removeListenersRef.current = [];

    const startShell = async () => {
      // Skip if process already running
      if (terminalInstance.processId) {
        console.log(`Terminal ${terminalId} already has process ${terminalInstance.processId}`);
        return;
      }

      try {
        const cols = terminalInstance.terminal.cols;
        const rows = terminalInstance.terminal.rows;
        
        const result = await window.electronAPI.shell.start(worktreePath, cols, rows, false);
        
        if (!result.success) {
          terminalInstance.terminal.writeln(`\r\nError: ${result.error || 'Failed to start shell'}\r\n`);
          return;
        }

        terminalInstance.processId = result.processId!;
        console.log(`Shell started for terminal ${terminalId}: ${result.processId}, worktree: ${worktreePath}`);

        // Handle terminal input
        const disposable = terminalInstance.terminal.onData((data) => {
          if (terminalInstance.processId) {
            window.electronAPI.shell.write(terminalInstance.processId, data);
          }
        });

        // Handle bell character
        const bellDisposable = terminalInstance.terminal.onBell(() => {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSN3yfDTgDAJInfN9NuLOgoUYrfp56ZSFApGn+DyvmwhCSuBzvLZijYIG2m98OGiUSATVqzn77FgGwc4k9n1znksBSh+zPLaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQU2ktXwy3YqBSh+zPDaizsIGWi58OKjTQ8NTqbi78BkHQ==');
          audio.volume = 0.5;
          audio.play().catch(err => {
            console.error('Bell sound playback failed:', err);
          });
        });

        // Set up output listener
        const removeOutputListener = window.electronAPI.shell.onOutput(result.processId!, (data) => {
          terminalInstance.terminal.write(data);
        });

        // Set up exit listener
        const removeExitListener = window.electronAPI.shell.onExit(result.processId!, (code) => {
          terminalInstance.terminal.writeln(`\r\n[Shell exited with code ${code}]`);
          terminalInstance.processId = '';
        });

        // Store listeners for cleanup
        removeListenersRef.current = [
          () => disposable.dispose(),
          () => bellDisposable.dispose(),
          removeOutputListener,
          removeExitListener
        ];

        // Set initial PTY size
        setTimeout(() => {
          terminalManager.resizeTerminal(worktreePath, terminalId);
        }, 100);

      } catch (error) {
        terminalInstance.terminal.writeln(`\r\nError starting shell: ${error}\r\n`);
      }
    };

    startShell();

    return () => {
      // Note: We don't kill the process here, as we want to keep it running
      // The process will only be killed when the terminal is explicitly closed
    };
  }, [terminalInstance, worktreePath, terminalId]);

  // Update theme when prop changes
  useEffect(() => {
    terminalManager.updateTheme(theme);
  }, [theme]);

  // Detect IDEs in the worktree
  useEffect(() => {
    const detectIDEs = async () => {
      try {
        const result = await window.electronAPI.ide.detect();
        setDetectedIDEs(result);
      } catch (error) {
        console.error('Failed to detect IDEs:', error);
      }
    };

    detectIDEs();
  }, [worktreePath]);

  const handleOpenInIDE = async (ideName: string) => {
    try {
      const result = await window.electronAPI.ide.open(ideName, worktreePath);
      if (result.success) {
        toast({
          title: "IDE Opened",
          description: `${ideName} has been opened for this worktree.`,
        });
      } else {
        toast({
          title: "Failed to open IDE",
          description: result.error || "Unknown error occurred",
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

  const handleCloseTerminal = () => {
    if (!canClose) return;
    
    // Clean up the terminal process and instance
    // Note: We don't have a kill method, the process will be cleaned up when the terminal is destroyed
    
    // Destroy the terminal completely
    terminalManager.destroyTerminal(worktreePath, terminalId);
    
    // Notify parent to remove this terminal from the grid
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-2 py-1 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Terminal {terminalId.split('-')[1]}</span>
        </div>
        <div className="flex items-center gap-1">
          {detectedIDEs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Code2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={onSplit}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </Button>
          {canClose && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={handleCloseTerminal}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}