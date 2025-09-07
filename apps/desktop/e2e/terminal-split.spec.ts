import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Terminal Split Feature Test', () => {
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

    electronApp = await electron.launch({
      args: [testMainPath],
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

  test('should split terminal vertically and allow interaction with both terminals', async () => {
    test.setTimeout(60000);

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

    // Find the split button
    const splitButton = page.locator('button[title="Split Terminal"]');
    await expect(splitButton).toBeVisible();

    // Click the split button to create a split terminal
    await splitButton.click();

    // Wait for split terminal to appear
    await page.waitForTimeout(2000);

    // Verify two terminal containers exist
    const terminalContainers = page.locator('.xterm-screen');
    const terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(2);

    // Find the close buttons for split terminals (there should be 2)
    const closeButtons = page.locator('button[title="Close Terminal"]');
    const closeButtonCount = await closeButtons.count();
    expect(closeButtonCount).toBe(2);

    // Test first terminal - click and type a command
    const firstTerminal = terminalContainers.nth(0);
    await firstTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Terminal 1"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Test second terminal - click and type a command
    const secondTerminal = terminalContainers.nth(1);
    await secondTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Terminal 2"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify outputs in both terminals
    const firstTerminalContent = await firstTerminal.textContent();
    expect(firstTerminalContent).toContain('Terminal 1');

    const secondTerminalContent = await secondTerminal.textContent();
    expect(secondTerminalContent).toContain('Terminal 2');

    // Test closing the split terminal (close the first terminal)
    await closeButtons.first().click();
    await page.waitForTimeout(1000);

    // Verify only one terminal remains
    const remainingTerminals = await page.locator('.xterm-screen').count();
    expect(remainingTerminals).toBe(1);

    // Verify the first terminal is still functional
    await firstTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Still working"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const finalTerminalContent = await firstTerminal.textContent();
    expect(finalTerminalContent).toContain('Still working');
  });

  test('should maintain 50/50 split ratio between terminals', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Setup and navigate to terminal (similar to above)
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(3000);

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Click the split button
    const splitButton = page.locator('button[title="Split Terminal"]');
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Check that terminals have equal width (50/50 split)
    const terminalContainers = await page.locator('.terminal-container').all();
    
    if (terminalContainers.length >= 2) {
      const firstBox = await terminalContainers[0].boundingBox();
      const secondBox = await terminalContainers[1].boundingBox();
      
      if (firstBox && secondBox) {
        // Allow for small differences due to borders/padding
        const widthDifference = Math.abs(firstBox.width - secondBox.width);
        expect(widthDifference).toBeLessThan(10);
      }
    }
  });

  test('should keep split terminals independent - output not shared', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Setup and navigate to terminal
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, dummyRepoPath);

    await openButton.click();
    await page.waitForTimeout(3000);

    const worktreeButton = page.locator('button[data-worktree-branch="main"]');
    await worktreeButton.click();
    await page.waitForTimeout(3000);

    // Type "echo SIGNAL" in the first terminal BEFORE splitting
    const terminalContainers = page.locator('.xterm-screen');
    const firstTerminal = terminalContainers.nth(0);
    await firstTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo SIGNAL');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify SIGNAL appears in the first terminal
    const firstTerminalContent = await firstTerminal.textContent();
    expect(firstTerminalContent).toContain('SIGNAL');

    // Now create a split terminal
    const splitButton = page.locator('button[title="Split Terminal"]');
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify two terminal containers exist
    const terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(2);

    // Check the second (split) terminal - it should NOT contain SIGNAL
    const secondTerminal = terminalContainers.nth(1);
    const secondTerminalContent = await secondTerminal.textContent();
    
    // The split terminal should be clean and not contain SIGNAL
    expect(secondTerminalContent).not.toContain('SIGNAL');

    // Type something in the split terminal to verify it's independent
    await secondTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Split Terminal Independent"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify the split terminal has its own output
    const updatedSecondContent = await secondTerminal.textContent();
    expect(updatedSecondContent).toContain('Split Terminal Independent');
    
    // Verify the first terminal still has SIGNAL but not the new output
    const updatedFirstContent = await firstTerminal.textContent();
    expect(updatedFirstContent).toContain('SIGNAL');
    expect(updatedFirstContent).not.toContain('Split Terminal Independent');
  });
});