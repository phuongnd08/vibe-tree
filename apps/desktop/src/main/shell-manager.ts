import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { ShellSessionManager } from '@vibetree/core';

/**
 * Desktop shell manager - thin wrapper around shared ShellSessionManager
 * Handles IPC communication with renderer process
 */
class DesktopShellManager {
  private sessionManager = ShellSessionManager.getInstance();

  constructor() {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('shell:start', async (event, worktreePath: string, cols?: number, rows?: number) => {
      console.log(`[SHELL-MGR] Starting shell for worktree: ${worktreePath}`);
      // Start session with node-pty spawn function
      const result = await this.sessionManager.startSession(
        worktreePath,
        cols,
        rows,
        pty.spawn
      );

      if (result.success && result.processId) {
        const listenerId = `electron-${event.sender.id}`;
        console.log(`[SHELL-MGR] Shell started - processId: ${result.processId}, isNew: ${result.isNew}, listenerId: ${listenerId}`);
        
        // Only add listeners for new sessions or if they don't exist
        // For existing sessions, listeners should already be set up
        if (result.isNew) {
          console.log(`[SHELL-MGR] NEW session - adding listeners`);
          // Add output listener
          this.sessionManager.addOutputListener(result.processId, listenerId, (data) => {
            console.log(`[SHELL-MGR] Output for ${result.processId}: ${data.substring(0, 50).replace(/\n/g, '\\n')}...`);
            event.sender.send(`shell:output:${result.processId}`, data);
          });

          // Add exit listener
          this.sessionManager.addExitListener(result.processId, listenerId, (exitCode) => {
            event.sender.send(`shell:exit:${result.processId}`, exitCode);
          });
        } else {
          console.log(`[SHELL-MGR] EXISTING session - updating listeners`);
          // For existing sessions, we need to update the listener to use the current event.sender
          // because the renderer might have changed
          this.sessionManager.removeOutputListener(result.processId, listenerId);
          this.sessionManager.removeExitListener(result.processId, listenerId);
          
          // Re-add with current sender
          this.sessionManager.addOutputListener(result.processId, listenerId, (data) => {
            console.log(`[SHELL-MGR] Output for existing ${result.processId}: ${data.substring(0, 50).replace(/\n/g, '\\n')}...`);
            event.sender.send(`shell:output:${result.processId}`, data);
          });

          this.sessionManager.addExitListener(result.processId, listenerId, (exitCode) => {
            event.sender.send(`shell:exit:${result.processId}`, exitCode);
          });
        }
      }

      return result;
    });

    ipcMain.handle('shell:write', async (_, processId: string, data: string) => {
      return this.sessionManager.writeToSession(processId, data);
    });

    ipcMain.handle('shell:resize', async (_, processId: string, cols: number, rows: number) => {
      return this.sessionManager.resizeSession(processId, cols, rows);
    });

    ipcMain.handle('shell:status', async (_, processId: string) => {
      return { running: this.sessionManager.hasSession(processId) };
    });

    ipcMain.handle('shell:get-buffer', async () => {
      // Buffer management handled on renderer side
      return { success: true, buffer: null };
    });
  }

  // Clean up on app quit
  public cleanup() {
    this.sessionManager.cleanup();
  }
}

export const shellProcessManager = new DesktopShellManager();