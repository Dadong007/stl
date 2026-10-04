import { stat, writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = 'http://127.0.0.1:4321';
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const externalRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  const url = new URL(request.url());
  if ((url.protocol === 'http:' || url.protocol === 'https:') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    externalRequests.push(request.url());
  }
});

const inspectPage = () => page.evaluate(() => ({
  title: document.title,
  h1Count: document.querySelectorAll('h1').length,
  canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
  description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
  hasContent: document.body.innerText.trim().length > 0,
  hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  schemaTypes: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map((script) => JSON.parse(script.textContent ?? '{}')['@type']),
}));

const inspectSkipLink = async () => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const readState = () => page.locator('.skip-link').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      visibleInViewport: bounds.bottom > 0 && bounds.top < window.innerHeight,
      focusVisible: element.matches(':focus-visible'),
    };
  });
  const normal = await readState();
  await page.keyboard.press('Tab');
  const keyboardFocused = await readState();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  return { normal, keyboardFocused };
};

const downloadDetails = async (button) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button.click(),
  ]);
  const path = await download.path();
  const details = path ? await stat(path) : null;
  return { filename: download.suggestedFilename(), bytes: details?.size ?? 0 };
};

const results = { chromeVersion: '', home: null, image: null, threeMf: null, mobile: null, mobileImage: null, skipLink: null, missingPhaseTwoRoutes: {}, externalRequests, consoleErrors, pageErrors };

try {
  results.chromeVersion = browser.version();

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  results.home = await inspectPage();
  results.skipLink = await inspectSkipLink();
  await page.screenshot({ path: 'test-output/phase-1-home-desktop.png', fullPage: true });

  await page.goto(`${baseUrl}/image-to-stl/`, { waitUntil: 'networkidle' });
  const imageBefore = await inspectPage();
  await page.locator('#image-upload').setInputFiles('test-assets/01-photo-relief.jpg');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const jpgInitialStyle = await page.getByLabel('Style').inputValue();
  const reliefDownload = await downloadDetails(page.getByRole('button', { name: 'Download STL' }));
  await page.screenshot({ path: 'test-output/phase-1-image-desktop.png', fullPage: true });

  await page.locator('#image-upload').setInputFiles('test-assets/04-white-bg-question.png');
  await page.locator('.status-ready').filter({ hasText: '04-white-bg-question.png' }).waitFor({ timeout: 120_000 });
  const solidPngInitialStyle = await page.getByLabel('Style').inputValue();

  await page.locator('#image-upload').setInputFiles('test-assets/02-transparent-silhouette.png');
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const transparentPngInitialStyle = await page.getByLabel('Style').inputValue();
  const extrudeDownload = await downloadDetails(page.getByRole('button', { name: 'Download STL' }));
  await page.getByLabel('Style').selectOption('relief');
  await page.locator('.status-processing').waitFor({ timeout: 30_000 });
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const manualStyleAfterOverride = await page.getByLabel('Style').inputValue();
  results.image = {
    ...imageBefore,
    reliefDownload,
    extrudeDownload,
    preview: true,
    styleDefaults: { jpgInitialStyle, solidPngInitialStyle, transparentPngInitialStyle, manualStyleAfterOverride },
  };

  await page.goto(`${baseUrl}/3mf-to-stl/`, { waitUntil: 'networkidle' });
  const threeMfBefore = await inspectPage();
  await page.locator('#three-mf-upload').setInputFiles('test-assets/generated/multi-object-transformed.3mf');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const threeMfDownload = await downloadDetails(page.getByRole('button', { name: 'Download STL' }));
  await page.screenshot({ path: 'test-output/phase-1-3mf-desktop.png', fullPage: true });
  results.threeMf = { ...threeMfBefore, download: threeMfDownload, preview: true };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-output/phase-1-3mf-mobile.png', fullPage: true });
  results.mobile = await inspectPage();

  await page.goto(`${baseUrl}/image-to-stl/`, { waitUntil: 'networkidle' });
  await page.locator('#image-upload').setInputFiles('test-assets/01-photo-relief.jpg');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const reliefMobilePreview = true;
  const reliefMobileStyle = await page.getByLabel('Style').inputValue();
  await page.locator('#image-upload').setInputFiles('test-assets/02-transparent-silhouette.png');
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const extrudeMobilePreview = true;
  const extrudeMobileStyle = await page.getByLabel('Style').inputValue();
  await page.screenshot({ path: 'test-output/phase-1-image-mobile.png', fullPage: true });
  results.mobileImage = {
    ...await inspectPage(),
    reliefPreview: reliefMobilePreview,
    extrudePreview: extrudeMobilePreview,
    reliefStyle: reliefMobileStyle,
    extrudeStyle: extrudeMobileStyle,
  };

  for (const route of ['/png-to-stl/', '/jpg-to-stl/', '/logo-to-stl/', '/stl-to-3mf/']) {
    const response = await context.request.get(`${baseUrl}${route}`);
    results.missingPhaseTwoRoutes[route] = response.status();
  }

  const failed = pageErrors.length > 0
    || consoleErrors.length > 0
    || externalRequests.length > 0
    || results.skipLink.normal.visibleInViewport
    || !results.skipLink.keyboardFocused.visibleInViewport
    || !results.skipLink.keyboardFocused.focusVisible
    || [results.home, results.image, results.threeMf, results.mobile, results.mobileImage].some((entry) => !entry || !entry.hasContent || entry.h1Count !== 1 || entry.hasOverflow)
    || results.image.reliefDownload.filename !== '01-photo-relief.stl'
    || results.image.extrudeDownload.filename !== '02-transparent-silhouette.stl'
    || results.image.reliefDownload.bytes <= 84
    || results.image.extrudeDownload.bytes <= 84
    || results.image.styleDefaults.jpgInitialStyle !== 'relief'
    || results.image.styleDefaults.solidPngInitialStyle !== 'relief'
    || results.image.styleDefaults.transparentPngInitialStyle !== 'extrude'
    || results.image.styleDefaults.manualStyleAfterOverride !== 'relief'
    || results.mobileImage.reliefStyle !== 'relief'
    || results.mobileImage.extrudeStyle !== 'extrude'
    || results.threeMf.download.filename !== 'multi-object-transformed.stl'
    || results.threeMf.download.bytes <= 84
    || Object.values(results.missingPhaseTwoRoutes).some((status) => status !== 404);

  await writeFile('test-output/phase-1-browser-results.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
