// Simple test to understand XTerm DOM structure
const { test, expect } = require('@playwright/test');

test.describe('XTerm DOM Analysis', () => {
  test('analyze xterm DOM structure', async ({ page }) => {
    // Create a simple HTML page with XTerm
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .xterm-test-style {
            color: red !important;
          }
        </style>
        <link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
      </head>
      <body>
        <div id="terminal"></div>
        <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
        <script>
          const term = new Terminal();
          term.open(document.getElementById('terminal'));
          term.write('Hello World\\r\\n');
          term.write('This is a test\\r\\n');
          
          // Add some CSS to see if it gets mixed in
          const style = document.createElement('style');
          style.textContent = '.xterm-test-style { background: blue; }';
          document.head.appendChild(style);
        </script>
      </body>
      </html>
    `);

    await page.waitForTimeout(1000);

    // Test different selectors
    const selectors = [
      '.xterm',
      '.xterm-screen', 
      '.xterm-viewport',
      '.xterm-rows',
      '.xterm-helper-textarea'
    ];

    for (const selector of selectors) {
      const element = page.locator(selector);
      const count = await element.count();
      console.log(`Selector '${selector}': ${count} elements found`);
      
      if (count > 0) {
        const textContent = await element.first().textContent();
        const innerHTML = await element.first().innerHTML();
        
        console.log(`  Text content length: ${textContent?.length || 0}`);
        console.log(`  Contains CSS: ${textContent?.includes('color:') || textContent?.includes('background:')}`);
        console.log(`  Text preview: ${textContent?.substring(0, 100)}...`);
        console.log(`  HTML preview: ${innerHTML?.substring(0, 200)}...`);
        console.log('---');
      }
    }

    // Test getting text content via different methods
    const xtermScreen = page.locator('.xterm-screen');
    if (await xtermScreen.count() > 0) {
      const methods = [
        { name: 'textContent', fn: () => xtermScreen.textContent() },
        { name: 'innerText', fn: () => xtermScreen.innerText() },
        { name: 'evaluate textContent', fn: () => page.evaluate(() => document.querySelector('.xterm-screen')?.textContent) },
        { name: 'evaluate innerText', fn: () => page.evaluate(() => document.querySelector('.xterm-screen')?.innerText) }
      ];

      for (const method of methods) {
        try {
          const result = await method.fn();
          console.log(`Method '${method.name}': ${result?.length || 0} chars`);
          console.log(`  Contains CSS: ${result?.includes('color:') || result?.includes('background:')}`);
          console.log(`  Preview: ${result?.substring(0, 100)}...`);
        } catch (error) {
          console.log(`Method '${method.name}': ERROR - ${error.message}`);
        }
        console.log('---');
      }
    }
  });
});