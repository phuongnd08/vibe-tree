import { useEffect, useState } from 'react';
import { WorktreePanel } from './components/WorktreePanel';
import { TerminalView } from './components/TerminalView';
import { GitDiffView } from './components/GitDiffView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProjectSelector } from './components/ProjectSelector';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@vibetree/ui';
import { useAppStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { Sun, Moon, Plus, X, Terminal, GitBranch } from 'lucide-react';

function App() {
  const { projects, activeProjectId, addProject, removeProject, setActiveProject, setSelectedTab, theme, setTheme } = useAppStore();
  const { connect } = useWebSocket();
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  
  // Get active project for future use
  // const activeProject = getActiveProject();

  useEffect(() => {
    // Auto-connect on mount
    connect();
  }, []);

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(systemTheme);
    }
  }, [setTheme]);

  useEffect(() => {
    // Apply theme class to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleSelectProject = (path: string) => {
    addProject(path);
    setShowProjectSelector(false);
  };

  const handleCloseProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    removeProject(projectId);
  };

  // Show project selector if no projects exist or explicitly requested
  if (projects.length === 0 || showProjectSelector) {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">VibeTree</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">Web Terminal</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <ConnectionStatus />
          </div>
        </header>

        {/* Project Selector */}
        <ProjectSelector onSelectProject={handleSelectProject} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">VibeTree</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">Web Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <ConnectionStatus />
        </div>
      </header>

      {/* Project Tabs and Content */}
      <Tabs 
        value={activeProjectId || ''} 
        onValueChange={setActiveProject}
        className="flex-1 flex flex-col"
      >
        <div className="border-b flex items-center gap-2 bg-muted/50 h-10">
          <TabsList className="h-full bg-transparent p-0 rounded-none">
            {projects.map((project) => (
              <TabsTrigger
                key={project.id}
                value={project.id}
                className="relative pr-8 h-full data-[state=active]:bg-background data-[state=active]:rounded-t-md data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-b-0"
              >
                {project.name}
                <span
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 p-0.5 hover:bg-muted rounded cursor-pointer inline-flex items-center justify-center"
                  onClick={(e) => handleCloseProject(e, project.id)}
                >
                  <X className="h-3 w-3" />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <button
            onClick={() => setShowProjectSelector(true)}
            className="h-8 w-8 p-0 hover:bg-accent rounded transition-colors inline-flex items-center justify-center"
            aria-label="Add project"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {projects.map((project) => (
          <TabsContent 
            key={project.id} 
            value={project.id}
            className="flex-1 m-0 h-0"
          >
            <div className="flex h-full overflow-hidden">
              {/* Worktree Panel - Always visible on desktop, conditional on mobile */}
              <div className={`
                ${project.selectedWorktree ? 'hidden md:flex' : 'flex'} 
                w-full md:w-80 border-r flex-shrink-0
              `}>
                <WorktreePanel projectId={project.id} />
              </div>

              {/* Main Content Area with Tabs - Only shown when worktree is selected */}
              {project.selectedWorktree ? (
                <div className="flex-1 flex flex-col h-full">
                  {/* Tab Navigation */}
                  <div className="h-10 border-b flex items-center px-2 bg-muted/30 flex-shrink-0">
                    <div className="flex">
                      <button
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                          project.selectedTab === 'terminal'
                            ? 'bg-background text-foreground border shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedTab(project.id, 'terminal')}
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        Terminal
                      </button>
                      <button
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ml-1 ${
                          project.selectedTab === 'changes'
                            ? 'bg-background text-foreground border shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedTab(project.id, 'changes')}
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        Changes
                      </button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-hidden relative">
                    {/* Keep TerminalView mounted but hidden to preserve history */}
                    <div className={`absolute inset-0 ${project.selectedTab === 'terminal' ? 'block' : 'hidden'}`}>
                      <TerminalView />
                    </div>
                    
                    {/* Keep GitDiffView mounted but hidden to preserve state */}
                    <div className={`absolute inset-0 ${project.selectedTab === 'changes' ? 'block' : 'hidden'}`}>
                      <GitDiffView worktreePath={project.selectedWorktree} theme={theme} />
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty state when no worktree selected */
                <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="text-lg mb-2">Select a worktree to start</p>
                    <p className="text-sm">Choose from the panel on the left</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default App;