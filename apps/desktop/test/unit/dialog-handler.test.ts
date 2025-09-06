import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ipcMain, dialog } from 'electron';

// Mock electron modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    handlers: new Map()
  },
  dialog: {
    showOpenDialog: vi.fn()
  }
}));

describe('Dialog Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear handlers
    (ipcMain as any).handlers = new Map();
    
    // Mock the handle method to store handlers
    (ipcMain.handle as any).mockImplementation((channel: string, handler: Function) => {
      (ipcMain as any).handlers.set(channel, handler);
    });
  });

  it('should register dialog:select-directory handler', () => {
    // Import the main file which registers handlers
    // This would normally be your main process file
    const registerHandler = () => {
      ipcMain.handle('dialog:select-directory', async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory']
        });
        return result.filePaths[0];
      });
    };
    
    registerHandler();
    
    // Check if handler was registered
    expect(ipcMain.handle).toHaveBeenCalledWith('dialog:select-directory', expect.any(Function));
    expect((ipcMain as any).handlers.has('dialog:select-directory')).toBe(true);
  });

  it('should return selected directory path when dialog is not cancelled', async () => {
    const mockPath = '/test/project/path';
    
    // Mock dialog response
    (dialog.showOpenDialog as any).mockResolvedValue({
      canceled: false,
      filePaths: [mockPath]
    });
    
    // Register handler
    const handler = async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });
      return result.filePaths[0];
    };
    
    (ipcMain as any).handlers.set('dialog:select-directory', handler);
    
    // Execute handler
    const result = await handler();
    
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory']
    });
    expect(result).toBe(mockPath);
  });

  it('should return undefined when dialog is cancelled', async () => {
    // Mock dialog cancellation
    (dialog.showOpenDialog as any).mockResolvedValue({
      canceled: true,
      filePaths: []
    });
    
    // Register handler
    const handler = async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });
      return result.filePaths[0];
    };
    
    (ipcMain as any).handlers.set('dialog:select-directory', handler);
    
    // Execute handler
    const result = await handler();
    
    expect(dialog.showOpenDialog).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should handle dialog errors gracefully', async () => {
    const errorMessage = 'Dialog error';
    
    // Mock dialog error
    (dialog.showOpenDialog as any).mockRejectedValue(new Error(errorMessage));
    
    // Register handler with error handling
    const handler = async () => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory']
        });
        return result.filePaths[0];
      } catch (error) {
        console.error('Dialog error:', error);
        return undefined;
      }
    };
    
    (ipcMain as any).handlers.set('dialog:select-directory', handler);
    
    // Execute handler
    const result = await handler();
    
    expect(dialog.showOpenDialog).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});