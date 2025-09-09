import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createHtmlPortalNode, InPortal, OutPortal, HtmlPortalNode } from 'react-reverse-portal';
import { ClaudeTerminal } from './ClaudeTerminal';
import { SplitLayout, SplitNode, SplitDirection } from './SplitLayout';

interface TerminalManagerProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

interface TerminalInstance {
  id: string;
  worktreePath: string;
  portalNode: HtmlPortalNode;
  processId?: string;
}

interface WorktreeTerminals {
  worktreePath: string;
  terminals: Map<string, TerminalInstance>;
  rootNode: SplitNode;
}

const worktreeTerminalsCache = new Map<string, WorktreeTerminals>();

export function TerminalManager({ worktreePath, projectId, theme }: TerminalManagerProps) {
  const [worktreeTerminals, setWorktreeTerminals] = useState<Map<string, WorktreeTerminals>>(worktreeTerminalsCache);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalProcessIds = useRef<Map<string, string>>(new Map());

  const createTerminalNode = useCallback((worktreePath: string): { terminal: TerminalInstance, node: SplitNode } => {
    const terminalId = `${worktreePath}-${Date.now()}-${Math.random()}`;
    const portalNode = createHtmlPortalNode();
    
    const terminal: TerminalInstance = {
      id: terminalId,
      worktreePath,
      portalNode
    };
    
    const node: SplitNode = {
      id: terminalId,
      type: 'terminal',
      portalNode
    };
    return { terminal, node };
  }, []);

  useEffect(() => {
    if (!worktreeTerminalsCache.has(worktreePath)) {
      console.log('Creating initial terminal for:', worktreePath);
      
      const { terminal, node } = createTerminalNode(worktreePath);
      
      const worktreeData: WorktreeTerminals = {
        worktreePath,
        terminals: new Map([[terminal.id, terminal]]),
        rootNode: node
      };
      
      worktreeTerminalsCache.set(worktreePath, worktreeData);
      setWorktreeTerminals(new Map(worktreeTerminalsCache));
      
      // Force a resize event after a short delay to ensure DOM is updated
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }
  }, [worktreePath, createTerminalNode]);

  const findNodeAndParent = (
    node: SplitNode, 
    targetId: string, 
    parent: SplitNode | null = null
  ): { node: SplitNode | null, parent: SplitNode | null } => {
    if (node.id === targetId) {
      return { node, parent };
    }
    
    if (node.type === 'split' && node.children) {
      for (const child of node.children) {
        const result = findNodeAndParent(child, targetId, node);
        if (result.node) {
          return result;
        }
      }
    }
    
    return { node: null, parent: null };
  };

  const countTerminals = (node: SplitNode): number => {
    if (node.type === 'terminal') {
      return 1;
    }
    
    if (node.type === 'split' && node.children) {
      return node.children.reduce((count, child) => count + countTerminals(child), 0);
    }
    
    return 0;
  };

  const handleSplit = useCallback((terminalId: string, direction: SplitDirection) => {
    const worktreeData = worktreeTerminalsCache.get(worktreePath);
    if (!worktreeData) return;

    console.log(`Splitting terminal ${terminalId} ${direction}ly`);
    
    const { node: targetNode, parent } = findNodeAndParent(worktreeData.rootNode, terminalId);
    if (!targetNode) return;
    
    const { terminal: newTerminal, node: newTerminalNode } = createTerminalNode(worktreePath);
    
    worktreeData.terminals.set(newTerminal.id, newTerminal);
    
    if (targetNode.type === 'terminal') {
      const splitNode: SplitNode = {
        id: `split-${Date.now()}-${Math.random()}`,
        type: 'split',
        direction,
        children: [targetNode, newTerminalNode]
      };
      
      if (parent && parent.type === 'split' && parent.children) {
        const index = parent.children.findIndex(child => child.id === terminalId);
        if (index !== -1) {
          parent.children[index] = splitNode;
        }
      } else {
        worktreeData.rootNode = splitNode;
      }
    } else if (targetNode.type === 'split' && targetNode.children) {
      if (targetNode.direction === direction) {
        targetNode.children.push(newTerminalNode);
      } else {
        const splitNode: SplitNode = {
          id: `split-${Date.now()}-${Math.random()}`,
          type: 'split',
          direction,
          children: [targetNode, newTerminalNode]
        };
        
        if (parent && parent.type === 'split' && parent.children) {
          const index = parent.children.findIndex(child => child.id === targetNode.id);
          if (index !== -1) {
            parent.children[index] = splitNode;
          }
        } else {
          worktreeData.rootNode = splitNode;
        }
      }
    }
    
    setWorktreeTerminals(new Map(worktreeTerminalsCache));
    
    // Force a resize event after a short delay to ensure DOM is updated
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  }, [worktreePath, createTerminalNode]);

  const removeNodeFromTree = (node: SplitNode, targetId: string): SplitNode | null => {
    if (node.type === 'terminal') {
      return node.id === targetId ? null : node;
    }
    
    if (node.type === 'split' && node.children) {
      const newChildren = node.children
        .map(child => removeNodeFromTree(child, targetId))
        .filter((child): child is SplitNode => child !== null);
      
      if (newChildren.length === 0) {
        return null;
      } else if (newChildren.length === 1) {
        return newChildren[0];
      } else {
        return { ...node, children: newChildren };
      }
    }
    
    return node;
  };

  const handleClose = useCallback(async (terminalId: string) => {
    const worktreeData = worktreeTerminalsCache.get(worktreePath);
    if (!worktreeData) return;

    const terminalCount = countTerminals(worktreeData.rootNode);
    if (terminalCount <= 1) {
      console.log('Cannot close the last terminal');
      return;
    }

    console.log('Closing terminal:', terminalId);
    
    const processId = terminalProcessIds.current.get(terminalId);
    if (processId) {
      console.log('Terminating PTY for terminal:', terminalId, 'processId:', processId);
      try {
        await window.electronAPI.shell.terminate(processId);
      } catch (error) {
        console.error('Error terminating PTY:', error);
      }
      terminalProcessIds.current.delete(terminalId);
    }
    
    worktreeData.terminals.delete(terminalId);
    
    const newRoot = removeNodeFromTree(worktreeData.rootNode, terminalId);
    if (newRoot) {
      worktreeData.rootNode = newRoot;
    }
    
    setWorktreeTerminals(new Map(worktreeTerminalsCache));
  }, [worktreePath]);

  const handleTerminalProcessId = useCallback((terminalId: string, processId: string) => {
    if (processId) {
      terminalProcessIds.current.set(terminalId, processId);
    }
  }, []);

  const currentWorktreeData = useMemo(() => {
    return worktreeTerminals.get(worktreePath);
  }, [worktreeTerminals, worktreePath]);

  const allTerminals = useMemo(() => {
    const terminals: TerminalInstance[] = [];
    worktreeTerminals.forEach(worktreeData => {
      worktreeData.terminals.forEach(terminal => {
        terminals.push(terminal);
      });
    });
    return terminals;
  }, [worktreeTerminals]);

  const currentTerminalIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentWorktreeData) {
      currentWorktreeData.terminals.forEach(terminal => {
        ids.add(terminal.id);
      });
    }
    return ids;
  }, [currentWorktreeData]);

  const canClose = useMemo(() => {
    if (!currentWorktreeData) return false;
    const terminalCount = countTerminals(currentWorktreeData.rootNode);
    console.log('[TerminalManager] Terminal count:', terminalCount, 'canClose:', terminalCount > 1);
    console.log('[TerminalManager] Root node structure:', currentWorktreeData.rootNode);
    return terminalCount > 1;
  }, [currentWorktreeData]);

  // Watch for DOM changes and trigger resize when terminals are added/removed
  useEffect(() => {
    if (!containerRef.current) return;

    // Create a MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      // Check if any terminals were added or removed
      const hasStructuralChange = mutations.some(mutation => 
        mutation.type === 'childList' && 
        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
      );

      if (hasStructuralChange) {
        // Trigger a resize event to ensure all terminals fit properly
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
      }
    });

    // Start observing the container for child changes
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, []);
  return (
    <div ref={containerRef} className="terminal-manager-root flex-1 h-full relative">
      {allTerminals.map((terminal) => (
        <InPortal key={terminal.id} node={terminal.portalNode}>
          <ClaudeTerminal
            worktreePath={terminal.worktreePath}
            projectId={projectId}
            theme={theme}
            terminalId={terminal.id}
            isVisible={currentTerminalIds.has(terminal.id)}
            onSplitVertical={() => handleSplit(terminal.id, 'vertical')}
            onSplitHorizontal={() => handleSplit(terminal.id, 'horizontal')}
            onClose={() => handleClose(terminal.id)}
            canClose={canClose}
            onProcessIdChange={(processId) => handleTerminalProcessId(terminal.id, processId)}
          />
        </InPortal>
      ))}
      
      {currentWorktreeData && (
        <SplitLayout
          node={currentWorktreeData.rootNode}
          onSplit={handleSplit}
          onClose={handleClose}
          canClose={canClose}
        />
      )}
    </div>
  );
}