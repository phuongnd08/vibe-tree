/**
 * Terminal Profile Service
 * Terminal profile management (based on VSCode architecture)
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ITerminalProfile } from '../common/terminal';
import { ITerminalConfigurationService } from './terminalConfigurationService';

export interface ITerminalProfileService {
  readonly availableProfiles: ITerminalProfile[];
  readonly defaultProfile: ITerminalProfile | undefined;
  readonly contributedProfiles: ITerminalProfile[];
  readonly onDidChangeAvailableProfiles: (listener: (profiles: ITerminalProfile[]) => void) => void;
  
  detectAvailableProfiles(): Promise<ITerminalProfile[]>;
  getDefaultProfile(): ITerminalProfile | undefined;
  setDefaultProfile(profile: ITerminalProfile): void;
  getProfileByName(name: string): ITerminalProfile | undefined;
  createProfile(profile: ITerminalProfile): void;
  updateProfile(name: string, profile: Partial<ITerminalProfile>): void;
  deleteProfile(name: string): void;
  registerContributedProfile(profile: ITerminalProfile): void;
  refreshProfiles(): Promise<void>;
  getPlatformProfiles(): ITerminalProfile[];
  resolveProfile(profile: ITerminalProfile): ITerminalProfile;
}

export class TerminalProfileService extends EventEmitter implements ITerminalProfileService {
  private static instance: TerminalProfileService;
  private _availableProfiles: ITerminalProfile[] = [];
  private _defaultProfile: ITerminalProfile | undefined;
  private _contributedProfiles: ITerminalProfile[] = [];
  private _customProfiles: Map<string, ITerminalProfile> = new Map();
  
  constructor(
    private readonly configurationService: ITerminalConfigurationService
  ) {
    super();
    this._initializeProfiles();
  }
  
  static getInstance(configurationService: ITerminalConfigurationService): TerminalProfileService {
    if (!TerminalProfileService.instance) {
      TerminalProfileService.instance = new TerminalProfileService(configurationService);
    }
    return TerminalProfileService.instance;
  }
  
  get availableProfiles(): ITerminalProfile[] {
    return [...this._availableProfiles];
  }
  
  get defaultProfile(): ITerminalProfile | undefined {
    return this._defaultProfile;
  }
  
  get contributedProfiles(): ITerminalProfile[] {
    return [...this._contributedProfiles];
  }
  
  get onDidChangeAvailableProfiles() {
    return (listener: (profiles: ITerminalProfile[]) => void) => {
      this.on('didChangeAvailableProfiles', listener);
    };
  }
  
  private async _initializeProfiles(): Promise<void> {
    await this.detectAvailableProfiles();
    this._setDefaultProfile();
  }
  
  async detectAvailableProfiles(): Promise<ITerminalProfile[]> {
    const profiles: ITerminalProfile[] = [];
    const platform = this._getPlatform();
    
    if (platform === 'windows') {
      profiles.push(...await this._detectWindowsProfiles());
    } else if (platform === 'osx') {
      profiles.push(...await this._detectMacProfiles());
    } else {
      profiles.push(...await this._detectLinuxProfiles());
    }
    
    profiles.push(...this._contributedProfiles);
    profiles.push(...Array.from(this._customProfiles.values()));
    
    this._availableProfiles = profiles;
    this.emit('didChangeAvailableProfiles', profiles);
    
    return profiles;
  }
  
  private async _detectWindowsProfiles(): Promise<ITerminalProfile[]> {
    const profiles: ITerminalProfile[] = [];
    
    profiles.push({
      profileName: 'Command Prompt',
      path: process.env.COMSPEC || 'cmd.exe',
      args: [],
      icon: 'terminal-cmd'
    });
    
    const powerShellPath = await this._findPowerShell();
    if (powerShellPath) {
      profiles.push({
        profileName: 'PowerShell',
        path: powerShellPath,
        args: ['-NoLogo'],
        icon: 'terminal-powershell'
      });
    }
    
    const pwshPath = await this._findPowerShellCore();
    if (pwshPath) {
      profiles.push({
        profileName: 'PowerShell Core',
        path: pwshPath,
        args: ['-NoLogo'],
        icon: 'terminal-powershell'
      });
    }
    
    const gitBashPath = await this._findGitBash();
    if (gitBashPath) {
      profiles.push({
        profileName: 'Git Bash',
        path: gitBashPath,
        args: ['--login', '-i'],
        icon: 'terminal-bash'
      });
    }
    
    const wslPath = await this._findWSL();
    if (wslPath) {
      profiles.push({
        profileName: 'WSL',
        path: wslPath,
        args: [],
        icon: 'terminal-linux'
      });
    }
    
    return profiles;
  }
  
  private async _detectMacProfiles(): Promise<ITerminalProfile[]> {
    const profiles: ITerminalProfile[] = [];
    
    profiles.push({
      profileName: 'bash',
      path: '/bin/bash',
      args: ['-l'],
      icon: 'terminal-bash'
    });
    
    profiles.push({
      profileName: 'zsh',
      path: '/bin/zsh',
      args: ['-l'],
      icon: 'terminal'
    });
    
    if (await this._fileExists('/bin/fish')) {
      profiles.push({
        profileName: 'fish',
        path: '/bin/fish',
        args: ['-l'],
        icon: 'terminal'
      });
    }
    
    if (await this._fileExists('/bin/tcsh')) {
      profiles.push({
        profileName: 'tcsh',
        path: '/bin/tcsh',
        args: ['-l'],
        icon: 'terminal'
      });
    }
    
    return profiles;
  }
  
  private async _detectLinuxProfiles(): Promise<ITerminalProfile[]> {
    const profiles: ITerminalProfile[] = [];
    
    const shellPath = process.env.SHELL || '/bin/bash';
    const shellName = path.basename(shellPath);
    
    profiles.push({
      profileName: shellName,
      path: shellPath,
      args: ['-l'],
      icon: shellName.includes('bash') ? 'terminal-bash' : 'terminal'
    });
    
    if (shellPath !== '/bin/bash' && await this._fileExists('/bin/bash')) {
      profiles.push({
        profileName: 'bash',
        path: '/bin/bash',
        args: ['-l'],
        icon: 'terminal-bash'
      });
    }
    
    if (shellPath !== '/bin/zsh' && await this._fileExists('/bin/zsh')) {
      profiles.push({
        profileName: 'zsh',
        path: '/bin/zsh',
        args: ['-l'],
        icon: 'terminal'
      });
    }
    
    if (await this._fileExists('/usr/bin/fish')) {
      profiles.push({
        profileName: 'fish',
        path: '/usr/bin/fish',
        args: ['-l'],
        icon: 'terminal'
      });
    }
    
    return profiles;
  }
  
  private async _findPowerShell(): Promise<string | undefined> {
    const possiblePaths = [
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe'
    ];
    
    for (const path of possiblePaths) {
      if (await this._fileExists(path)) {
        return path;
      }
    }
    
    return undefined;
  }
  
  private async _findPowerShellCore(): Promise<string | undefined> {
    const possiblePaths = [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files\\PowerShell\\6\\pwsh.exe',
      'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files (x86)\\PowerShell\\6\\pwsh.exe'
    ];
    
    for (const path of possiblePaths) {
      if (await this._fileExists(path)) {
        return path;
      }
    }
    
    return undefined;
  }
  
  private async _findGitBash(): Promise<string | undefined> {
    const possiblePaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Git\\bin\\bash.exe'
    ];
    
    for (const path of possiblePaths) {
      if (await this._fileExists(path)) {
        return path;
      }
    }
    
    return undefined;
  }
  
  private async _findWSL(): Promise<string | undefined> {
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    if (await this._fileExists(wslPath)) {
      return wslPath;
    }
    return undefined;
  }
  
  private async _fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
  
  private _getPlatform(): 'linux' | 'osx' | 'windows' {
    if (process.platform === 'win32') {
      return 'windows';
    } else if (process.platform === 'darwin') {
      return 'osx';
    } else {
      return 'linux';
    }
  }
  
  private _setDefaultProfile(): void {
    const platform = this._getPlatform();
    const configDefaultProfileName = this.configurationService.get<string>(`defaultProfile.${platform}`);
    
    if (configDefaultProfileName) {
      this._defaultProfile = this.getProfileByName(configDefaultProfileName);
    }
    
    if (!this._defaultProfile && this._availableProfiles.length > 0) {
      this._defaultProfile = this._availableProfiles[0];
    }
  }
  
  getDefaultProfile(): ITerminalProfile | undefined {
    return this._defaultProfile;
  }
  
  setDefaultProfile(profile: ITerminalProfile): void {
    this._defaultProfile = profile;
    
    const platform = this._getPlatform();
    this.configurationService.update(`defaultProfile.${platform}`, profile.profileName);
  }
  
  getProfileByName(name: string): ITerminalProfile | undefined {
    return this._availableProfiles.find(p => p.profileName === name);
  }
  
  createProfile(profile: ITerminalProfile): void {
    this._customProfiles.set(profile.profileName, profile);
    this.refreshProfiles();
  }
  
  updateProfile(name: string, profileUpdate: Partial<ITerminalProfile>): void {
    const profile = this._customProfiles.get(name);
    if (profile) {
      const updatedProfile = { ...profile, ...profileUpdate };
      this._customProfiles.set(name, updatedProfile);
      this.refreshProfiles();
    }
  }
  
  deleteProfile(name: string): void {
    if (this._customProfiles.delete(name)) {
      this.refreshProfiles();
    }
  }
  
  registerContributedProfile(profile: ITerminalProfile): void {
    this._contributedProfiles.push(profile);
    this.refreshProfiles();
  }
  
  async refreshProfiles(): Promise<void> {
    await this.detectAvailableProfiles();
    this._setDefaultProfile();
  }
  
  getPlatformProfiles(): ITerminalProfile[] {
    const platform = this._getPlatform();
    const configProfiles = this.configurationService.get<Record<string, ITerminalProfile>>(`profiles.${platform}`);
    
    if (configProfiles) {
      return Object.entries(configProfiles).map(([name, profile]) => ({
        ...profile,
        profileName: name
      }));
    }
    
    return [];
  }
  
  resolveProfile(profile: ITerminalProfile): ITerminalProfile {
    const resolved = { ...profile };
    
    if (!resolved.env) {
      resolved.env = {};
    }
    
    const globalEnv = this.configurationService.getEnvironmentVariables();
    resolved.env = { ...globalEnv, ...resolved.env };
    
    if (!resolved.path) {
      resolved.path = this.configurationService.getDefaultShell();
    }
    
    if (!resolved.args) {
      resolved.args = this.configurationService.getDefaultShellArgs();
    }
    
    if (!resolved.cwd) {
      resolved.cwd = os.homedir();
    }
    
    return resolved;
  }
}