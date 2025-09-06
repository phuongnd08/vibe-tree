import { test, expect, ElectronApplication, Page, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';

let app: ElectronApplication;
let page: Page;

test.describe('Project Opening Feature', () => {
  test.beforeEach(async () => {
    // Launch Electron app
    app = await electron.launch({
      args: [path.join(__dirname, '../../dist/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    // Get the main window
    page = await app.firstWindow();
    
    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    // Close the app
    if (app) {
      await app.close();
    }
  });

  test('should display project selector on startup', async () => {
    // Check if the project selector is visible
    const projectSelector = await page.locator('text=Select a Project');
    await expect(projectSelector).toBeVisible();
    
    const openButton = await page.locator('button:has-text("Open Project Folder")');
    await expect(openButton).toBeVisible();
  });

  test('should open project dialog when button is clicked', async () => {
    // Create a test git repository
    const testRepoPath = path.join(__dirname, 'test-repo');
    await fs.mkdir(testRepoPath, { recursive: true });
    
    try {
      // Initialize git repo
      execSync('git init', { cwd: testRepoPath });
      execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
      execSync('git config user.name "Test User"', { cwd: testRepoPath });
      
      // Create a test file and commit
      await fs.writeFile(path.join(testRepoPath, 'README.md'), '# Test Repo');
      execSync('git add .', { cwd: testRepoPath });
      execSync('git commit -m "Initial commit"', { cwd: testRepoPath });
      
      // Mock the dialog to return our test repo path
      await app.evaluate(({ dialog }, testPath) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [testPath]
        });
      }, testRepoPath);
      
      // Click the open project button
      const openButton = await page.locator('button:has-text("Open Project Folder")');
      await openButton.click();
      
      // Wait for the project to load
      await page.waitForTimeout(1000);
      
      // Check if the worktree list is displayed (indicating project was opened)
      const worktreeSection = await page.locator('text=Worktrees');
      await expect(worktreeSection).toBeVisible({ timeout: 5000 });
      
    } finally {
      // Clean up test repo
      await fs.rm(testRepoPath, { recursive: true, force: true });
    }
  });

  test('should handle dialog cancellation gracefully', async () => {
    // Mock the dialog to simulate cancellation
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({
        canceled: true,
        filePaths: []
      });
    });
    
    // Click the open project button
    const openButton = await page.locator('button:has-text("Open Project Folder")');
    await openButton.click();
    
    // The project selector should still be visible
    await page.waitForTimeout(500);
    const projectSelector = await page.locator('text=Select a Project');
    await expect(projectSelector).toBeVisible();
  });

  test('should validate that selected path is a git repository', async () => {
    // Create a non-git directory
    const nonGitPath = path.join(__dirname, 'non-git-folder');
    await fs.mkdir(nonGitPath, { recursive: true });
    
    try {
      // Mock the dialog to return non-git path
      await app.evaluate(({ dialog }, testPath) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [testPath]
        });
      }, nonGitPath);
      
      // Click the open project button
      const openButton = await page.locator('button:has-text("Open Project Folder")');
      await openButton.click();
      
      // Wait for error handling
      await page.waitForTimeout(1000);
      
      // Should show an error or stay on project selector
      const projectSelector = await page.locator('text=Select a Project');
      const errorMessage = await page.locator('text=/not.*git|invalid.*repository/i');
      
      // Either still on selector or showing error
      const selectorVisible = await projectSelector.isVisible().catch(() => false);
      const errorVisible = await errorMessage.isVisible().catch(() => false);
      
      expect(selectorVisible || errorVisible).toBeTruthy();
      
    } finally {
      // Clean up
      await fs.rm(nonGitPath, { recursive: true, force: true });
    }
  });
});