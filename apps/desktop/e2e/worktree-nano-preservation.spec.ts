import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Nano Editor Content Preservation', () => {
  let electronApp: ElectronApplication;
  let page: Page;
  let dummyRepoPath: string;
  let wt1Path: string;

  test.beforeEach(async () => {
    // Create a dummy git repository with one worktree
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
    
    // Create wt1 worktree directory
    wt1Path = path.join(os.tmpdir(), `dummy-repo-wt1-${timestamp}`);
    
    // Create wt1 worktree with a new branch
    execSync(`git worktree add -b wt1 "${wt1Path}"`, { cwd: dummyRepoPath });
    
    console.log('Created dummy repo with main and wt1 branches at:', dummyRepoPath);

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
    
    // Clean up the worktree directory first
    if (wt1Path && fs.existsSync(wt1Path)) {
      try {
        fs.rmSync(wt1Path, { recursive: true, force: true });
        console.log('Cleaned up wt1 worktree');
      } catch (e) {
        console.error('Failed to clean up wt1 worktree:', e);
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

  test('should preserve nano editor content when switching between worktrees', async () => {
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

    // Step 1: Switch to wt1 and open nano
    console.log('\n=== STEP 1: SWITCHING TO WT1 AND OPENING NANO ===');
    const wt1Button = page.locator('button[data-worktree-branch="wt1"]');
    const wt1Count = await wt1Button.count();
    console.log(`Found ${wt1Count} wt1 button(s)`);
    
    if (wt1Count === 0) {
      // Log all buttons to debug
      const allButtons = await page.locator('button').all();
      console.log('All buttons on page:');
      for (const btn of allButtons) {
        const text = await btn.textContent();
        const attrs = await btn.evaluate(el => Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' '));
        console.log(`  - Button: ${text?.trim() || '(no text)'} | Attrs: ${attrs}`);
      }
      throw new Error('Could not find wt1 worktree button');
    }
    
    console.log('Clicking wt1 button...');
    await wt1Button.click();
    console.log('Waiting for worktree to load...');
    await page.waitForTimeout(3000);

    // Verify we have a terminal in wt1
    let terminalContainers = page.locator('.xterm-screen');
    let terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt1: ${terminalCount}`);
    expect(terminalCount).toBe(1);
    
    // Click terminal to focus and open nano
    const wt1Terminal = terminalContainers.first();
    await wt1Terminal.click();
    await page.waitForTimeout(500);
    
    // Create a test file first
    console.log('Creating test file...');
    await page.keyboard.type('echo "Initial content" > test.txt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Open nano with the test file
    console.log('Opening nano editor...');
    await page.keyboard.type('nano test.txt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    // Type some content in nano
    console.log('Typing content in nano...');
    await page.keyboard.type('This is test content in nano editor');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2: Terminal preservation test');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 3: Should stay visible after switch');
    await page.waitForTimeout(1000);
    
    // Capture the visible terminal lines (excluding CSS and other DOM artifacts)
    const wt1TerminalLinesBefore = await wt1Terminal.evaluate(el => {
      // Get all the visible text lines from the terminal
      const lines = [];
      const rows = el.querySelectorAll('.xterm-rows > div');
      rows.forEach(row => {
        const text = row.textContent || '';
        lines.push(text);
      });
      return lines;
    });
    
    console.log('Nano editor content captured');
    console.log(`Terminal has ${wt1TerminalLinesBefore.length} lines`);
    console.log('First few lines:', wt1TerminalLinesBefore.slice(0, 5));
    
    // Verify nano is running (check for nano/pico in the lines)
    const terminalText = wt1TerminalLinesBefore.join('\n');
    expect(terminalText.toLowerCase()).toMatch(/gnu nano|pico/);
    expect(terminalText).toContain('test.txt');
    expect(terminalText).toContain('This is test content in nano editor');
    expect(terminalText).toContain('Line 2: Terminal preservation test');
    expect(terminalText).toContain('Line 3: Should stay visible after switch');
    
    // Store the exact lines for later comparison
    const originalTerminalLines = wt1TerminalLinesBefore;
    
    // Get terminal dimensions for verification
    const terminalDimensions = await wt1Terminal.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        width: rect.width,
        height: rect.height,
        cols: Math.floor(rect.width / 9), // Approximate character width
        rows: Math.floor(rect.height / 17) // Approximate line height
      };
    });
    console.log('Terminal dimensions:', terminalDimensions);

    // Step 2: Switch to main branch
    console.log('\n=== STEP 2: SWITCHING TO MAIN BRANCH ===');
    const mainButton = page.locator('button[data-worktree-branch="main"], button[data-worktree-branch="master"]');
    const mainCount = await mainButton.count();
    console.log(`Found ${mainCount} main/master button(s)`);
    
    console.log('Clicking main button to switch...');
    await mainButton.click();
    console.log('Waiting for main worktree to load...');
    await page.waitForTimeout(3000);
    
    // Verify we have a terminal in main
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in main: ${terminalCount}`);
    expect(terminalCount).toBe(1);
    
    // Type something in main terminal to make it distinct
    const mainTerminal = terminalContainers.first();
    await mainTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "This is main branch"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const mainTerminalContent = await mainTerminal.textContent();
    console.log(`Main terminal content preview: ${mainTerminalContent?.substring(0, 100)}...`);
    expect(mainTerminalContent).toContain('This is main branch');

    // Step 3: Switch back to wt1
    console.log('\n=== STEP 3: SWITCHING BACK TO WT1 ===');
    console.log('Clicking wt1 button to switch back...');
    await wt1Button.click();
    console.log('Waiting for wt1 worktree to load...');
    await page.waitForTimeout(3000);

    // Step 4: Verify nano editor content is preserved
    console.log('\n=== STEP 4: VERIFYING NANO CONTENT PRESERVATION ===');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt1 (after switch back): ${terminalCount}`);
    expect(terminalCount).toBe(1);
    
    const wt1TerminalAfter = terminalContainers.first();
    
    // Capture the visible terminal lines after switching back
    const wt1TerminalLinesAfter = await wt1TerminalAfter.evaluate(el => {
      // Get all the visible text lines from the terminal
      const lines = [];
      const rows = el.querySelectorAll('.xterm-rows > div');
      rows.forEach(row => {
        const text = row.textContent || '';
        lines.push(text);
      });
      return lines;
    });
    
    console.log(`Terminal has ${wt1TerminalLinesAfter.length} lines after switching back`);
    console.log('First few lines after switch:', wt1TerminalLinesAfter.slice(0, 5));
    
    // CRITICAL: Verify the terminal content is EXACTLY identical
    console.log('\nComparing terminal content:');
    console.log(`Original lines count: ${originalTerminalLines.length}`);
    console.log(`After switch lines count: ${wt1TerminalLinesAfter.length}`);
    
    // Compare line by line for better debugging
    let mismatchFound = false;
    for (let i = 0; i < Math.max(originalTerminalLines.length, wt1TerminalLinesAfter.length); i++) {
      if (originalTerminalLines[i] !== wt1TerminalLinesAfter[i]) {
        if (!mismatchFound) {
          console.log(`\n❌ Terminal content MISMATCH detected at line ${i}!`);
          console.log(`Original line ${i}: "${originalTerminalLines[i]}"`);
          console.log(`After line ${i}: "${wt1TerminalLinesAfter[i]}"`);
          mismatchFound = true;
        }
      }
    }
    
    // The terminal lines should be EXACTLY identical
    expect(wt1TerminalLinesAfter).toEqual(originalTerminalLines);
    
    // Also verify the content contains what we expect
    const terminalTextAfter = wt1TerminalLinesAfter.join('\n');
    expect(terminalTextAfter).toContain('This is test content in nano editor');
    expect(terminalTextAfter).toContain('Line 2: Terminal preservation test');
    expect(terminalTextAfter).toContain('Line 3: Should stay visible after switch');
    
    // Verify terminal dimensions are preserved
    const terminalDimensionsAfter = await wt1TerminalAfter.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        width: rect.width,
        height: rect.height,
        cols: Math.floor(rect.width / 9), // Approximate character width
        rows: Math.floor(rect.height / 17) // Approximate line height
      };
    });
    console.log('Terminal dimensions after switch:', terminalDimensionsAfter);
    
    // Compare dimensions (allowing small variance)
    expect(Math.abs(terminalDimensions.cols - terminalDimensionsAfter.cols)).toBeLessThanOrEqual(2);
    expect(Math.abs(terminalDimensions.rows - terminalDimensionsAfter.rows)).toBeLessThanOrEqual(2);
    
    // Additional verification: ensure it doesn't contain main branch content
    expect(terminalTextAfter).not.toContain('This is main branch');
    console.log('✓ Verified wt1 terminal does not contain main branch content');
    
    // Exit nano gracefully (Ctrl+X)
    console.log('Exiting nano editor...');
    await page.keyboard.press('Control+X');
    await page.waitForTimeout(500);
    await page.keyboard.press('n'); // Don't save changes
    await page.waitForTimeout(1000);
    
    console.log('\n✓✓✓ TEST PASSED: Nano editor content is EXACTLY preserved when switching between worktrees ✓✓✓');
    console.log('Summary:');
    console.log('  - Nano editor content is byte-for-byte identical after switching');
    console.log('  - Terminal content within cols/rows was perfectly preserved');
    console.log('  - Terminal states are isolated between worktrees');
    console.log('  - No cross-contamination of terminal content');
  });
});