import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { shellProcessManager } from './shell-manager';
import './ide-detector';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  getGitDiffStaged,
  addWorktree,
  removeWorktree
} from '@vibetree/core';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    icon: path.join(__dirname, '../../assets/icons/VibeTree.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // For testing, always load the built files
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  console.log('Loading renderer from:', rendererPath);
  console.log('Renderer file exists:', fs.existsSync(rendererPath));
  
  mainWindow.loadFile(rendererPath);
  
  // Don't open DevTools in tests as it can interfere with content detection

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

// Clean up shell processes on quit
app.on('before-quit', () => {
  shellProcessManager.cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for git worktree operations
ipcMain.handle('git:worktree-list', async (_, projectPath: string) => {
  return listWorktrees(projectPath);
});

// Git diff and status operations
ipcMain.handle('git:status', async (_, worktreePath: string) => {
  return getGitStatus(worktreePath);
});

ipcMain.handle('git:diff', async (_, worktreePath: string, filePath?: string) => {
  return getGitDiff(worktreePath, filePath);
});

ipcMain.handle('git:diff-staged', async (_, worktreePath: string, filePath?: string) => {
  return getGitDiffStaged(worktreePath, filePath);
});

ipcMain.handle('git:worktree-add', async (_, projectPath: string, branchName: string) => {
  return addWorktree(projectPath, branchName);
});

ipcMain.handle('git:worktree-remove', async (_, projectPath: string, worktreePath: string, branchName: string) => {
  return removeWorktree(projectPath, worktreePath, branchName);
});

// Theme handling
ipcMain.handle('theme:get', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
});

// Dialog handling
ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

// Programmatic project opening (for testing)
ipcMain.handle('project:open-path', async (_, projectPath: string) => {
  if (!projectPath) {
    return { success: false, error: 'No path provided' };
  }
  if (mainWindow && fs.existsSync(projectPath)) {
    mainWindow.webContents.send('project:open', projectPath);
    return { success: true, path: projectPath };
  }
  return { success: false, error: `Directory does not exist: ${projectPath}` };
});

// Open current working directory
ipcMain.handle('project:open-cwd', async () => {
  try {
    const cwd = process.cwd();
    if (mainWindow && fs.existsSync(cwd)) {
      mainWindow.webContents.send('project:open', cwd);
      return { success: true, path: cwd };
    }
    return { success: false, error: `Directory does not exist: ${cwd}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Open external links
ipcMain.handle('shell:open-external', async (_, url: string) => {
  await shell.openExternal(url);
});