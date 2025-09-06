import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';

test.describe('Terminal Arithmetic Test', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
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
  });

  test('should open terminal window and execute arithmetic', async () => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');

    // Verify the app launches with project selector
    await expect(page.locator('h2', { hasText: 'Select a Project' })).toBeVisible({ timeout: 10000 });

    // Click the "Open Project Folder" button
    const openButton = page.locator('button', { hasText: 'Open Project Folder' });
    await expect(openButton).toBeVisible();

    // Mock the dialog to return the current repository path
    const currentRepoPath = path.resolve(__dirname, '../../..');

    // Mock the Electron dialog to return our test repository path
    await electronApp.evaluate(async ({ dialog }, repoPath) => {
      dialog.showOpenDialog = async () => {
        return {
          canceled: false,
          filePaths: [repoPath]
        };
      };
    }, currentRepoPath);

    // Click the open button which will trigger the mocked dialog
    await openButton.click();

    // Wait for worktree list to appear
    await page.waitForTimeout(3000);

    // Try to find and click on the refs/heads/main worktree button
    const mainWorktreeButton = page.locator('button').filter({ hasText: 'refs/heads/main' });
    let worktreeButton = mainWorktreeButton;

    // If main branch not found, try other branches
    if (await mainWorktreeButton.count() === 0) {
      const anyWorktreeButton = page.locator('button').filter({ hasText: /refs\/heads\// });
      if (await anyWorktreeButton.count() > 0) {
        worktreeButton = anyWorktreeButton.first();
      }
    }

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

    // Type the arithmetic command
    const command = 'echo $[101+202]';
    await page.keyboard.type(command);

    // Press Enter to execute
    await page.keyboard.press('Enter');

    // Wait for the output to appear
    await page.waitForTimeout(2000);

    // Verify the output "303" appears in the terminal
    const terminalContent = await page.locator('.xterm-screen').textContent();
    expect(terminalContent).toContain('303');
  });
});
