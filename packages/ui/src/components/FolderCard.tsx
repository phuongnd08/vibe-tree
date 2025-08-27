import React from 'react';
import { Folder, GitBranch } from 'lucide-react';

export interface FolderCardProps {
  name: string;          // Directory name to display
  path: string;          // Full directory path
  isGitRepo: boolean;    // Whether it's a git repository
  onClick: () => void;   // Click handler
  onDoubleClick?: () => void; // Optional double-click handler
}

/**
 * FolderCard - A reusable card component for displaying directory information
 * 
 * @example
 * ```tsx
 * import { FolderCard } from '@vibetree/ui';
 * 
 * <FolderCard
 *   name="my-project"
 *   path="/home/user/projects/my-project"
 *   isGitRepo={true}
 *   onClick={() => console.log('Folder selected')}
 *   onDoubleClick={() => console.log('Folder double-clicked')}
 * />
 * ```
 */
export function FolderCard({ name, path, isGitRepo, onClick, onDoubleClick }: FolderCardProps) {
  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="relative flex flex-col items-center p-4 bg-background border rounded-md hover:bg-accent hover:border-accent-foreground/20 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Directory: ${name}${isGitRepo ? ' (Git Repository)' : ''}`}
    >
      {/* Git badge */}
      {isGitRepo && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full">
          <GitBranch className="h-3 w-3" />
          <span className="text-xs font-medium">Git</span>
        </div>
      )}
      
      {/* Folder icon */}
      <div className="flex items-center justify-center w-12 h-12 mb-3 rounded-lg bg-muted group-hover:bg-muted/70 transition-colors">
        <Folder className="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
      
      {/* Directory name */}
      <div className="text-center space-y-1 w-full">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 break-words">
          {name}
        </h3>
        <p className="text-xs text-muted-foreground truncate w-full" title={path}>
          {path}
        </p>
      </div>
    </div>
  );
}