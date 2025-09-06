/**
 * Local Terminal Backend
 * Manages local terminal processes using node-pty
 */

import { BaseTerminalBackend, ICreateProcessResult } from './baseTerminalBackend';
import { 
  ITerminalLaunchConfig,
  ITerminalProfile,
  OperatingSystem
} from '../common/terminal';
import { ShellSessionManager } from '../../services/ShellSessionManager';
import * as os from 'os';

export class LocalTerminalBackend extends BaseTerminalBackend {
  private _shellSessionManager: ShellSessionManager;
  private _os: OperatingSystem;
  
  constructor() {
    super();
    this._shellSessionManager = ShellSessionManager.getInstance();
    this._os = this.detectOS();
  }
  
  get remoteAuthority(): string | undefined {
    return undefined;
  }
  
  get os(): OperatingSystem | undefined {
    return this._os;
  }
  
  get userHome(): string | undefined {
    return os.homedir();
  }
  
  private detectOS(): OperatingSystem {
    const platform = os.platform();
    switch (platform) {
      case 'win32':
        return OperatingSystem.Windows;
      case 'darwin':
        return OperatingSystem.Macintosh;
      default:
        return OperatingSystem.Linux;
    }
  }
  
  async createProcess(
    shellLaunchConfig: ITerminalLaunchConfig,
    cols: number,
    rows: number
  ): Promise<ICreateProcessResult> {
    const cwd = shellLaunchConfig.cwd || process.cwd();
    
    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && !(window as any).electronAPI) {
      // For web environment, we need to connect to a server
      throw new Error('Terminal backend not available in browser environment');
    }
    
    // For Electron environment, use the existing shell API
    if ((window as any).electronAPI?.shell) {
      const result = await (window as any).electronAPI.shell.start(cwd, cols, rows);
      
      if (result.success && result.processId) {
        // Set up data forwarding
        (window as any).electronAPI.shell.onOutput(result.processId, (data: string) => {
          this.emitProcessData(result.processId, data);
        });
        
        (window as any).electronAPI.shell.onExit(result.processId, (exitCode: number) => {
          this.emitProcessExit(result.processId, exitCode);
        });
        
        return {
          processId: result.processId,
          cwd
        };
      } else {
        throw new Error(result.error || 'Failed to create process');
      }
    }
    
    // For Node.js environment (server), use ShellSessionManager
    try {
      // Dynamic import to avoid issues in browser
      const pty = await import('node-pty');
      
      const result = await this._shellSessionManager.startSession(
        cwd,
        cols,
        rows,
        (shell: string, args: string[], options: any) => {
          return pty.spawn(shell, args, options);
        }
      );
      
      if (result.success && result.processId) {
        // Set up data forwarding
        this._shellSessionManager.addOutputListener(
          result.processId,
          `backend-${result.processId}`,
          (data: string) => {
            this.emitProcessData(result.processId!, data);
          }
        );
        
        this._shellSessionManager.addExitListener(
          result.processId,
          `backend-${result.processId}`,
          (exitCode: number) => {
            this.emitProcessExit(result.processId!, exitCode);
          }
        );
        
        return {
          processId: result.processId,
          cwd
        };
      } else {
        throw new Error(result.error || 'Failed to create process');
      }
    } catch (error) {
      throw new Error(`Failed to create terminal process: ${error}`);
    }
  }
  
  async writeProcess(processId: string, data: string): Promise<void> {
    if ((window as any).electronAPI?.shell) {
      return (window as any).electronAPI.shell.write(processId, data);
    }
    
    const result = await this._shellSessionManager.writeToSession(processId, data);
    if (!result.success) {
      throw new Error(result.error || 'Failed to write to process');
    }
  }
  
  async resizeProcess(processId: string, cols: number, rows: number): Promise<void> {
    if ((window as any).electronAPI?.shell) {
      return (window as any).electronAPI.shell.resize(processId, cols, rows);
    }
    
    const result = await this._shellSessionManager.resizeSession(processId, cols, rows);
    if (!result.success) {
      throw new Error(result.error || 'Failed to resize process');
    }
  }
  
  async killProcess(processId: string): Promise<void> {
    if ((window as any).electronAPI?.shell) {
      // Electron doesn't have a direct kill method in the current implementation
      // We might need to add this to the electronAPI
      return;
    }
    
    this._shellSessionManager.terminateSession(processId);
  }
  
  async getProfiles(): Promise<ITerminalProfile[]> {
    const profiles: ITerminalProfile[] = [];
    
    switch (this._os) {
      case OperatingSystem.Windows:
        profiles.push(
          {
            profileName: 'Command Prompt',
            path: 'cmd.exe',
            icon: 'terminal-cmd'
          },
          {
            profileName: 'PowerShell',
            path: 'powershell.exe',
            icon: 'terminal-powershell'
          }
        );
        
        // Check for WSL
        try {
          const { execSync } = await import('child_process');
          execSync('wsl.exe --list', { stdio: 'ignore' });
          profiles.push({
            profileName: 'WSL',
            path: 'wsl.exe',
            icon: 'terminal-linux'
          });
        } catch {}
        
        // Check for Git Bash
        try {
          const { existsSync } = await import('fs');
          if (existsSync('C:\\Program Files\\Git\\bin\\bash.exe')) {
            profiles.push({
              profileName: 'Git Bash',
              path: 'C:\\Program Files\\Git\\bin\\bash.exe',
              icon: 'terminal-bash'
            });
          }
        } catch {}
        break;
        
      case OperatingSystem.Macintosh:
        profiles.push(
          {
            profileName: 'zsh',
            path: '/bin/zsh',
            icon: 'terminal'
          },
          {
            profileName: 'bash',
            path: '/bin/bash',
            icon: 'terminal-bash'
          }
        );
        break;
        
      case OperatingSystem.Linux:
      default:
        profiles.push(
          {
            profileName: 'bash',
            path: '/bin/bash',
            icon: 'terminal-bash'
          }
        );
        
        // Check for zsh
        try {
          const { existsSync } = await import('fs');
          if (existsSync('/bin/zsh') || existsSync('/usr/bin/zsh')) {
            profiles.push({
              profileName: 'zsh',
              path: existsSync('/bin/zsh') ? '/bin/zsh' : '/usr/bin/zsh',
              icon: 'terminal'
            });
          }
        } catch {}
        
        // Check for fish
        try {
          const { existsSync } = await import('fs');
          if (existsSync('/usr/bin/fish')) {
            profiles.push({
              profileName: 'fish',
              path: '/usr/bin/fish',
              icon: 'terminal'
            });
          }
        } catch {}
        break;
    }
    
    return profiles;
  }
  
  dispose(): void {
    // Clean up all sessions
    const sessions = this._shellSessionManager.getAllSessions();
    sessions.forEach(session => {
      this._shellSessionManager.terminateSession(session.id);
    });
    
    super.dispose();
  }
}