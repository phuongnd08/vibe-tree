import { useState, useCallback, useEffect } from 'react';
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

  const handleSplit = useCallback((terminalId: string) => {
    console.log(`[ClaudeTerminalGrid] handleSplit called for terminal: ${terminalId}`);
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

      const newRoot = cloneNode(prevRoot);
      const targetNode = findNodeById(newRoot, terminalId);
      
      if (targetNode && targetNode.type === 'terminal') {
        // Convert terminal node to split node
        const newTerminalId = `terminal-${nextTerminalId}`;
        const splitNodeId = `split-${nextTerminalId}`;
        setNextTerminalId(prev => prev + 1);
        
        // Create a new split node
        const newSplitNode: GridNode = {
          id: splitNodeId,
          type: 'split',
          direction: 'vertical',
          children: [
            { id: targetNode.id, type: 'terminal' }, // Keep existing terminal
            { id: newTerminalId, type: 'terminal' }   // Create new terminal
          ]
        };
        
        // Replace the target node with the split node
        if (targetNode === newRoot) {
          // If we're splitting the root, replace the entire root
          console.log(`[ClaudeTerminalGrid] Split complete - new root structure:`, newSplitNode);
          return newSplitNode;
        } else {
          // Replace the target node in its parent
          const replaceInParent = (node: GridNode): GridNode => {
            if (node.type === 'terminal') return node;
            if (node.children) {
              return {
                ...node,
                children: [
                  node.children[0].id === terminalId ? newSplitNode : replaceInParent(node.children[0]),
                  node.children[1].id === terminalId ? newSplitNode : replaceInParent(node.children[1])
                ]
              };
            }
            return node;
          };
          return replaceInParent(newRoot);
        }
      }
      
      return newRoot;
    });
  }, [findNodeById, nextTerminalId]);

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

  const renderNode = useCallback((node: GridNode): React.ReactElement => {
    if (node.type === 'terminal') {
      const totalTerminals = countTerminals(rootNode);
      console.log(`[ClaudeTerminalGrid] Rendering terminal node: ${node.id}, total terminals: ${totalTerminals}`);
      return (
        <ClaudeTerminalSingle
          key={node.id}
          worktreePath={worktreePath}
          projectId={projectId}
          theme={theme}
          terminalId={node.id}
          onSplit={() => handleSplit(node.id)}
          onClose={() => handleClose(node.id)}
          canClose={totalTerminals > 1}
        />
      );
    }

    if (node.children) {
      const direction = node.direction || 'vertical';
      const flexDirection = direction === 'horizontal' ? 'flex-col' : 'flex-row';
      const borderClass = direction === 'horizontal' ? 'border-b' : 'border-r';
      
      console.log(`[ClaudeTerminalGrid] Rendering split node: ${node.id}, direction: ${direction}, children: [${node.children[0].id}, ${node.children[1].id}]`);
      
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
  }, [rootNode, worktreePath, projectId, theme, handleSplit, handleClose, countTerminals]);

  return (
    <div className="w-full h-full">
      {renderNode(rootNode)}
    </div>
  );
}