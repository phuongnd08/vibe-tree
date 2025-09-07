import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Worktree Terminal Exact Content Preservation', () => {
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

  test('should preserve exact terminal output when switching between worktrees', async () => {
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

    // Step 1: Switch to wt1 and create distinctive terminal output
    console.log('\n=== STEP 1: SWITCHING TO WT1 AND CREATING OUTPUT ===');
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
    
    // Click terminal to focus and create output with special formatting
    const wt1Terminal = terminalContainers.first();
    await wt1Terminal.click();
    await page.waitForTimeout(500);
    
    // Create multi-line output with special characters that would be affected by terminal state
    console.log('Creating formatted terminal output...');
    
    // Create a unique pattern that tests terminal preservation
    await page.keyboard.type('echo "╔══════════════════════════════╗"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    await page.keyboard.type('echo "║  TERMINAL STATE TEST - WT1  ║"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    await page.keyboard.type('echo "║  Line 1: Test Content 🚀     ║"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    await page.keyboard.type('echo "║  Line 2: Special chars: <>& ║"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    await page.keyboard.type('echo "╚══════════════════════════════╝"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // Type a partial command but don't execute it (simulates mid-typing state)
    await page.keyboard.type('echo "This command is not executed yet');
    // Don't press Enter - leave it incomplete
    await page.waitForTimeout(1000);
    
    // Capture the exact terminal content
    const wt1TerminalContentBefore = await wt1Terminal.textContent();
    console.log('Terminal content captured');
    console.log(`Terminal content length: ${wt1TerminalContentBefore?.length} characters`);
    
    // Capture line-by-line content for exact comparison
    const wt1TerminalLinesBefore = await wt1Terminal.evaluate(el => {
      const lines = [];
      const rows = el.querySelectorAll('.xterm-rows > div');
      rows.forEach(row => {
        const text = row.textContent || '';
        lines.push(text);
      });
      return lines;
    });
    
    console.log(`Captured ${wt1TerminalLinesBefore.length} lines`);
    console.log('Last few lines:', wt1TerminalLinesBefore.slice(-5));
    
    // Verify our output is present
    const terminalText = wt1TerminalLinesBefore.join('\n');
    expect(terminalText).toContain('TERMINAL STATE TEST - WT1');
    expect(terminalText).toContain('Line 1: Test Content');
    expect(terminalText).toContain('Line 2: Special chars');
    expect(terminalText).toContain('This command is not executed yet');
    
    // Store the exact content for comparison
    const originalTerminalLines = wt1TerminalLinesBefore;
    const originalTerminalContent = wt1TerminalContentBefore;

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
    
    // Type something different in main terminal
    const mainTerminal = terminalContainers.first();
    await mainTerminal.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('echo "This is the MAIN branch terminal"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    const mainTerminalContent = await mainTerminal.textContent();
    console.log(`Main terminal content preview: ${mainTerminalContent?.substring(0, 100)}...`);
    expect(mainTerminalContent).toContain('This is the MAIN branch terminal');

    // Step 3: Switch back to wt1
    console.log('\n=== STEP 3: SWITCHING BACK TO WT1 ===');
    console.log('Clicking wt1 button to switch back...');
    await wt1Button.click();
    console.log('Waiting for wt1 worktree to load...');
    await page.waitForTimeout(3000);

    // Step 4: Verify terminal content is EXACTLY preserved
    console.log('\n=== STEP 4: VERIFYING EXACT TERMINAL PRESERVATION ===');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt1 (after switch back): ${terminalCount}`);
    expect(terminalCount).toBe(1);
    
    const wt1TerminalAfter = terminalContainers.first();
    
    // Capture the exact content after switching back
    const wt1TerminalContentAfter = await wt1TerminalAfter.textContent();
    console.log(`Terminal content length after switch: ${wt1TerminalContentAfter?.length} characters`);
    
    // Capture line-by-line content after switching back
    const wt1TerminalLinesAfter = await wt1TerminalAfter.evaluate(el => {
      const lines = [];
      const rows = el.querySelectorAll('.xterm-rows > div');
      rows.forEach(row => {
        const text = row.textContent || '';
        lines.push(text);
      });
      return lines;
    });
    
    console.log(`Terminal has ${wt1TerminalLinesAfter.length} lines after switching back`);
    console.log('Last few lines after switch:', wt1TerminalLinesAfter.slice(-5));
    
    // CRITICAL: Verify the content is EXACTLY identical
    console.log('\n=== COMPARING TERMINAL CONTENT ===');
    console.log(`Original content length: ${originalTerminalContent?.length}`);
    console.log(`After switch content length: ${wt1TerminalContentAfter?.length}`);
    console.log(`Original lines count: ${originalTerminalLines.length}`);
    console.log(`After switch lines count: ${wt1TerminalLinesAfter.length}`);
    
    // Check for exact match
    if (originalTerminalContent !== wt1TerminalContentAfter) {
      console.log('\n❌ Terminal CONTENT mismatch detected!');
      // Find first difference
      const minLen = Math.min(originalTerminalContent?.length || 0, wt1TerminalContentAfter?.length || 0);
      for (let i = 0; i < minLen; i++) {
        if (originalTerminalContent?.[i] !== wt1TerminalContentAfter?.[i]) {
          console.log(`First difference at position ${i}:`);
          console.log(`Original: "${originalTerminalContent?.substring(Math.max(0, i-20), i+20)}"`);
          console.log(`After:    "${wt1TerminalContentAfter?.substring(Math.max(0, i-20), i+20)}"`);
          break;
        }
      }
    }
    
    // Compare line by line for better debugging
    let linesMismatch = false;
    for (let i = 0; i < Math.max(originalTerminalLines.length, wt1TerminalLinesAfter.length); i++) {
      if (originalTerminalLines[i] !== wt1TerminalLinesAfter[i]) {
        if (!linesMismatch) {
          console.log(`\n❌ Terminal LINES mismatch detected at line ${i}!`);
          console.log(`Original line ${i}: "${originalTerminalLines[i]}"`);
          console.log(`After line ${i}: "${wt1TerminalLinesAfter[i]}"`);
          linesMismatch = true;
        }
      }
    }
    
    // The terminal content should be EXACTLY identical
    expect(wt1TerminalContentAfter).toBe(originalTerminalContent);
    expect(wt1TerminalLinesAfter).toEqual(originalTerminalLines);
    
    // Verify specific content is still present
    const terminalTextAfter = wt1TerminalLinesAfter.join('\n');
    expect(terminalTextAfter).toContain('TERMINAL STATE TEST - WT1');
    expect(terminalTextAfter).toContain('Line 1: Test Content');
    expect(terminalTextAfter).toContain('Line 2: Special chars');
    expect(terminalTextAfter).toContain('This command is not executed yet');
    
    // Verify it doesn't contain main branch content
    expect(terminalTextAfter).not.toContain('This is the MAIN branch terminal');
    console.log('✓ Verified wt1 terminal does not contain main branch content');
    
    console.log('\n✓✓✓ TEST PASSED: Terminal content is EXACTLY preserved when switching between worktrees ✓✓✓');
    console.log('Summary:');
    console.log('  - Terminal output is byte-for-byte identical after switching');
    console.log('  - Partial commands (not executed) are preserved');
    console.log('  - Special characters and formatting are maintained');
    console.log('  - Terminal states are completely isolated between worktrees');
  });
});