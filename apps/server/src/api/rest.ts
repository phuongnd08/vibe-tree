import { Express } from 'express';
import { ShellManager } from '../services/ShellManager';
import { AuthService } from '../auth/AuthService';
import {
  listWorktrees,
  getGitStatus,
  getGitDiff,
  addWorktree,
  removeWorktree,
  listDirectories,
  validatePath
} from '@vibetree/core';

interface Services {
  shellManager: ShellManager;
  authService: AuthService;
}

export function setupRestRoutes(app: Express, services: Services) {
  const { shellManager, authService } = services;
  
  // Get server configuration
  app.get('/api/config', (req, res) => {
    res.json({
      projectPath: process.env.PROJECT_PATH || process.cwd(),
      version: '0.0.1'
    });
  });

  // Generate QR code for device pairing
  app.get('/api/auth/qr', async (req, res) => {
    try {
      const port = parseInt(process.env.PORT || '3001');
      const result = await authService.generateQRCode(port);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // List connected devices
  app.get('/api/devices', (req, res) => {
    const devices = authService.getConnectedDevices();
    res.json(devices);
  });

  // Disconnect a device
  app.delete('/api/devices/:deviceId', (req, res) => {
    const success = authService.disconnectDevice(req.params.deviceId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  });

  // List active shell sessions
  app.get('/api/shells', (req, res) => {
    const sessions = shellManager.getAllSessions();
    res.json(sessions.map(s => ({
      id: s.id,
      worktreePath: s.worktreePath,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity
    })));
  });

  // Terminate a shell session
  app.delete('/api/shells/:sessionId', (req, res) => {
    const success = shellManager.terminateSession(req.params.sessionId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // Git operations (for non-WebSocket clients)
  app.post('/api/git/worktrees', async (req, res) => {
    try {
      const worktrees = await listWorktrees(req.body.projectPath);
      res.json(worktrees);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/status', async (req, res) => {
    try {
      const status = await getGitStatus(req.body.worktreePath);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/diff', async (req, res) => {
    try {
      const diff = await getGitDiff(req.body.worktreePath, req.body.filePath);
      res.json({ diff });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/git/worktree/add', async (req, res) => {
    try {
      const result = await addWorktree(req.body.projectPath, req.body.branchName);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/git/worktree', async (req, res) => {
    try {
      const result = await removeWorktree(
        req.body.projectPath,
        req.body.worktreePath,
        req.body.branchName
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // List directories for project selection
  app.get('/api/directories', async (req, res) => {
    try {
      const path = req.query.path as string;
      
      // Add input length validation
      if (!path || typeof path !== 'string' || path.length > 1000) {
        return res.status(400).json({ error: 'Invalid path parameter' });
      }

      // Validate the path first
      const validation = await validatePath(path);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid path', 
          details: validation.error || 'Path is not accessible'
        });
      }

      // List directories
      const directories = await listDirectories(path);
      
      res.json({
        path,
        directories,
        success: true
      });
    } catch (error) {
      console.error('Directory listing error:', error);
      res.status(500).json({ 
        error: 'Directory operation failed'
      });
    }
  });

  // Validate a directory path
  app.get('/api/directories/validate', async (req, res) => {
    try {
      const path = req.query.path as string;
      
      // Add input length validation
      if (!path || typeof path !== 'string' || path.length > 1000) {
        return res.status(400).json({ error: 'Invalid path parameter' });
      }

      const validation = await validatePath(path);
      
      res.json({
        path,
        validation,
        success: true
      });
    } catch (error) {
      console.error('Path validation error:', error);
      res.status(500).json({ 
        error: 'Path validation failed'
      });
    }
  });
}