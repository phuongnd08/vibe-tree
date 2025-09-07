import { describe, it, expect } from 'vitest';

// Mock the grid node logic since we can't easily test React components
interface GridNode {
  id: string;
  type: 'terminal' | 'split';
  children?: [GridNode, GridNode];
  direction?: 'horizontal' | 'vertical';
}

// Utility functions for testing the grid logic
function findNodeById(node: GridNode, id: string): GridNode | null {
  if (node.id === id) return node;
  if (node.children) {
    return findNodeById(node.children[0], id) || findNodeById(node.children[1], id);
  }
  return null;
}

function countTerminals(node: GridNode): number {
  if (node.type === 'terminal') return 1;
  if (node.children) {
    return countTerminals(node.children[0]) + countTerminals(node.children[1]);
  }
  return 0;
}

function splitNode(root: GridNode, terminalId: string, nextId: number): { newRoot: GridNode; nextId: number } {
  const cloneNode = (node: GridNode): GridNode => {
    if (node.type === 'terminal') {
      return { ...node };
    }
    return {
      ...node,
      children: node.children ? [cloneNode(node.children[0]), cloneNode(node.children[1])] : undefined
    };
  };

  const newRoot = cloneNode(root);
  const targetNode = findNodeById(newRoot, terminalId);
  
  if (targetNode && targetNode.type === 'terminal') {
    const newTerminalId = `terminal-${nextId}`;
    
    targetNode.type = 'split';
    targetNode.direction = 'vertical';
    targetNode.children = [
      { id: targetNode.id, type: 'terminal' },
      { id: newTerminalId, type: 'terminal' }
    ];
    
    return { newRoot, nextId: nextId + 1 };
  }
  
  return { newRoot, nextId };
}

function closeNode(root: GridNode, terminalId: string): GridNode {
  const totalTerminals = countTerminals(root);
  
  // Prevent closing the last terminal
  if (totalTerminals <= 1) {
    return root;
  }

  const cloneNode = (node: GridNode): GridNode => {
    if (node.type === 'terminal') {
      return { ...node };
    }
    return {
      ...node,
      children: node.children ? [cloneNode(node.children[0]), cloneNode(node.children[1])] : undefined
    };
  };

  const findParentOfTerminal = (node: GridNode, targetId: string, parent: GridNode | null = null): { parent: GridNode | null, childIndex: number } | null => {
    if (node.id === targetId && parent) {
      const childIndex = parent.children?.[0].id === targetId ? 0 : 1;
      return { parent, childIndex };
    }
    if (node.children) {
      return findParentOfTerminal(node.children[0], targetId, node) || 
             findParentOfTerminal(node.children[1], targetId, node);
    }
    return null;
  };

  const newRoot = cloneNode(root);
  
  // If trying to close the root terminal and it's the only one, don't allow it
  if (newRoot.id === terminalId && newRoot.type === 'terminal') {
    return root;
  }
  
  const parentInfo = findParentOfTerminal(newRoot, terminalId);
  
  if (parentInfo && parentInfo.parent && parentInfo.parent.children) {
    // Get the sibling node (the one we'll keep)
    const siblingIndex = parentInfo.childIndex === 0 ? 1 : 0;
    const sibling = parentInfo.parent.children[siblingIndex];
    
    // If this is the root split, make sibling the new root
    if (parentInfo.parent === newRoot) {
      return sibling;
    }
    
    // Otherwise, replace parent with sibling
    const grandparent = findParentOfTerminal(newRoot, parentInfo.parent.id);
    if (grandparent && grandparent.parent && grandparent.parent.children) {
      grandparent.parent.children[grandparent.childIndex] = sibling;
    }
  }
  
  return newRoot;
}

function getAllTerminalIds(node: GridNode): string[] {
  if (node.type === 'terminal') {
    return [node.id];
  }
  if (node.children) {
    return [
      ...getAllTerminalIds(node.children[0]),
      ...getAllTerminalIds(node.children[1])
    ];
  }
  return [];
}

describe('ClaudeTerminalGrid Logic', () => {
  it('should start with a single terminal', () => {
    const root: GridNode = {
      id: 'terminal-1',
      type: 'terminal'
    };
    
    expect(countTerminals(root)).toBe(1);
    expect(root.type).toBe('terminal');
  });

  it('should split a terminal into two terminals', () => {
    let root: GridNode = {
      id: 'terminal-1',
      type: 'terminal'
    };
    
    const result = splitNode(root, 'terminal-1', 2);
    root = result.newRoot;
    
    expect(countTerminals(root)).toBe(2);
    expect(root.type).toBe('split');
    expect(root.children).toBeDefined();
    expect(root.children![0].id).toBe('terminal-1');
    expect(root.children![1].id).toBe('terminal-2');
  });

  it('should allow recursive splitting (the test scenario)', () => {
    let root: GridNode = {
      id: 'terminal-1',
      type: 'terminal'
    };
    let nextId = 2;

    // Step 1: Split terminal-1 to get terminal-1 and terminal-2
    const result1 = splitNode(root, 'terminal-1', nextId);
    root = result1.newRoot;
    nextId = result1.nextId;

    expect(countTerminals(root)).toBe(2);
    const terminals1 = getAllTerminalIds(root);
    expect(terminals1).toContain('terminal-1');
    expect(terminals1).toContain('terminal-2');

    // Step 2: Split terminal-2 to get terminal-2 and terminal-3
    const result2 = splitNode(root, 'terminal-2', nextId);
    root = result2.newRoot;
    nextId = result2.nextId;

    expect(countTerminals(root)).toBe(3);
    const terminals2 = getAllTerminalIds(root);
    expect(terminals2).toContain('terminal-1');
    expect(terminals2).toContain('terminal-2');
    expect(terminals2).toContain('terminal-3');

    // Step 3: Close terminal-2 (the middle one)
    root = closeNode(root, 'terminal-2');

    // Should have 2 terminals left: terminal-1 and terminal-3
    expect(countTerminals(root)).toBe(2);
    const remainingTerminals = getAllTerminalIds(root);
    expect(remainingTerminals).toContain('terminal-1');
    expect(remainingTerminals).toContain('terminal-3');
    expect(remainingTerminals).not.toContain('terminal-2');
  });

  it('should prevent closing the last terminal', () => {
    const root: GridNode = {
      id: 'terminal-1',
      type: 'terminal'
    };

    const newRoot = closeNode(root, 'terminal-1');
    
    // Should be unchanged
    expect(newRoot).toEqual(root);
    expect(countTerminals(newRoot)).toBe(1);
  });

  it('should handle complex splitting and closing scenarios', () => {
    let root: GridNode = {
      id: 'terminal-1',
      type: 'terminal'
    };
    let nextId = 2;

    // Create a more complex tree: ((1,2), 3)
    const result1 = splitNode(root, 'terminal-1', nextId);
    root = result1.newRoot;
    nextId = result1.nextId;

    const result2 = splitNode(root, 'terminal-2', nextId);
    root = result2.newRoot;
    nextId = result2.nextId;

    expect(countTerminals(root)).toBe(3);

    // Close terminal-1 (leaf node)
    root = closeNode(root, 'terminal-1');
    
    expect(countTerminals(root)).toBe(2);
    const remaining = getAllTerminalIds(root);
    expect(remaining).toContain('terminal-2');
    expect(remaining).toContain('terminal-3');
    expect(remaining).not.toContain('terminal-1');
  });
});