import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Terminal Recursive Split Feature Test', () => {
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

  test('should allow continuous splitting of terminals', async () => {
    test.setTimeout(90000);

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

    // Start with 1 terminal - split to 2
    const splitButton = page.locator('button[title="Split Terminal"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    let terminalContainers = page.locator('.xterm-screen');
    let terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(2);

    // Split the first terminal again to get 3 terminals total
    // Find split buttons (should be 2 now, one for each terminal)
    const splitButtons = page.locator('button[title="Split Terminal"]');
    const splitButtonCount = await splitButtons.count();
    expect(splitButtonCount).toBeGreaterThanOrEqual(1);
    
    // Click the first split button to split the first terminal
    await splitButtons.first().click();
    await page.waitForTimeout(2000);

    // Verify we have 3 terminals after recursive split
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(3);

    // Test that each terminal works independently
    const terminals = await terminalContainers.all();
    
    // Test terminal 1
    await terminals[0].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Terminal 1"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Test terminal 2  
    await terminals[1].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Terminal 2"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Test terminal 3
    await terminals[2].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Terminal 3"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify outputs in all terminals
    const terminal1Content = await terminals[0].textContent();
    expect(terminal1Content).toContain('Terminal 1');

    const terminal2Content = await terminals[1].textContent();
    expect(terminal2Content).toContain('Terminal 2');

    const terminal3Content = await terminals[2].textContent();
    expect(terminal3Content).toContain('Terminal 3');
  });

  test('should prevent closing the last terminal', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Setup terminal (same as previous test)
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

    // Split to get 2 terminals
    const splitButton = page.locator('button[title="Split Terminal"]').first();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals
    let terminalCount = await page.locator('.xterm-screen').count();
    expect(terminalCount).toBe(2);

    // Close one terminal - should work
    const closeSplitButton = page.locator('button[title="Close Terminal"]').first();
    await expect(closeSplitButton).toBeVisible();
    await closeSplitButton.click();
    await page.waitForTimeout(1000);

    // Verify we have 1 terminal left
    terminalCount = await page.locator('.xterm-screen').count();
    expect(terminalCount).toBe(1);

    // Try to close the last terminal - button should be hidden/disabled or action should be prevented
    const remainingCloseButtons = await page.locator('button[title="Close Terminal"]').count();
    expect(remainingCloseButtons).toBe(0); // No close buttons should be visible when only 1 terminal remains
  });

  test('should preserve sibling terminals when closing a middle terminal', async () => {
    test.setTimeout(90000);

    await page.waitForLoadState('domcontentloaded');

    // Setup terminal (same as previous test)
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

    // Start with Terminal 1, split to get Terminal 2
    const splitButton = page.locator('button[title="Split Terminal"]').first();
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we have 2 terminals (Terminal 1 and Terminal 2)
    let terminalCount = await page.locator('.xterm-screen').count();
    expect(terminalCount).toBe(2);

    // Type in Terminal 1 first
    let terminals = await page.locator('.xterm-screen').all();
    await terminals[0].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "TERMINAL_1_MARKER"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Type in Terminal 2
    await terminals[1].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "TERMINAL_2_MARKER"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Split Terminal 2 to get Terminal 3
    // Find the split button in the second terminal's header (Terminal 2)
    const splitButtons = page.locator('button[title="Split Terminal"]');
    const splitButtonCount = await splitButtons.count();
    expect(splitButtonCount).toBeGreaterThanOrEqual(2);
    
    // Click the split button for Terminal 2 (usually the second one)
    await splitButtons.nth(1).click();
    await page.waitForTimeout(2000);

    // Verify we have 3 terminals (Terminal 1, Terminal 2, Terminal 3)
    terminalCount = await page.locator('.xterm-screen').count();
    expect(terminalCount).toBe(3);

    // Type in Terminal 3
    terminals = await page.locator('.xterm-screen').all();
    await terminals[2].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "TERMINAL_3_MARKER"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Verify all terminals have their unique content by checking the whole page text
    const pageContent = await page.locator('body').innerText();
    
    expect(pageContent).toContain('TERMINAL_1_MARKER');
    expect(pageContent).toContain('TERMINAL_2_MARKER');
    expect(pageContent).toContain('TERMINAL_3_MARKER');

    // Now close Terminal 2 (the middle one)
    // Find close buttons and click the one for Terminal 2
    const closeButtons = page.locator('button[title="Close Terminal"]');
    const closeButtonCount = await closeButtons.count();
    expect(closeButtonCount).toBe(3); // Should have 3 close buttons for 3 terminals

    // Close Terminal 2 (usually the second close button)
    await closeButtons.nth(1).click();
    await page.waitForTimeout(3000); // More time for re-rendering

    // Verify we now have 2 terminals left
    terminalCount = await page.locator('.xterm-screen').count();
    expect(terminalCount).toBe(2);

    // Get the remaining terminals
    const remainingTerminals = await page.locator('.xterm-screen').all();
    expect(remainingTerminals.length).toBe(2);
    
    // Click on each remaining terminal to ensure they're active
    await remainingTerminals[0].click();
    await page.waitForTimeout(500);
    await remainingTerminals[1].click();
    await page.waitForTimeout(500);

    // Verify that Terminal 1 and Terminal 3 are still present
    // Check the whole page content after closing Terminal 2
    const remainingPageContent = await page.locator('body').innerText();
    
    // Debug output
    console.log('Page content after closing Terminal 2:', remainingPageContent.substring(0, 500));
    
    // Terminal 1 and Terminal 3 should still be visible, Terminal 2 should be gone
    expect(remainingPageContent).toContain('TERMINAL_1_MARKER');
    expect(remainingPageContent).toContain('TERMINAL_3_MARKER');
    expect(remainingPageContent).not.toContain('TERMINAL_2_MARKER');

    // Test that the remaining terminals are still functional
    await remainingTerminals[0].click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "Still working after close"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const updatedContent = await remainingTerminals[0].textContent();
    expect(updatedContent).toContain('Still working after close');
  });
});