import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ClaudeTerminalGrid } from './ClaudeTerminalGrid';
import { GitDiffView } from './GitDiffView';
import { Terminal, GitBranch } from 'lucide-react';

interface RightPaneViewProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

// Store terminal grid instances for each worktree
const terminalGridInstances = new Map<string, HTMLDivElement>();

export function RightPaneView({ worktreePath, projectId, theme }: RightPaneViewProps) {
  const [activeTab, setActiveTab] = useState('terminal');
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const [mountedWorktrees, setMountedWorktrees] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!worktreePath || !terminalContainerRef.current) return;

    // Mount this worktree's terminal grid if not already mounted
    if (!mountedWorktrees.has(worktreePath)) {
      setMountedWorktrees(prev => new Set([...prev, worktreePath]));
    }

    // Show/hide terminal grids based on current worktree
    terminalGridInstances.forEach((gridElement, path) => {
      if (path === worktreePath) {
        gridElement.style.display = 'block';
      } else {
        gridElement.style.display = 'none';
      }
    });
  }, [worktreePath]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <div className="border-b flex items-center bg-muted/50 h-12">
          <TabsList className="h-full bg-transparent p-0 rounded-none ml-4">
            <TabsTrigger
              value="terminal"
              className="h-full data-[state=active]:bg-background data-[state=active]:rounded-t-md data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-b-0 flex items-center gap-2"
            >
              <Terminal className="h-4 w-4" />
              Terminal
            </TabsTrigger>
            <TabsTrigger
              value="git-diff"
              className="h-full data-[state=active]:bg-background data-[state=active]:rounded-t-md data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-b-0 flex items-center gap-2"
            >
              <GitBranch className="h-4 w-4" />
              Git Diff
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent 
          value="terminal"
          className="flex-1 m-0 h-full relative"
        >
          <div ref={terminalContainerRef} className="absolute inset-0">
            {/* Render a terminal grid for each mounted worktree */}
            {Array.from(mountedWorktrees).map(path => (
              <div 
                key={path}
                ref={(el) => {
                  if (el) {
                    terminalGridInstances.set(path, el);
                  } else {
                    terminalGridInstances.delete(path);
                  }
                }}
                className="absolute inset-0"
                style={{ display: path === worktreePath ? 'block' : 'none' }}
              >
                <ClaudeTerminalGrid 
                  worktreePath={path} 
                  projectId={projectId}
                  theme={theme}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent 
          value="git-diff"
          className="flex-1 m-0 h-full"
        >
          <GitDiffView worktreePath={worktreePath} theme={theme} />
        </TabsContent>
      </Tabs>
    </div>
  );
}