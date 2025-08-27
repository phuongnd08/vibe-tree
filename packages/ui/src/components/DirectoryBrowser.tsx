import React, { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, FolderOpen, Loader2 } from 'lucide-react';
import { FolderCard } from './FolderCard';
import { PathBreadcrumbs } from './PathBreadcrumbs';

// Types for DirectoryBrowser
interface DirectoryInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface PathValidation {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  error?: string;
}

export interface DirectoryBrowserProps {
  currentPath: string;                                    // Current directory path
  onPathChange: (path: string) => void;                   // Called when navigating to new path
  onDirectorySelect: (path: string) => void;              // Called when selecting a directory as final choice
  fetchDirectories: (path: string) => Promise<DirectoryInfo[]>; // Function to fetch directory list
  validatePath: (path: string) => Promise<PathValidation>;      // Function to validate paths
  rootLabel?: string;                                     // Optional root label for breadcrumbs
  loadingMessage?: string;                                // Optional loading message
  emptyMessage?: string;                                  // Optional empty directory message
  errorMessage?: string;                                  // Optional error message
}

/**
 * DirectoryBrowser - A comprehensive directory browsing interface that combines
 * PathBreadcrumbs for navigation and FolderCard components for directory display
 * 
 * @example
 * ```tsx
 * import { DirectoryBrowser } from '@vibetree/ui';
 * 
 * <DirectoryBrowser
 *   currentPath="/home/user/projects"
 *   onPathChange={(path) => setCurrentPath(path)}
 *   onDirectorySelect={(path) => selectProject(path)}
 *   fetchDirectories={(path) => adapter.listDirectories(path)}
 *   validatePath={(path) => adapter.validatePath(path)}
 *   rootLabel="Projects"
 * />
 * ```
 */
export function DirectoryBrowser({
  currentPath,
  onPathChange,
  onDirectorySelect,
  fetchDirectories,
  validatePath,
  rootLabel = "Root",
  loadingMessage = "Loading directories...",
  emptyMessage = "No directories found",
  errorMessage = "Failed to load directories"
}: DirectoryBrowserProps) {
  
  // State management
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [pathValidation, setPathValidation] = useState<PathValidation | null>(null);

  // Load directories effect
  useEffect(() => {
    loadDirectoriesForPath(currentPath);
  }, [currentPath]);

  // Load directories function with comprehensive error handling
  const loadDirectoriesForPath = async (path: string) => {
    if (!path) return;
    
    setLoading(true);
    setError('');
    setDirectories([]);

    try {
      // First validate the path
      const validation = await validatePath(path);
      setPathValidation(validation);

      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid path');
      }

      if (!validation.exists) {
        throw new Error('Path does not exist');
      }

      if (!validation.isDirectory) {
        throw new Error('Path is not a directory');
      }

      if (!validation.readable) {
        throw new Error('Directory is not readable');
      }

      // Fetch directories
      const fetchedDirectories = await fetchDirectories(path);
      setDirectories(fetchedDirectories || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : errorMessage;
      setError(errorMsg);
      console.error('Failed to load directories:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle navigation via breadcrumbs or manual path changes
  const handleNavigate = (path: string) => {
    if (path !== currentPath) {
      onPathChange(path);
    }
  };

  // Handle directory selection (single-click)
  const handleDirectorySelect = (directory: DirectoryInfo) => {
    onDirectorySelect(directory.path);
  };

  // Handle folder double-click navigation
  const handleFolderDoubleClick = (directory: DirectoryInfo) => {
    handleNavigate(directory.path);
  };

  // Handle retry when there's an error
  const handleRetry = () => {
    loadDirectoriesForPath(currentPath);
  };

  // Handle keyboard events for retry
  const handleRetryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRetry();
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Navigation breadcrumbs */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
        <PathBreadcrumbs
          currentPath={currentPath}
          onNavigate={handleNavigate}
          rootLabel={rootLabel}
          maxItems={5}
        />
        
        {/* Path validation status */}
        {pathValidation && !pathValidation.valid && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Invalid path</span>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 p-4">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadingMessage}</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <h3 className="text-lg font-semibold">Error</h3>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {error}
            </p>
            <button
              onClick={handleRetry}
              onKeyDown={handleRetryKeyDown}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
              aria-label="Retry loading directories"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && directories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
            <div className="text-center space-y-1">
              <h3 className="text-lg font-medium text-muted-foreground">
                No Directories Found
              </h3>
              <p className="text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            </div>
            <button
              onClick={handleRetry}
              onKeyDown={handleRetryKeyDown}
              className="text-sm text-primary hover:text-primary/90 underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded transition-colors"
              aria-label="Refresh directory listing"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Success state - Directory grid */}
        {!loading && !error && directories.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {directories.length} director{directories.length === 1 ? 'y' : 'ies'} found
              </p>
              <button
                onClick={handleRetry}
                onKeyDown={handleRetryKeyDown}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded px-2 py-1"
                aria-label="Refresh directory listing"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
            </div>
            
            {/* Responsive grid of directory cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {directories.map((directory) => (
                <FolderCard
                  key={directory.path}
                  name={directory.name}
                  path={directory.path}
                  isGitRepo={directory.isGitRepo}
                  onClick={() => handleDirectorySelect(directory)}
                  onDoubleClick={() => handleFolderDoubleClick(directory)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}