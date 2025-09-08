import { useEffect, useRef, useState } from 'react';
import { ClaudeTerminal } from './ClaudeTerminal';

interface TerminalManagerProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

interface TerminalInstance {
  worktreePath: string;
  isVisible: boolean;
}

export function TerminalManager({ worktreePath, projectId, theme }: TerminalManagerProps) {
  const [terminals, setTerminals] = useState<Map<string, TerminalInstance>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTerminals(prevTerminals => {
      const newTerminals = new Map(prevTerminals);
      
      // Hide all existing terminals
      for (const [path, terminal] of newTerminals) {
        if (terminal.isVisible) {
          newTerminals.set(path, {
            ...terminal,
            isVisible: false
          });
        }
      }
      
      // Show or create terminal for current worktree
      if (!newTerminals.has(worktreePath)) {
        // Create new terminal instance
        newTerminals.set(worktreePath, {
          worktreePath,
          isVisible: true
        });
      } else {
        // Show existing terminal
        const existingTerminal = newTerminals.get(worktreePath)!;
        newTerminals.set(worktreePath, {
          ...existingTerminal,
          isVisible: true
        });
      }
      
      return newTerminals;
    });
  }, [worktreePath, projectId, theme]);


  return (
    <div ref={containerRef} className="flex-1 h-full relative">
      {Array.from(terminals.values()).map((terminal) => (
        <div
          key={terminal.worktreePath}
          className="absolute inset-0 w-full h-full"
          style={{
            display: terminal.isVisible ? 'block' : 'none'
          }}
        >
          <ClaudeTerminal
            key={terminal.worktreePath}
            worktreePath={terminal.worktreePath}
            projectId={projectId}
            theme={theme}
          />
        </div>
      ))}
    </div>
  );
}