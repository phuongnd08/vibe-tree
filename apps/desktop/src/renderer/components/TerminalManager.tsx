import { useEffect, useRef, useState, useMemo } from 'react';
import { createHtmlPortalNode, InPortal, OutPortal, HtmlPortalNode } from 'react-reverse-portal';
import { ClaudeTerminal } from './ClaudeTerminal';

interface TerminalManagerProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

interface TerminalPortal {
  worktreePath: string;
  portalNode: HtmlPortalNode;
}

// Global cache for terminal portals - persists across component re-renders
const terminalPortalsCache = new Map<string, TerminalPortal>();

export function TerminalManager({ worktreePath, projectId, theme }: TerminalManagerProps) {
  const [terminalPortals, setTerminalPortals] = useState<Map<string, TerminalPortal>>(terminalPortalsCache);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create or get portal for current worktree
  useEffect(() => {
    if (!terminalPortalsCache.has(worktreePath)) {
      console.log('Creating new terminal portal for:', worktreePath);
      
      // Create a new portal node for this worktree
      const portalNode = createHtmlPortalNode();
      const portal: TerminalPortal = {
        worktreePath,
        portalNode
      };
      
      // Add to global cache
      terminalPortalsCache.set(worktreePath, portal);
      
      // Update state to trigger re-render
      setTerminalPortals(new Map(terminalPortalsCache));
    }
  }, [worktreePath]);

  // Get all terminal portals that have been created
  const allPortals = useMemo(() => Array.from(terminalPortals.values()), [terminalPortals]);

  return (
    <div ref={containerRef} className="terminal-manager-root flex-1 h-full relative">
      {/* Render all terminals into their portals (this happens once per terminal) */}
      {allPortals.map((portal) => (
        <InPortal key={portal.worktreePath} node={portal.portalNode}>
          <ClaudeTerminal
            worktreePath={portal.worktreePath}
            projectId={projectId}
            theme={theme}
            isVisible={portal.worktreePath === worktreePath}
          />
        </InPortal>
      ))}
      
      {/* Show only the current worktree's terminal via OutPortal */}
      {allPortals.map((portal) => (
        <div
          key={`out-${portal.worktreePath}`}
          className="terminal-outportal-wrapper absolute inset-0 w-full h-full"
          style={{
            display: portal.worktreePath === worktreePath ? 'block' : 'none',
            visibility: portal.worktreePath === worktreePath ? 'visible' : 'hidden'
          }}
        >
          {portal.worktreePath === worktreePath && (
            <OutPortal node={portal.portalNode} />
          )}
        </div>
      ))}
    </div>
  );
}