import { writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleMessages = [];
const pageErrors = [];
page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => pageErrors.push(error.message));

const started = performance.now();
await page.goto('http://127.0.0.1:5173/?autorun=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__SPIKE_DONE__ === true, undefined, { timeout: 120_000 });
const results = await page.evaluate(() => window.__SPIKE_RESULTS__);
const statusText = await page.locator('#status').innerText();
await page.screenshot({ path: 'test-output/browser-smoke.png', fullPage: true });
await writeFile('test-output/browser-results.json', `${JSON.stringify({
  wallClockMs: performance.now() - started,
  results,
  statusText,
  consoleMessages,
  pageErrors,
}, null, 2)}\n`);
await browser.close();

if (results?.error || pageErrors.length > 0) {
  console.error(JSON.stringify({ results, pageErrors, consoleMessages }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(results, null, 2));
}
