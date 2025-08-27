import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Eye, Edit3 } from 'lucide-react';
import { DirectoryBrowser } from '@vibetree/ui';
import { getGlobalAdapter } from '../adapters/globalWebSocketAdapter';

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
}

export function ProjectSelector({ onSelectProject }: ProjectSelectorProps) {
  const [projectPath, setProjectPath] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [browseMode, setBrowseMode] = useState(false);
  const [currentBrowsePath, setCurrentBrowsePath] = useState('');

  // Initialize default path from environment variable
  useEffect(() => {
    const defaultPath = import.meta.env.VITE_PROJECT_PATH;
    if (defaultPath && !projectPath.trim()) {
      setProjectPath(defaultPath);
      setCurrentBrowsePath(defaultPath);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectPath.trim()) {
      setError('Please enter a project path');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // For now, just add the project without server validation
      // In Phase 3, we can add server-side validation
      onSelectProject(projectPath.trim());
    } catch (err) {
      setError('Failed to add project. Please check the path.');
    } finally {
      setIsLoading(false);
    }
  };

  // Directory browser functions
  const fetchDirectories = async (path: string) => {
    const adapter = getGlobalAdapter();
    if (!adapter) {
      throw new Error('WebSocket adapter not available');
    }
    return await adapter.listDirectories(path);
  };

  const validatePath = async (path: string) => {
    const adapter = getGlobalAdapter();
    if (!adapter) {
      throw new Error('WebSocket adapter not available');
    }
    return await adapter.validatePath(path);
  };

  const handlePathChange = (path: string) => {
    setCurrentBrowsePath(path);
    setProjectPath(path);
  };

  const handleDirectorySelect = (path: string) => {
    setProjectPath(path);
    onSelectProject(path);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className={`w-full space-y-6 ${browseMode ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold">Select a Project</h2>
          <p className="text-muted-foreground">
            {browseMode 
              ? "Browse directories to find your git repository"
              : "Enter the path to your git repository to start working with Claude in parallel worktrees"
            }
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center justify-center gap-2 p-1 bg-muted rounded-md">
          <button
            type="button"
            onClick={() => setBrowseMode(false)}
            className={`flex items-center gap-2 px-3 py-1 text-sm rounded transition-colors ${
              !browseMode 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Edit3 className="h-4 w-4" />
            Input
          </button>
          <button
            type="button"
            onClick={() => setBrowseMode(true)}
            className={`flex items-center gap-2 px-3 py-1 text-sm rounded transition-colors ${
              browseMode 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="h-4 w-4" />
            Browse
          </button>
        </div>

        {browseMode ? (
          // Directory Browser Mode
          <DirectoryBrowser
            currentPath={currentBrowsePath || projectPath || '/'}
            onPathChange={handlePathChange}
            onDirectorySelect={handleDirectorySelect}
            fetchDirectories={fetchDirectories}
            validatePath={validatePath}
            rootLabel="Projects"
          />
        ) : (
          // Manual Input Mode (existing form)
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="projectPath" className="text-sm font-medium">
                Project Path
              </label>
              <input
                id="projectPath"
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                disabled={isLoading}
              />
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !projectPath.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
              {isLoading ? 'Adding Project...' : 'Add Project'}
            </button>
          </form>
        )}

        {!browseMode && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Make sure the path points to a valid git repository
            </p>
          </div>
        )}
      </div>
    </div>
  );
}