import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Terminal Split Isolation', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  let wt1Path: string;
  let wt2Path: string;

  test.beforeEach(async () => {
    // Create a dummy git repository with two worktrees
    const timestamp = Date.now();
    dummyRepoPath = path.join(os.tmpdir(), `dummy-repo-${timestamp}`);
    
    // Create the directory and initialize git repo
    fs.mkdirSync(dummyRepoPath, { recursive: true });
    execSync('git init -q', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });
    
    // Create a dummy file and make initial commit (required for worktrees)
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -q -m "Initial commit"', { cwd: dummyRepoPath });
    
    // Create worktree directories
    wt1Path = path.join(os.tmpdir(), `dummy-repo-wt1-${timestamp}`);
    wt2Path = path.join(os.tmpdir(), `dummy-repo-wt2-${timestamp}`);
    
    // Create wt1 worktree with a new branch
    execSync(`git worktree add -b wt1 "${wt1Path}"`, { cwd: dummyRepoPath });
    
    // Create wt2 worktree with a new branch
    execSync(`git worktree add -b wt2 "${wt2Path}"`, { cwd: dummyRepoPath });
    
    console.log('Created dummy repo with wt1 and wt2 branches at:', dummyRepoPath);

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
    
    // Clean up the worktree directories first
    if (wt1Path && fs.existsSync(wt1Path)) {
      try {
        fs.rmSync(wt1Path, { recursive: true, force: true });
        console.log('Cleaned up wt1 worktree');
      } catch (e) {
        console.error('Failed to clean up wt1 worktree:', e);
      }
    }
    
    if (wt2Path && fs.existsSync(wt2Path)) {
      try {
        fs.rmSync(wt2Path, { recursive: true, force: true });
        console.log('Cleaned up wt2 worktree');
      } catch (e) {
        console.error('Failed to clean up wt2 worktree:', e);
      }
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

  test('should maintain separate terminal states between worktrees', async () => {
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

    // Step 1: Switch to wt1
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    
    if (wt1Count === 0) {
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Switching to wt1...');
    await wt1Button.click();
    await page.waitForTimeout(3000);

    // Verify we have 1 terminal in wt1
    let terminalContainers = page.locator('.xterm-screen');
    let terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(1);
    console.log('wt1 has 1 terminal initially');

    // Step 2: Split the terminal in wt1
    const splitButton = page.locator('button[title="Split Terminal"]');
    await expect(splitButton).toBeVisible();
    
    console.log('Splitting terminal in wt1...');
    await splitButton.click();
    await page.waitForTimeout(2000);

    // Verify we now have 2 terminals in wt1
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(2);
    console.log('wt1 now has 2 terminals after split');

    // Type different commands in each terminal to make them distinguishable
    const firstTerminal = terminalContainers.nth(0);
    await firstTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "wt1-terminal-1"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const secondTerminal = terminalContainers.nth(1);
    await secondTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "wt1-terminal-2"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Step 3: Switch to wt2
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Switching to wt2...');
    await wt2Button.click();
    await page.waitForTimeout(3000);

    // Step 4: Verify wt2 only has 1 terminal (not affected by wt1's split)
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(1);
    console.log('wt2 has only 1 terminal (isolated from wt1 split)');

    // Type a command in wt2's terminal to verify it's functional
    const wt2Terminal = terminalContainers.first();
    await wt2Terminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "wt2-terminal"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Verify the output
    const wt2TerminalContent = await wt2Terminal.textContent();
    expect(wt2TerminalContent).toContain('wt2-terminal');
    
    // Step 5: Switch back to wt1 to verify it still has 2 terminals
    console.log('Switching back to wt1...');
    await wt1Button.click();
    await page.waitForTimeout(3000);

    // Verify wt1 still has 2 terminals
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    expect(terminalCount).toBe(2);
    console.log('wt1 still has 2 terminals when switching back');

    // Verify the terminals in wt1 still contain their original content
    const wt1FirstTerminalContent = await terminalContainers.nth(0).textContent();
    expect(wt1FirstTerminalContent).toContain('wt1-terminal-1');

    const wt1SecondTerminalContent = await terminalContainers.nth(1).textContent();
    expect(wt1SecondTerminalContent).toContain('wt1-terminal-2');

    console.log('Test passed: Terminal splits are properly isolated between worktrees');
  });
});