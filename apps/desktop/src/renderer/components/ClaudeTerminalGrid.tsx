import { useState, useCallback, useEffect, useMemo } from 'react';
import { ClaudeTerminalSingle } from './ClaudeTerminalSingle';

interface GridNode {
  id: string;
  type: 'terminal' | 'split';
  children?: [GridNode, GridNode]; // Only for split nodes
  direction?: 'horizontal' | 'vertical'; // Only for split nodes
}

interface ClaudeTerminalGridProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

// Cache for terminal grid state per worktree
const worktreeGridStateCache = new Map<string, GridNode>();

export function ClaudeTerminalGrid({ worktreePath, projectId, theme = 'dark' }: ClaudeTerminalGridProps) {
  // Get or create initial state for this worktree
  const getInitialState = useCallback((): GridNode => {
    const cached = worktreeGridStateCache.get(worktreePath);
    if (cached) {
      return cached;
    }
    return {
      id: 'terminal-1',
      type: 'terminal' as const
    };
  }, [worktreePath]);

  const [rootNode, setRootNode] = useState<GridNode>(getInitialState);
  const [nextTerminalId, setNextTerminalId] = useState(2);

  // Handle worktree changes
  useEffect(() => {
    // Load the state for the current worktree
    const cached = worktreeGridStateCache.get(worktreePath);
    if (cached) {
      setRootNode(cached);
    } else {
      // Reset to single terminal for new worktree
      setRootNode({
        id: 'terminal-1',
        type: 'terminal'
      });
    }
  }, [worktreePath]);

  // Save current state to cache when rootNode changes
  useEffect(() => {
    worktreeGridStateCache.set(worktreePath, rootNode);
  }, [worktreePath, rootNode]);

  const findNodeById = useCallback((node: GridNode, id: string): GridNode | null => {
    if (node.id === id) return node;
    if (node.children) {
      return findNodeById(node.children[0], id) || findNodeById(node.children[1], id);
    }
    return null;
  }, []);

  const countTerminals = useCallback((node: GridNode): number => {
    if (node.type === 'terminal') return 1;
    if (node.children) {
      return countTerminals(node.children[0]) + countTerminals(node.children[1]);
    }
    return 0;
  }, []);

  const handleSplit = useCallback((terminalId: string, direction: 'horizontal' | 'vertical' = 'vertical') => {
    console.log(`[ClaudeTerminalGrid] handleSplit called for terminal: ${terminalId}, direction: ${direction}`);
    console.log(`[ClaudeTerminalGrid] Next terminal ID will be: ${nextTerminalId}`);
    setRootNode(prevRoot => {
      console.log(`[ClaudeTerminalGrid] Current root node structure:`, JSON.stringify(prevRoot, null, 2));
      const cloneNode = (node: GridNode): GridNode => {
        if (node.type === 'terminal') {
          return { ...node };
        }
        return {
          ...node,
          children: node.children ? [cloneNode(node.children[0]), cloneNode(node.children[1])] : undefined
        };
      };

      const newRoot = cloneNode(prevRoot);
      
      // Recursive function to find and replace the target node
      const replaceNode = (node: GridNode): GridNode => {
        if (node.id === terminalId && node.type === 'terminal') {
          // Found the target terminal, replace with split
          const newTerminalId = `terminal-${nextTerminalId}`;
          const splitNodeId = `split-${nextTerminalId}`;
          setNextTerminalId(prev => prev + 1);
          
          return {
            id: splitNodeId,
            type: 'split',
            direction: direction,
            children: [
              { id: node.id, type: 'terminal' }, // Keep existing terminal
              { id: newTerminalId, type: 'terminal' }   // Create new terminal
            ]
          };
        } else if (node.type === 'split' && node.children) {
          // Recursively search in children
          return {
            ...node,
            children: [
              replaceNode(node.children[0]),
              replaceNode(node.children[1])
            ]
          };
        }
        return node;
      };
      
      const result = replaceNode(newRoot);
      console.log(`[ClaudeTerminalGrid] Split complete - new structure:`, result);
      return result;
    });
  }, [nextTerminalId]);

  const handleClose = useCallback((terminalId: string) => {
    const totalTerminals = countTerminals(rootNode);
    
    // Prevent closing the last terminal
    if (totalTerminals <= 1) {
      return;
    }

    setRootNode(prevRoot => {
      const cloneNode = (node: GridNode): GridNode => {
        if (node.type === 'terminal') {
          return { ...node };
        }
        return {
          ...node,
          children: node.children ? [cloneNode(node.children[0]), cloneNode(node.children[1])] : undefined
        };
      };

      // Find parent and replace the parent with the sibling
      const findAndReplaceParent = (node: GridNode, targetId: string): GridNode => {
        if (node.type === 'terminal') {
          return node; // No change for terminal nodes
        }
        
        if (node.children) {
          const [left, right] = node.children;
          
          // Check if one of the direct children is the target
          if (left.id === targetId) {
            // Replace this split node with the right child
            return right;
          } else if (right.id === targetId) {
            // Replace this split node with the left child
            return left;
          } else {
            // Recursively process children
            return {
              ...node,
              children: [
                findAndReplaceParent(left, targetId),
                findAndReplaceParent(right, targetId)
              ]
            };
          }
        }
        
        return node;
      };

      const newRoot = cloneNode(prevRoot);
      
      // If trying to close the root terminal and it's the only one, don't allow it
      if (newRoot.id === terminalId && newRoot.type === 'terminal') {
        return prevRoot;
      }
      
      // Apply the replacement logic
      const result = findAndReplaceParent(newRoot, terminalId);
      return result;
    });
  }, [rootNode, countTerminals]);

  // Memoize total terminals count to prevent recalculation on every render
  const totalTerminals = useMemo(() => countTerminals(rootNode), [rootNode, countTerminals]);

  const renderNode = (node: GridNode): React.ReactElement => {
    if (node.type === 'terminal') {
      return (
        <ClaudeTerminalSingle
          key={node.id}
          worktreePath={worktreePath}
          projectId={projectId}
          theme={theme}
          terminalId={node.id}
          onSplit={(direction) => handleSplit(node.id, direction)}
          onClose={() => handleClose(node.id)}
          canClose={totalTerminals > 1}
        />
      );
    }

    if (node.children) {
      const direction = node.direction || 'vertical';
      const flexDirection = direction === 'horizontal' ? 'flex-col' : 'flex-row';
      const borderClass = direction === 'horizontal' ? 'border-b' : 'border-r';
      
      return (
        <div key={node.id} className={`flex ${flexDirection} w-full h-full`}>
          <div className={`flex-1 min-w-0 min-h-0 ${borderClass}`}>
            {renderNode(node.children[0])}
          </div>
          <div className="flex-1 min-w-0 min-h-0">
            {renderNode(node.children[1])}
          </div>
        </div>
      );
    }

    return <div key={node.id}>Invalid node</div>;
  };

  return (
    <div className="w-full h-full">
      {renderNode(rootNode)}
    </div>
  );
}