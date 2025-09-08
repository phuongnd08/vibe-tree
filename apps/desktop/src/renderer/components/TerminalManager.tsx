import { useEffect, useRef, useState, useMemo, memo } from 'react';
import { ClaudeTerminal } from './ClaudeTerminal';

interface TerminalManagerProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

// Memoized terminal component to prevent re-renders
const MemoizedTerminal = memo(ClaudeTerminal);

export function TerminalManager({ worktreePath, projectId, theme }: TerminalManagerProps) {
  const [terminalsMap, setTerminalsMap] = useState<Map<string, boolean>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Track which terminals have been created
  useEffect(() => {
    setTerminalsMap(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(worktreePath)) {
        newMap.set(worktreePath, true);
      }
      return newMap;
    });
  }, [worktreePath]);

  // Get all terminal paths that have been created
  const terminalPaths = useMemo(() => Array.from(terminalsMap.keys()), [terminalsMap]);

  return (
    <div ref={containerRef} className="flex-1 h-full relative">
      {terminalPaths.map((path) => (
        <div
          key={path}
          className="absolute inset-0 w-full h-full"
          style={{
            display: path === worktreePath ? 'block' : 'none',
            visibility: path === worktreePath ? 'visible' : 'hidden'
          }}
        >
          <MemoizedTerminal
            worktreePath={path}
            projectId={projectId}
            theme={theme}
            isVisible={path === worktreePath}
          />
        </div>
      ))}
    </div>
  );
}