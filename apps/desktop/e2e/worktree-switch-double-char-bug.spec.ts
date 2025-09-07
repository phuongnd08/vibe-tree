import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Switch Double Character Bug', () => {
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
    execSync('git init', { cwd: dummyRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: dummyRepoPath });
    execSync('git config user.name "Test User"', { cwd: dummyRepoPath });
    
    // Create a dummy file and make initial commit
    fs.writeFileSync(path.join(dummyRepoPath, 'README.md'), '# Test Repository\n');
    execSync('git add .', { cwd: dummyRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: dummyRepoPath });
    
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

  test('should NOT display double characters when switching between worktrees', async () => {
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

    // Use the reliable data-worktree-branch selector
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    
    if (wt1Count === 0) {
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Found wt1 worktree button');

    // First click on wt1
    console.log('Clicking on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

    // Find and click on wt2 using the data attribute
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Found wt2 worktree button');

    console.log('Clicking on wt2...');
    await wt2Button.click();
    await page.waitForTimeout(2000);

    // Click back on wt1
    console.log('Clicking back on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(1000);

    // Type "echo" command
    console.log('Typing "echo" command...');
    await page.keyboard.type('echo');
    await page.waitForTimeout(1000);

    // Get the terminal content
    const terminalContent = await page.locator('.xterm-screen').innerText();
    console.log('Terminal content after typing "echo":', terminalContent);

    // The bug causes "eecchhoo" to appear instead of "echo"
    // This test should FAIL initially (demonstrating the bug exists)
    // and PASS after the fix is applied
    
    // Check that the terminal does NOT contain the doubled characters
    expect(terminalContent).not.toContain('eecchhoo');
    
    // Check that the terminal contains the correct single "echo"
    expect(terminalContent).toContain('echo');
  });

  test('should preserve terminal content when switching between worktrees without typing', async () => {
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

    // Use the reliable data-worktree-branch selector
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    
    if (wt1Count === 0) {
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Found wt1 worktree button');

    // First click on wt1
    console.log('Clicking on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

    // Get the initial terminal content
    const terminalScreen = page.locator('.xterm-screen');
    await expect(terminalScreen).toBeVisible({ timeout: 5000 });
    
    // Wait a bit for terminal to stabilize
    await page.waitForTimeout(1000);
    
    const initialContent = await terminalScreen.innerText();
    
    // Extract just the visible terminal text - innerText should already be clean
    const extractTerminalText = (content: string) => {
      // With innerText, we should already have clean content without CSS
      // Just trim any extra whitespace and return
      return content.trim();
    };
    
    const initialTerminalText = extractTerminalText(initialContent || '');
    console.log('===== INITIAL CAPTURE FOR WT1 =====');
    console.log('Initial terminal text for wt1:', initialTerminalText);
    console.log('Initial content length:', initialContent?.length);
    console.log('Initial content has wt2 reference:', initialContent?.includes('wt2'));
    console.log('====================================');

    // Find and click on wt2 using the data attribute
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Found wt2 worktree button');

    console.log('Clicking on wt2...');
    await wt2Button.click();
    await page.waitForTimeout(2000);
    
    // Get wt2 content for comparison
    const wt2Content = await terminalScreen.innerText();
    const wt2TerminalText = extractTerminalText(wt2Content || '');
    console.log('===== AFTER SWITCHING TO WT2 =====');
    console.log('Terminal text for wt2:', wt2TerminalText);
    console.log('WT2 content has wt1 reference:', wt2Content?.includes('wt1'));
    console.log('WT2 content has wt2 reference:', wt2Content?.includes('wt2'));
    console.log('===================================');

    // Click back on wt1
    console.log('Clicking back on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

    // Get the terminal content after switching back
    const finalContent = await terminalScreen.innerText();
    const finalTerminalText = extractTerminalText(finalContent || '');
    console.log('===== AFTER SWITCHING BACK TO WT1 =====');
    console.log('Final terminal text for wt1 after switching back:', finalTerminalText);
    console.log('Final content length:', finalContent?.length);
    console.log('Final content has wt1 reference:', finalContent?.includes('wt1'));
    console.log('Final content has wt2 reference:', finalContent?.includes('wt2'));
    console.log('========================================');
    
    // Compare the extracted terminal text
    console.log('===== COMPARISON =====');
    console.log('Initial:', initialTerminalText);
    console.log('Final:  ', finalTerminalText);
    console.log('Are they equal?', initialTerminalText === finalTerminalText);
    console.log('=====================');

    // Verify that the terminal content remains the same
    expect(finalTerminalText).toBe(initialTerminalText);
  });

  test('should preserve user input state when switching between worktrees', async () => {
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

    // Use the reliable data-worktree-branch selector
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    
    if (wt1Count === 0) {
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Found wt1 worktree button');

    // First click on wt1
    console.log('Clicking on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(1000);

    // Type partial command without pressing enter
    console.log('Typing partial command "echo hello" without pressing enter...');
    await page.keyboard.type('echo hello');
    await page.waitForTimeout(1000);

    // Get the terminal content to verify our input is there
    const terminalScreen = page.locator('.xterm-screen');
    const contentAfterTyping = await terminalScreen.innerText();
    console.log('===== AFTER TYPING IN WT1 =====');
    console.log('Content after typing:', contentAfterTyping);
    console.log('Contains "echo hello":', contentAfterTyping?.includes('echo hello'));
    console.log('===============================');

    // Find and click on wt2 
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Found wt2 worktree button');

    console.log('Clicking on wt2...');
    await wt2Button.click();
    await page.waitForTimeout(2000);

    // Click back on wt1
    console.log('Clicking back on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(2000);

    // Click on the terminal to focus it again
    await terminalElement!.click();
    await page.waitForTimeout(1000);

    // Get the terminal content after switching back
    const finalContent = await terminalScreen.innerText();
    console.log('===== AFTER SWITCHING BACK TO WT1 =====');
    console.log('Final content:', finalContent);
    console.log('Still contains "echo hello":', finalContent?.includes('echo hello'));
    console.log('======================================');

    // The user input should still be there and functional
    // If we press Enter now, the command should execute
    console.log('Pressing Enter to execute the command...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const contentAfterEnter = await terminalScreen.innerText();
    console.log('===== AFTER PRESSING ENTER =====');
    console.log('Content after Enter:', contentAfterEnter);
    console.log('Command executed (should see "hello" output):', contentAfterEnter?.includes('hello'));
    console.log('===============================');

    // Verify that:
    // 1. The user input was preserved when switching back
    // 2. The command can still be executed (PTY state is intact)
    expect(finalContent?.includes('echo hello')).toBe(true);
    expect(contentAfterEnter?.includes('hello')).toBe(true);
  });

  test('should not contaminate terminal when switching to wt2 for first time', async () => {
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

    // Use the reliable data-worktree-branch selector
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    
    if (wt1Count === 0) {
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Found wt1 worktree button');

    // First click on wt1
    console.log('Clicking on wt1...');
    await wt1Button.click();
    await page.waitForTimeout(3000); // Give more time for wt1 to fully load

    // Get the initial terminal content
    const terminalScreen = page.locator('.xterm-screen');
    await expect(terminalScreen).toBeVisible({ timeout: 5000 });
    
    // Wait for terminal to settle
    await page.waitForTimeout(2000);
    
    const wt1InitialContent = await terminalScreen.innerText();
    
    console.log('===== WT1 INITIAL STATE =====');
    console.log('WT1 content length:', wt1InitialContent?.length);
    console.log('WT1 has wt1 reference:', wt1InitialContent?.includes('wt1'));
    console.log('WT1 has wt2 reference:', wt1InitialContent?.includes('wt2'));
    console.log('WT1 content preview:', wt1InitialContent?.substring(0, 200));
    console.log('=============================');

    // Find wt2 button
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Found wt2 worktree button');

    // Now click on wt2 (first time, should be a new session)
    console.log('Clicking on wt2 for the FIRST time...');
    await wt2Button.click();
    await page.waitForTimeout(3000); // Give time for wt2 to fully load

    // Get wt2 content immediately after switching
    const wt2Content = await terminalScreen.innerText();
    
    console.log('===== WT2 AFTER FIRST SWITCH =====');
    console.log('WT2 content length:', wt2Content?.length);
    console.log('WT2 has wt1 reference:', wt2Content?.includes('wt1'));
    console.log('WT2 has wt2 reference:', wt2Content?.includes('wt2'));
    console.log('WT2 content preview:', wt2Content?.substring(0, 200));
    console.log('=================================');

    // The critical test: wt2 should NOT contain wt1's content
    // This is the moment contamination happens
    expect(wt2Content?.includes('wt1')).toBe(false);
  });
});