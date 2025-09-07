import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';

test.describe('Debug Terminal Split Feature Test', () => {
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

  test('should debug terminal split functionality and capture page state', async () => {
    test.setTimeout(120000);

    await page.waitForLoadState('domcontentloaded');

    // Capture console messages
    page.on('console', (msg) => {
      console.log(`BROWSER CONSOLE ${msg.type()}: ${msg.text()}`);
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

    console.log('--- PAGE SCREENSHOT BEFORE SEARCHING FOR SPLIT BUTTON ---');
    await page.screenshot({ path: '/tmp/before_split_search.png', fullPage: true });

    // Debug: Let's see what's on the page
    console.log('--- PAGE CONTENT ---');
    const bodyText = await page.locator('body').textContent();
    console.log('Body text:', bodyText);

    console.log('--- ALL BUTTONS ON PAGE ---');
    const allButtons = await page.locator('button').all();
    for (let i = 0; i < allButtons.length; i++) {
      const button = allButtons[i];
      const text = await button.textContent();
      const title = await button.getAttribute('title');
      const className = await button.getAttribute('class');
      console.log(`Button ${i}: text="${text}", title="${title}", class="${className}"`);
    }

    console.log('--- LOOKING FOR TERMINAL ELEMENTS ---');
    const terminalContainers = await page.locator('.xterm-screen').count();
    console.log(`Found ${terminalContainers} terminal containers`);

    const terminalPanes = await page.locator('[class*="terminal"]').count();
    console.log(`Found ${terminalPanes} elements with 'terminal' in class`);

    // Try different selectors for split button
    console.log('--- TRYING DIFFERENT SPLIT BUTTON SELECTORS ---');
    const splitButtonSelectors = [
      'button[title="Split Terminal"]',
      'button[title*="Split"]',
      'button[aria-label="Split Terminal"]',
      'button:has-text("Split")',
      '[role="button"][title="Split Terminal"]'
    ];

    for (const selector of splitButtonSelectors) {
      const count = await page.locator(selector).count();
      console.log(`Selector "${selector}": found ${count} elements`);
      if (count > 0) {
        const elements = await page.locator(selector).all();
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          const isVisible = await element.isVisible();
          const text = await element.textContent();
          const title = await element.getAttribute('title');
          console.log(`  Element ${i}: visible=${isVisible}, text="${text}", title="${title}"`);
        }
      }
    }

    // Check if we have terminal pane components
    console.log('--- CHECKING TERMINAL PANE STRUCTURE ---');
    const terminalHeaders = await page.locator('h3:has-text("Terminal")').count();
    console.log(`Found ${terminalHeaders} terminal headers`);

    if (terminalHeaders > 0) {
      const headers = await page.locator('h3:has-text("Terminal")').all();
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const text = await header.textContent();
        console.log(`Terminal header ${i}: "${text}"`);
        
        // Look for buttons near this header
        const parentContainer = await header.locator('..').locator('..');
        const buttonsInContainer = await parentContainer.locator('button').count();
        console.log(`  Buttons in container: ${buttonsInContainer}`);
        
        if (buttonsInContainer > 0) {
          const buttons = await parentContainer.locator('button').all();
          for (let j = 0; j < buttons.length; j++) {
            const button = buttons[j];
            const title = await button.getAttribute('title');
            const isVisible = await button.isVisible();
            console.log(`    Button ${j}: title="${title}", visible=${isVisible}`);
          }
        }
      }
    }

    // Take a final screenshot
    console.log('--- FINAL PAGE SCREENSHOT ---');
    await page.screenshot({ path: '/tmp/debug_terminal_page.png', fullPage: true });

    // Let's try the correct selectors
    console.log('--- TRYING CORRECT SPLIT BUTTON SELECTORS ---');
    const correctSelectors = [
      'button[title="Split Vertical"]',
      'button[title="Split Horizontal"]'
    ];

    for (const selector of correctSelectors) {
      const count = await page.locator(selector).count();
      console.log(`Selector "${selector}": found ${count} elements`);
      if (count > 0) {
        const elements = await page.locator(selector).all();
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          const isVisible = await element.isVisible();
          const text = await element.textContent();
          const title = await element.getAttribute('title');
          console.log(`  Element ${i}: visible=${isVisible}, text="${text}", title="${title}"`);
        }
      }
    }

    console.log('--- DEBUG COMPLETE ---');
  });
});