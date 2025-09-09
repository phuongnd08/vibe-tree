import React, { useState, useRef, useEffect } from 'react';
import { HtmlPortalNode, OutPortal } from 'react-reverse-portal';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  id: string;
  type: 'terminal' | 'split';
  direction?: SplitDirection;
  children?: SplitNode[];
  portalNode?: HtmlPortalNode;
  size?: number;
}

interface SplitLayoutProps {
  node: SplitNode;
  onSplit: (nodeId: string, direction: SplitDirection) => void;
  onClose: (nodeId: string) => void;
  canClose: boolean;
}

interface SplitterProps {
  direction: SplitDirection;
  onResize: (delta: number) => void;
}

const Splitter: React.FC<SplitterProps> = ({ direction, onResize }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === 'vertical' 
        ? e.clientX - startPosRef.current
        : e.clientY - startPosRef.current;
      
      if (Math.abs(delta) > 2) {
        onResize(delta);
        startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY;
  };

  return (
    <div
      className={`splitter ${direction} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      style={{
        cursor: direction === 'vertical' ? 'col-resize' : 'row-resize',
        backgroundColor: 'var(--border)',
        flexShrink: 0,
        ...(direction === 'vertical' 
          ? { width: '4px', height: '100%' }
          : { height: '4px', width: '100%' })
      }}
    >
      <div 
        className="splitter-handle"
        style={{
          width: '100%',
          height: '100%',
          opacity: isDragging ? 0.5 : 0,
          backgroundColor: 'var(--primary)',
          transition: 'opacity 0.2s'
        }}
      />
    </div>
  );
};

export const SplitLayout: React.FC<SplitLayoutProps> = ({ 
  node, 
  onSplit, 
  onClose,
  canClose 
}) => {
  const [childSizes, setChildSizes] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (node.type === 'split' && node.children) {
      const initialSizes = node.children.map(() => 100 / node.children!.length);
      setChildSizes(initialSizes);
    }
  }, [node]);

  const handleResize = (index: number, delta: number) => {
    if (node.type !== 'split' || !node.children) return;
    
    const containerSize = node.direction === 'vertical'
      ? containerRef.current?.offsetWidth || 0
      : containerRef.current?.offsetHeight || 0;
    
    if (containerSize === 0) return;
    
    const deltaPercent = (delta / containerSize) * 100;
    const newSizes = [...childSizes];
    
    const minSize = 10;
    
    if (newSizes[index] + deltaPercent >= minSize && 
        newSizes[index + 1] - deltaPercent >= minSize) {
      newSizes[index] += deltaPercent;
      newSizes[index + 1] -= deltaPercent;
      setChildSizes(newSizes);
    }
  };

  if (node.type === 'terminal' && node.portalNode) {
    return (
      <div className="terminal-outportal-wrapper flex-1 h-full relative flex flex-col">
        <OutPortal node={node.portalNode} />
      </div>
    );
  }

  if (node.type === 'split' && node.children && node.children.length > 0) {
    const flexDirection = node.direction === 'vertical' ? 'row' : 'column';
    
    return (
      <div 
        ref={containerRef}
        className="split-container flex h-full w-full"
        style={{ flexDirection }}
      >
        {node.children.map((child, index) => (
          <React.Fragment key={child.id}>
            <div 
              className="split-pane"
              style={{ 
                flex: `0 0 ${childSizes[index] || 50}%`,
                overflow: 'hidden',
                display: 'flex'
              }}
            >
              <SplitLayout 
                node={child} 
                onSplit={onSplit}
                onClose={onClose}
                canClose={canClose}
              />
            </div>
            {index < node.children!.length - 1 && (
              <Splitter 
                direction={node.direction!}
                onResize={(delta) => handleResize(index, delta)}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return null;
};