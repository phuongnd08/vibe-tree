import React from 'react';
import { Home, ChevronRight, MoreHorizontal } from 'lucide-react';

export interface PathBreadcrumbsProps {
  currentPath: string;              // Current directory path like "/home/user/projects"
  onNavigate: (path: string) => void; // Called when user clicks a breadcrumb
  rootLabel?: string;               // Optional label for root (default: "Root")
  maxItems?: number;                // Optional max breadcrumb items before ellipsis (default: 5)
}

interface BreadcrumbSegment {
  name: string;
  path: string;
  isRoot: boolean;
  isHome: boolean;
}

/**
 * PathBreadcrumbs - A navigation component for displaying directory breadcrumbs
 * 
 * @example
 * ```tsx
 * import { PathBreadcrumbs } from '@vibetree/ui';
 * 
 * <PathBreadcrumbs
 *   currentPath="/home/user/projects/my-project"
 *   onNavigate={(path) => console.log('Navigate to:', path)}
 *   rootLabel="Home"
 *   maxItems={4}
 * />
 * ```
 */
export function PathBreadcrumbs({ 
  currentPath, 
  onNavigate, 
  rootLabel = "Root",
  maxItems = 5 
}: PathBreadcrumbsProps) {
  
  // Parse path into segments
  const parsePathSegments = (path: string): BreadcrumbSegment[] => {
    if (!path || path === '/') {
      return [{
        name: rootLabel,
        path: '/',
        isRoot: true,
        isHome: false
      }];
    }

    // Normalize path separators and handle different OS formats
    const normalizedPath = path.replace(/\\/g, '/').replace(/\/+/g, '/');
    
    // Remove trailing slash unless it's root
    const cleanPath = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/$/, '');
    
    // Split into segments, filtering out empty strings
    const segments = cleanPath.split('/').filter(segment => segment !== '');
    
    const breadcrumbs: BreadcrumbSegment[] = [];
    
    // Add root segment
    const isHomePath = cleanPath.startsWith('/home') || cleanPath.startsWith('/Users');
    breadcrumbs.push({
      name: rootLabel,
      path: '/',
      isRoot: true,
      isHome: isHomePath
    });
    
    // Build progressive paths for each segment
    let currentSegmentPath = '';
    segments.forEach((segment, index) => {
      currentSegmentPath += '/' + segment;
      
      // Check if this is a home directory
      const isHomeDirectory = (index === 1 && segments[0] === 'home') || 
                             (index === 0 && segment === 'home') ||
                             (index === 1 && segments[0] === 'Users');
      
      breadcrumbs.push({
        name: segment,
        path: currentSegmentPath,
        isRoot: false,
        isHome: isHomeDirectory
      });
    });
    
    return breadcrumbs;
  };

  // Handle breadcrumb click
  const handleBreadcrumbClick = (segmentPath: string) => {
    onNavigate(segmentPath);
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent, path: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate(path);
    }
  };

  const segments = parsePathSegments(currentPath);
  
  // Handle truncation if there are too many items
  const shouldTruncate = segments.length > maxItems;
  let displaySegments = segments;
  let truncatedSegments: BreadcrumbSegment[] = [];
  
  if (shouldTruncate) {
    // Keep first item (root) and last few items
    const keepEnd = maxItems - 2; // Reserve space for root and ellipsis
    displaySegments = [
      segments[0], // Root
      ...segments.slice(-keepEnd) // Last few segments
    ];
    truncatedSegments = segments.slice(1, segments.length - keepEnd);
  }

  return (
    <nav 
      className="flex items-center gap-1 min-w-0 overflow-hidden" 
      aria-label="Directory breadcrumb"
    >
      <ol className="flex items-center gap-1 min-w-0">
        {displaySegments.map((segment, index) => (
          <li key={segment.path} className="flex items-center gap-1 min-w-0">
            {/* Show ellipsis after root if truncated */}
            {shouldTruncate && index === 1 && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  title={`Hidden: ${truncatedSegments.map(s => s.name).join(' / ')}`}
                  aria-label={`${truncatedSegments.length} hidden directories`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </>
            )}
            
            {/* Breadcrumb button */}
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(segment.path)}
              onKeyDown={(e) => handleKeyDown(e, segment.path)}
              className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 max-w-full min-w-0"
              aria-label={`Navigate to ${segment.isRoot ? rootLabel : segment.name}`}
            >
              {/* Icon for root or home */}
              {(segment.isRoot || segment.isHome) && (
                <Home className="h-4 w-4 flex-shrink-0" />
              )}
              
              {/* Segment name */}
              <span className="truncate min-w-0">
                {segment.name}
              </span>
            </button>
            
            {/* Separator (not after last item) */}
            {index < displaySegments.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}