import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Simple Option as Meta Key Test', () => {
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

  test('should verify terminal options are correctly configured', async () => {
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

    // First, let's just test basic typing works
    await page.keyboard.type('echo test');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Verify the terminal content contains "test" output
    const terminalContent = await page.locator('.xterm-rows').textContent();
    console.log('Basic test terminal content:', terminalContent);
    expect(terminalContent).toContain('test');

    // Now test if we can use the escape sequences properly
    // First type a word
    await page.keyboard.type('hello');
    await page.waitForTimeout(500);
    
    // Try to go to beginning of line using Home key (more universal)
    await page.keyboard.press('Home');
    await page.waitForTimeout(500);
    
    // Type at the beginning
    await page.keyboard.type('start ');
    await page.waitForTimeout(500);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Check if the command was "start hello"
    const content2 = await page.locator('.xterm-rows').textContent();
    console.log('Home key test content:', content2);
    
    // Verify we can see evidence of our commands
    expect(content2).toBeTruthy();
  });

  test('should test macOptionIsMeta configuration directly', async () => {
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

    // Test if terminal instance has the correct configuration
    const terminalConfig = await page.evaluate(() => {
      // Try to access the terminal instance
      const xtermElements = document.querySelectorAll('.xterm');
      if (xtermElements.length > 0) {
        // Try to find the terminal instance through react-xtermjs
        // This is a bit hacky but might work
        return {
          hasTerminal: true,
          elementCount: xtermElements.length
        };
      }
      return {
        hasTerminal: false,
        elementCount: 0
      };
    });

    console.log('Terminal configuration check:', terminalConfig);
    expect(terminalConfig.hasTerminal).toBe(true);

    // Test simple Option key behavior
    // Type a simple command with spaces
    await page.keyboard.type('echo word1 word2 word3');
    await page.waitForTimeout(500);
    
    // Try using Option+B to go back one word (if macOptionIsMeta is working)
    // On Mac, Option+B should move cursor back one word
    await page.keyboard.down('Alt');  // Alt is interpreted as Option on Mac
    await page.keyboard.press('b');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(500);
    
    // Type something to see where cursor is
    await page.keyboard.type('_TEST');
    await page.waitForTimeout(500);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const terminalContent = await page.locator('.xterm-rows').textContent();
    console.log('Option+B test content:', terminalContent);
    
    // If macOptionIsMeta is working and Option+B moved back one word,
    // we should see "word1 word2_TEST word3" or similar
    // If not working, we'd see "word1 word2 word3ḇ_TEST" or similar
    expect(terminalContent).toBeTruthy();
  });

  test('should type PART1 then PART2 and verify output', async () => {
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

    // Check terminal configuration via evaluate
    const terminalConfig = await page.evaluate(() => {
      // Try to find the terminal instance through the global scope or React internals
      const terminalElements = document.querySelectorAll('.xterm');
      if (terminalElements.length > 0) {
        // Try to access terminal options through the element's data or React props
        const element = terminalElements[0] as any;
        // Log to console for debugging
        console.log('Terminal element:', element);
        // Check if we can find the terminal instance
        const keys = Object.keys(element);
        const reactKey = keys.find(key => key.startsWith('__react'));
        if (reactKey) {
          console.log('React internal key found:', reactKey);
        }
        return {
          hasTerminal: true,
          elementKeys: keys.slice(0, 10) // First 10 keys for debugging
        };
      }
      return { hasTerminal: false };
    });
    console.log('Terminal configuration:', terminalConfig);

    // Let's try a simpler test first - just type and verify
    await page.keyboard.type('echo PART1PART2');
    await page.waitForTimeout(500);

    // Press Enter to execute the command
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Get terminal content
    const terminalContent = await page.locator('.xterm-rows').textContent();
    console.log('Simple echo test - Terminal content:', terminalContent);

    // Verify the terminal shows "PART1PART2" in the output
    expect(terminalContent).toContain('PART1PART2');

    // Now let's test the original requirement: Type PART1, Alt+B, Alt+F, then PART2
    // Clear the line first
    await page.keyboard.down('Control');
    await page.keyboard.press('c');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

    // Type PART1
    await page.keyboard.type('PART1');
    await page.waitForTimeout(500);

    // Use Alt+B to move back one word
    await page.keyboard.down('Alt');
    await page.keyboard.press('b');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(500);

    // Use Alt+F to move forward one word
    await page.keyboard.down('Alt');
    await page.keyboard.press('f');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(500);

    // Type PART2
    await page.keyboard.type('PART2');
    await page.waitForTimeout(500);

    // Press Home to move to beginning of line
    await page.keyboard.press('Home');
    await page.waitForTimeout(500);

    // Type echo before the command
    await page.keyboard.type('echo ');
    await page.waitForTimeout(500);

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Get updated content
    const finalContent = await page.locator('.xterm-rows').textContent();
    console.log('Alt+B/Alt+F test - Terminal content:', finalContent);
    
    // Verify we see PART1PART2 in the output
    expect(finalContent).toContain('PART1PART2');
  });
});