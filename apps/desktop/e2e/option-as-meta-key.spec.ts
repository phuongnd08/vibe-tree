import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Option as Meta Key Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;

  test.beforeEach(async () => {
    // Create a dummy git repository for testing
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);

    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });

    // Create a dummy file and make initial commit (required for branches/worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });

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

  test('should support Option as Meta key functionality on macOS', async () => {
    test.setTimeout(60000);

    // Skip test on non-macOS platforms since Option key is macOS-specific
    const platform = process.platform;
    if (platform !== 'darwin') {
      test.skip(true, 'Option as Meta key functionality is specific to macOS');
      return;
    }

    await page.waitForLoadState('domcontentloaded');

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

    // Try to find the worktree button using data attribute - in the dummy repo it should be main or master
    const worktreeButton = page.locator('button[data-worktree-branch="main"]');

    const worktreeCount = await worktreeButton.count();
    expect(worktreeCount).toBeGreaterThan(0);

    // Click the worktree button to open the terminal
    await worktreeButton.click();

    // Wait for the terminal to load
    await page.waitForTimeout(3000);

    // Find the terminal element
    const terminalSelectors = ['.xterm-screen', '.xterm', '.xterm-container'];
    let terminalElement = null;

    for (const selector of terminalSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        terminalElement = element;
        break;
      }
    }

    expect(terminalElement).not.toBeNull();

    // Click on the terminal to focus it
    await terminalElement!.click();

    // Wait for focus and shell to be ready
    await page.waitForTimeout(1000);

    // Test sequence: Type "PART2", then Ctrl+A (beginning of line), then type "PART1 "
    // This tests that Ctrl+A properly moves to beginning of line using readline
    
    // First, type "PART2"
    await page.keyboard.type('PART2');

    // Wait a moment for the text to appear
    await page.waitForTimeout(500);

    // Then press Ctrl+A to go to beginning of line
    await page.keyboard.press('Control+a');

    // Wait a moment for cursor positioning
    await page.waitForTimeout(500);

    // Then type "PART1 " (with space)
    await page.keyboard.type('PART1 ');

    // Wait a moment for the text to appear
    await page.waitForTimeout(500);

    // Press Enter to execute the command (this will cause "command not found" but that's ok)
    await page.keyboard.press('Enter');

    // Wait for the output to appear
    await page.waitForTimeout(2000);

    // Verify the terminal content contains "PART1 PART2" in the correct order
    const terminalContent = await page.locator('.xterm-screen').textContent();
    
    // The terminal should show the command as "PART1 PART2" since we moved cursor to beginning
    // and typed "PART1 " before the existing "PART2"
    expect(terminalContent).toContain('PART1 PART2');
    
    console.log('Terminal content for verification:', terminalContent);
  });

  test('should handle Meta key sequences with bash readline', async () => {
    test.setTimeout(60000);

    // Skip test on non-macOS platforms since Option key is macOS-specific
    const platform = process.platform;
    if (platform !== 'darwin') {
      test.skip(true, 'Option as Meta key functionality is specific to macOS');
      return;
    }

    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForTimeout(3000);

    // Find the terminal element
    const terminalSelectors = ['.xterm-screen', '.xterm', '.xterm-container'];
    let terminalElement = null;

    for (const selector of terminalSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        terminalElement = element;
        break;
      }
    }

    expect(terminalElement).not.toBeNull();

    // Click on the terminal to focus it
    await terminalElement!.click();

    // Wait for focus and shell to be ready
    await page.waitForTimeout(1000);

    // Test Meta+F (Alt+F) to move forward by word
    // Type a multi-word command: "echo hello world"
    await page.keyboard.type('echo hello world');
    
    // Wait for the text to appear
    await page.waitForTimeout(500);

    // Move to beginning of line with Ctrl+A
    await page.keyboard.press('Control+a');
    
    // Wait for cursor positioning
    await page.waitForTimeout(500);

    // Use Meta+F (Option+F on Mac) to move forward by word
    // This should move the cursor to the space after "echo"
    await page.keyboard.press('Alt+f');
    
    // Wait for cursor positioning
    await page.waitForTimeout(500);

    // Type "TEST " which should be inserted after "echo"
    await page.keyboard.type('TEST ');
    
    // Wait for the text to appear
    await page.waitForTimeout(500);

    // Press Enter to execute
    await page.keyboard.press('Enter');

    // Wait for the output to appear
    await page.waitForTimeout(2000);

    // Verify that the command became "echo TEST hello world"
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('TEST hello world');
    
    console.log('Terminal content for Meta+F test:', terminalContent);
  });
});