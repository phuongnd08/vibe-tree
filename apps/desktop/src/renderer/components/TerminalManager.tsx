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
  
  // Get the current portal
  const currentPortal = useMemo(() => 
    allPortals.find(p => p.worktreePath === worktreePath), 
    [allPortals, worktreePath]
  );

  return (
    <>
      {/* Hidden container for InPortal elements - outside of the visible area */}
      <div style={{ display: 'none' }}>
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
      </div>
      
      {/* Visible container for the current terminal */}
      <div ref={containerRef} className="flex-1 h-full flex flex-col">
        {currentPortal && (
          <OutPortal node={currentPortal.portalNode} />
        )}
      </div>
    </>
  );
}