import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { VSCodeTerminal } from '@vibetree/ui';
import { GitDiffView } from './GitDiffView';
import { Terminal, GitBranch } from 'lucide-react';

interface RightPaneViewProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
}

export function RightPaneView({ worktreePath, projectId, theme }: RightPaneViewProps) {
  const [activeTab, setActiveTab] = useState('terminal');

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
          className="flex-1 m-0 h-full"
        >
          <VSCodeTerminal 
            shellLaunchConfig={{
              cwd: worktreePath,
              name: `Terminal - ${worktreePath.split('/').pop()}`
            }}
            configuration={{
              theme: theme === 'light' ? {
                background: '#ffffff',
                foreground: '#000000',
                cursor: '#000000'
              } : {
                background: '#1e1e1e',
                foreground: '#cccccc',
                cursor: '#ffffff'
              }
            }}
            className="h-full"
          />
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