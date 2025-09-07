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
    console.log('\n=== STEP 1: SWITCHING TO WT1 ===');
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
    console.log('Waiting 3 seconds for worktree to load...');
    await page.waitForTimeout(3000);

    // Verify we have 1 terminal in wt1
    console.log('\n--- Checking initial terminal count in wt1 ---');
    let terminalContainers = page.locator('.xterm-screen');
    let terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt1: ${terminalCount}`);
    
    // Log terminal details
    for (let i = 0; i < terminalCount; i++) {
      const terminal = terminalContainers.nth(i);
      const isVisible = await terminal.isVisible();
      const box = await terminal.boundingBox();
      console.log(`  Terminal ${i + 1}: visible=${isVisible}, dimensions=${box?.width}x${box?.height}`);
    }
    
    expect(terminalCount).toBe(1);
    console.log('✓ wt1 has 1 terminal initially');

    // Step 2: Split the terminal in wt1
    console.log('\n=== STEP 2: SPLITTING TERMINAL IN WT1 ===');
    const splitButtons = await page.locator('button[title="Split Terminal"]').all();
    console.log(`Found ${splitButtons.length} split button(s)`);
    
    const splitButton = page.locator('button[title="Split Terminal"]').first();
    const isVisible = await splitButton.isVisible();
    console.log(`Split button visible: ${isVisible}`);
    
    await expect(splitButton).toBeVisible();
    
    console.log('Clicking split button...');
    await splitButton.click();
    console.log('Waiting 2 seconds for split to complete...');
    await page.waitForTimeout(2000);

    // Verify we now have 2 terminals in wt1
    console.log('\n--- Checking terminal count after split ---');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count after split: ${terminalCount}`);
    
    for (let i = 0; i < terminalCount; i++) {
      const terminal = terminalContainers.nth(i);
      const isVisible = await terminal.isVisible();
      const box = await terminal.boundingBox();
      console.log(`  Terminal ${i + 1}: visible=${isVisible}, dimensions=${box?.width}x${box?.height}`);
    }
    
    expect(terminalCount).toBe(2);
    console.log('✓ wt1 now has 2 terminals after split');

    // Type different commands in each terminal to make them distinguishable
    console.log('\n--- Typing commands in terminals ---');
    const firstTerminal = terminalContainers.nth(0);
    console.log('Clicking first terminal...');
    await firstTerminal.click();
    await page.waitForTimeout(500);
    
    console.log('Typing: echo "wt1-terminal-1"');
    await page.keyboard.type('echo "wt1-terminal-1"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Log terminal content after typing
    const content1 = await firstTerminal.textContent();
    console.log(`First terminal content preview: ${content1?.substring(0, 100)}...`);

    const secondTerminal = terminalContainers.nth(1);
    console.log('Clicking second terminal...');
    await secondTerminal.click();
    await page.waitForTimeout(500);
    
    console.log('Typing: echo "wt1-terminal-2"');
    await page.keyboard.type('echo "wt1-terminal-2"');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    
    // Log terminal content after typing
    const content2 = await secondTerminal.textContent();
    console.log(`Second terminal content preview: ${content2?.substring(0, 100)}...`);

    // Step 3: Switch to wt2
    console.log('\n=== STEP 3: SWITCHING TO WT2 ===');
    const wt2Button = page.locator('button[data-worktree-branch="wt2"]');
    const wt2Count = await wt2Button.count();
    console.log(`Found ${wt2Count} wt2 button(s)`);
    
    if (wt2Count === 0) {
      throw new Error('Could not find wt2 worktree button');
    }
    
    console.log('Clicking wt2 button...');
    await wt2Button.click();
    console.log('Waiting 3 seconds for worktree to load...');
    await page.waitForTimeout(3000);

    // Step 4: Verify wt2 only has 1 terminal (not affected by wt1's split)
    console.log('\n--- Checking terminal count in wt2 ---');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt2: ${terminalCount}`);
    
    for (let i = 0; i < terminalCount; i++) {
      const terminal = terminalContainers.nth(i);
      const isVisible = await terminal.isVisible();
      const box = await terminal.boundingBox();
      const content = await terminal.textContent();
      console.log(`  Terminal ${i + 1}: visible=${isVisible}, dimensions=${box?.width}x${box?.height}`);
      console.log(`    Content preview: ${content?.substring(0, 50)}...`);
    }
    
    expect(terminalCount).toBe(1);
    console.log('✓ wt2 has only 1 terminal (isolated from wt1 split)');

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
    console.log('\n=== STEP 5: SWITCHING BACK TO WT1 ===');
    console.log('Clicking wt1 button again...');
    await wt1Button.click();
    console.log('Waiting 3 seconds for worktree to load...');
    await page.waitForTimeout(3000);

    // Verify wt1 still has 2 terminals
    console.log('\n--- Checking terminal count after switching back to wt1 ---');
    terminalContainers = page.locator('.xterm-screen');
    terminalCount = await terminalContainers.count();
    console.log(`Terminal count in wt1 (after switch back): ${terminalCount}`);
    
    for (let i = 0; i < terminalCount; i++) {
      const terminal = terminalContainers.nth(i);
      const isVisible = await terminal.isVisible();
      const box = await terminal.boundingBox();
      console.log(`  Terminal ${i + 1}: visible=${isVisible}, dimensions=${box?.width}x${box?.height}`);
    }
    
    expect(terminalCount).toBe(2);
    console.log('✓ wt1 still has 2 terminals when switching back');

    // The main test objectives have been achieved:
    // 1. wt1 starts with 1 terminal
    // 2. After splitting, wt1 has 2 terminals
    // 3. When switching to wt2, it has only 1 terminal (isolated from wt1's split)
    // 4. When switching back to wt1, it still has 2 terminals
    
    console.log('\n✓✓✓ TEST PASSED: Terminal splits are properly isolated between worktrees ✓✓✓');
    console.log('Summary:');
    console.log('  - Each worktree maintains its own terminal split state');
    console.log('  - Terminal configurations are preserved when switching between worktrees');
    console.log('  - No cross-contamination of terminal states between worktrees');
  });
});