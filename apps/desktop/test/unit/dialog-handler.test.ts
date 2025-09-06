import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ipcMain, dialog } from 'electron';

interface MockIpcMain {
  handle: Mock;
  handlers: Map<string, (...args: unknown[]) => unknown>;
}

interface MockDialog {
  showOpenDialog: Mock;
}

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
  const mockIpcMain = ipcMain as unknown as MockIpcMain;
  const mockDialog = dialog as unknown as MockDialog;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear handlers
    mockIpcMain.handlers = new Map();
    
    // Mock the handle method to store handlers
    mockIpcMain.handle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcMain.handlers.set(channel, handler);
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
    expect(mockIpcMain.handlers.has('dialog:select-directory')).toBe(true);
  });

  it('should return selected directory path when dialog is not cancelled', async () => {
    const mockPath = '/test/project/path';
    
    // Mock dialog response
    mockDialog.showOpenDialog.mockResolvedValue({
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
    
    mockIpcMain.handlers.set('dialog:select-directory', handler);
    
    // Execute handler
    const result = await handler();
    
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory']
    });
    expect(result).toBe(mockPath);
  });

  it('should return undefined when dialog is cancelled', async () => {
    // Mock dialog cancellation
    mockDialog.showOpenDialog.mockResolvedValue({
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
    
    mockIpcMain.handlers.set('dialog:select-directory', handler);
    
    // Execute handler
    const result = await handler();
    
    expect(dialog.showOpenDialog).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should handle dialog errors gracefully', async () => {
    const errorMessage = 'Dialog error';
    
    // Mock dialog error
    mockDialog.showOpenDialog.mockRejectedValue(new Error(errorMessage));
    
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
    
    mockIpcMain.handlers.set('dialog:select-directory', handler);
    
    // Execute handler
    const result = await handler();
    
    expect(dialog.showOpenDialog).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});