import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Simple Terminal Split Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: dummyRepoPath });

    // Create main branch (some git versions don't create it by default)
    try {
      execSync('git branch -M main', { cwd: dummyRepoPath });
    } catch (e) {
      // Ignore if branch already exists
    }

    console.log('Created dummy repo at:', dummyRepoPath);

    const testMainPath = path.join(__dirname, '../dist/main/test-index.js');
    console.log('Using test main file:', testMainPath);

    // In CI, we need to specify the app directory explicitly
    const appDir = path.join(__dirname, '..');

    electronApp = await electron.launch({
      args: [testMainPath],
      cwd: appDir,
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  }, 45000);

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }

    // Clean up the dummy repository
    if (dummyRepoPath && fs.existsSync(dummyRepoPath)) {
      try {
        fs.rmSync(dummyRepoPath, { recursive: true, force: true });
        console.log('Cleaned up dummy repo');
      } catch (e) {
        console.error('Failed to clean up dummy repo:', e);
      }
    }
  });

  test('should be able to click split button and create split terminal', async () => {
    test.setTimeout(120000);

    await page.waitForLoadState('domcontentloaded');

    // Capture console messages for debugging
    page.on('console', (msg) => {
      if (msg.text().includes('ClaudeTerminalGrid') || msg.text().includes('handleSplit')) {
        console.log(`BROWSER: ${msg.text()}`);
      }
    });

    // Verify the app launches with project selector
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

    // Click the "Open Project Folder" button
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the Electron dialog to return our dummy repository path
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    // Click the open button which will trigger the mocked dialog
    await openButton.click();

    // Wait for worktree list to appear
    await page.waitForTimeout(3000);

    // Try to find the worktree button using data attribute
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);

    // Click the worktree button to open the terminal
    await worktreeButton.click();

    // Wait for the terminal to load
    await page.waitForTimeout(5000);

    console.log('=== BEFORE SPLIT BUTTON CLICK ===');

    // Find and click the split vertical button
    const splitButton = page.locator('button[title="Split Vertical"]');
    await expect(splitButton).toBeVisible();

    console.log('=== CLICKING SPLIT BUTTON ===');
    await splitButton.click();

    // Wait for split terminal to appear
    await page.waitForTimeout(3000);

    console.log('=== AFTER SPLIT BUTTON CLICK ===');

    // Check for evidence that the split worked
    // 1. There should now be 2 split buttons (one in each terminal)
    const splitButtons = await page.locator('button[title="Split Vertical"]').count();
    console.log(`Found ${splitButtons} Split Vertical buttons after split`);
    expect(splitButtons).toBe(2);

    // 2. There should be at least one close button (for the new terminal)
    const closeButtons = await page.locator('button[title="Close Terminal"]').count();
    console.log(`Found ${closeButtons} Close Terminal buttons after split`);
    expect(closeButtons).toBeGreaterThan(0);

    // 3. Take a screenshot to verify visually
    await page.screenshot({ path: '/tmp/terminal_split_success.png', fullPage: true });
    console.log('Screenshot saved to /tmp/terminal_split_success.png');

    console.log('=== TERMINAL SPLIT TEST PASSED ===');
  });
});