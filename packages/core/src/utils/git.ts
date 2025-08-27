import { spawn } from 'child_process';
import * as path from 'path';
import { Worktree, GitStatus, WorktreeAddResult, WorktreeRemoveResult } from '../types';
import { parseWorktrees, parseGitStatus } from './git-parser';

/**
 * Execute a git command and return the output
 * @param args - Git command arguments
 * @param cwd - Working directory for the command
 * @returns Promise with command output
 */
export function executeGitCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { 
      cwd,
      env: process.env
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Git command failed: git ${args.join(' ')}`));
      }
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new Error(
          `Git executable not found. Please ensure git is installed and available in your PATH.\n` +
          `Command attempted: git ${args.join(' ')}\n` +
          `Current PATH: ${process.env.PATH}`
        ));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * List all git worktrees for a project
 * @param projectPath - Path to the main git repository
 * @returns Array of worktree information
 */
export async function listWorktrees(projectPath: string): Promise<Worktree[]> {
  const output = await executeGitCommand(['worktree', 'list', '--porcelain'], projectPath);
  return parseWorktrees(output);
}

/**
 * Get git status for a worktree
 * @param worktreePath - Path to the git worktree
 * @returns Array of file status information
 */
export async function getGitStatus(worktreePath: string): Promise<GitStatus[]> {
  const output = await executeGitCommand(['status', '--porcelain=v1'], worktreePath);
  return parseGitStatus(output);
}

/**
 * Get git diff for unstaged changes
 * @param worktreePath - Path to the git worktree
 * @param filePath - Optional specific file to diff
 * @returns Diff output as string
 */
export async function getGitDiff(worktreePath: string, filePath?: string): Promise<string> {
  const args = ['diff'];
  if (filePath) {
    args.push(filePath);
  }
  return executeGitCommand(args, worktreePath);
}

/**
 * Get git diff for staged changes
 * @param worktreePath - Path to the git worktree
 * @param filePath - Optional specific file to diff
 * @returns Staged diff output as string
 */
export async function getGitDiffStaged(worktreePath: string, filePath?: string): Promise<string> {
  const args = ['diff', '--staged'];
  if (filePath) {
    args.push(filePath);
  }
  return executeGitCommand(args, worktreePath);
}

/**
 * Create a new git worktree with a new branch
 * @param projectPath - Path to the main git repository
 * @param branchName - Name for the new branch
 * @returns Result with new worktree path and branch name
 */
export async function addWorktree(projectPath: string, branchName: string): Promise<WorktreeAddResult> {
  const worktreePath = path.join(projectPath, '..', `${path.basename(projectPath)}-${branchName}`);
  
  await executeGitCommand(['worktree', 'add', '-b', branchName, worktreePath], projectPath);
  
  return { path: worktreePath, branch: branchName };
}

/**
 * Remove a git worktree and optionally its branch
 * @param projectPath - Path to the main git repository
 * @param worktreePath - Path to the worktree to remove
 * @param branchName - Name of the branch to delete
 * @returns Result indicating success and any warnings
 */
export async function removeWorktree(
  projectPath: string, 
  worktreePath: string, 
  branchName: string
): Promise<WorktreeRemoveResult> {
  try {
    // First remove the worktree
    await executeGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
    
    try {
      // Then try to delete the branch
      await executeGitCommand(['branch', '-D', branchName], projectPath);
      return { success: true };
    } catch (branchError) {
      // If branch deletion fails, still consider it success since worktree was removed
      console.warn('Failed to delete branch but worktree was removed:', branchError);
      return { 
        success: true, 
        warning: `Worktree removed but failed to delete branch: ${branchError}` 
      };
    }
  } catch (error) {
    throw new Error(`Failed to remove worktree: ${error}`);
  }
}

/**
 * Check if a path is a git repository
 * @param path - Path to check
 * @returns True if path is a git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    await executeGitCommand(['rev-parse', '--git-dir'], path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 * @param worktreePath - Path to the git worktree
 * @returns Current branch name
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
  const output = await executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  return output.trim();
}

/**
 * Check if git is available in the system PATH
 * @returns True if git is available, false otherwise
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await executeGitCommand(['--version'], process.cwd());
    return true;
  } catch (error: any) {
    if (error.message?.includes('Git executable not found')) {
      return false;
    }
    // If it's another error, git is probably available but something else went wrong
    return true;
  }
}