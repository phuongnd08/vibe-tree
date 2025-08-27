import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isGitRepository as gitIsGitRepository } from './git';

/**
 * Information about a directory
 */
export interface DirectoryInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

/**
 * Result of path validation
 */
export interface PathValidation {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  error?: string;
}

/**
 * System directories to filter out when listing directories
 */
const SYSTEM_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.vscode',
  '.idea',
  '__pycache__',
  '.pytest_cache',
  '.coverage',
  'coverage',
  'target',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  'vendor',
  'composer_cache',
  '.cache',
  '.tmp',
  'tmp',
  '.DS_Store'
]);

/**
 * Normalize and resolve a path, handling home directory expansion
 * @param inputPath - The path to normalize
 * @returns Normalized absolute path
 */
export function normalizePath(inputPath: string): string {
  // Handle home directory expansion
  const expandedPath = inputPath.startsWith('~') 
    ? path.join(os.homedir(), inputPath.slice(1))
    : inputPath;
  
  // Normalize and resolve to absolute path
  return path.resolve(expandedPath);
}

/**
 * Get the parent directory path
 * @param inputPath - The path to get parent for
 * @returns Parent directory path
 */
export function getParentPath(inputPath: string): string {
  const normalizedPath = normalizePath(inputPath);
  const parentPath = path.dirname(normalizedPath);
  
  // Handle root directory cases
  if (parentPath === normalizedPath) {
    return normalizedPath; // Already at root
  }
  
  return parentPath;
}

/**
 * Validate if a path is safe and prevent path traversal attacks
 * @param inputPath - The path to validate
 * @returns True if path is safe to use
 */
function isSafePath(inputPath: string): boolean {
  // Reject any path containing traversal sequences
  if (inputPath.includes('..') || inputPath.includes('\\..') || inputPath.match(/\.\.[\\/]/)) {
    return false;
  }
  
  const normalizedPath = path.resolve(inputPath);
  
  // Only allow paths within safe directories
  const allowedRoots = [
    os.homedir(),
    '/home',
    '/Users',
    process.cwd()
  ];
  
  // Check if normalized path starts with any allowed root
  const isAllowed = allowedRoots.some(root => {
    const rootNormalized = path.resolve(root);
    return normalizedPath.startsWith(rootNormalized + path.sep) || normalizedPath === rootNormalized;
  });
  
  if (!isAllowed) {
    return false;
  }
  
  // Additional security checks
  if (normalizedPath.includes('\\') && process.platform !== 'win32') {
    return false; // Prevent Windows-style paths on Unix
  }
  
  return true;
}

/**
 * Check if a directory name should be filtered out
 * @param name - Directory name to check
 * @returns True if directory should be filtered out
 */
function shouldFilterDirectory(name: string): boolean {
  // Filter hidden directories (starting with .)
  if (name.startsWith('.')) {
    return true;
  }
  
  // Filter system directories
  return SYSTEM_DIRECTORIES.has(name);
}

/**
 * Validate a path and check its properties
 * @param inputPath - Path to validate
 * @returns Validation result with detailed information
 */
export async function validatePath(inputPath: string): Promise<PathValidation> {
  try {
    // First check if path is safe
    if (!isSafePath(inputPath)) {
      return {
        valid: false,
        exists: false,
        isDirectory: false,
        readable: false,
        error: 'Path contains invalid characters or traversal attempts'
      };
    }
    
    const normalizedPath = normalizePath(inputPath);
    
    // Check if path exists and is accessible
    try {
      await fs.access(normalizedPath, fs.constants.F_OK);
    } catch {
      return {
        valid: false,
        exists: false,
        isDirectory: false,
        readable: false,
        error: 'Path does not exist'
      };
    }
    
    // Check if readable
    let readable = true;
    try {
      await fs.access(normalizedPath, fs.constants.R_OK);
    } catch {
      readable = false;
    }
    
    // Check if it's a directory
    let isDirectory = false;
    try {
      const stats = await fs.stat(normalizedPath);
      isDirectory = stats.isDirectory();
    } catch (error: any) {
      return {
        valid: false,
        exists: true,
        isDirectory: false,
        readable,
        error: `Failed to get path stats: ${error.message}`
      };
    }
    
    return {
      valid: isDirectory && readable,
      exists: true,
      isDirectory,
      readable,
    };
    
  } catch (error: any) {
    return {
      valid: false,
      exists: false,
      isDirectory: false,
      readable: false,
      error: `Validation failed: ${error.message}`
    };
  }
}

// Import the isGitRepository function from git utilities

/**
 * List directories in a given path, filtering out files and unwanted directories
 * @param inputPath - Path to list directories in
 * @returns Array of directory information, empty array on error
 */
export async function listDirectories(inputPath: string): Promise<DirectoryInfo[]> {
  try {
    // Validate the input path
    const validation = await validatePath(inputPath);
    if (!validation.valid) {
      return [];
    }
    
    const normalizedPath = normalizePath(inputPath);
    
    // Read directory contents
    const entries = await fs.readdir(normalizedPath, { withFileTypes: true });
    
    // Filter to only directories, excluding system and hidden dirs
    const directories = entries.filter(entry => 
      entry.isDirectory() && !shouldFilterDirectory(entry.name)
    );
    
    // Create DirectoryInfo objects with git repository status
    const directoryInfoPromises = directories.map(async (dir): Promise<DirectoryInfo> => {
      const fullPath = path.join(normalizedPath, dir.name);
      
      // Check if it's a git repository
      let isGitRepo = false;
      try {
        isGitRepo = await gitIsGitRepository(fullPath);
      } catch {
        // If git check fails, assume it's not a git repo
        isGitRepo = false;
      }
      
      return {
        name: dir.name,
        path: fullPath,
        isGitRepo
      };
    });
    
    // Wait for all git repository checks to complete
    const directoryInfos = await Promise.all(directoryInfoPromises);
    
    // Sort directories alphabetically by name
    return directoryInfos.sort((a, b) => a.name.localeCompare(b.name));
    
  } catch (error) {
    // On any error, return empty array to prevent crashes
    console.warn(`Failed to list directories for path "${inputPath}":`, error);
    return [];
  }
}