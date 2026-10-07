import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = 'http://127.0.0.1:4321';
const outputDirectory = resolve('test-output/home-universal-hero');
const googleTagScriptUrl = 'https://www.googletagmanager.com/gtag/js?id=G-GKTV9KDNXL';
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
});

async function createPage(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  await context.route(googleTagScriptUrl, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '',
  }));
  const page = await context.newPage();
  return { context, page };
}

async function openHomepage(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('.home-quick-converter[data-state="idle"]').waitFor();
}

async function uploadAndWait(page, file) {
  await page.locator('#home-quick-upload').setInputFiles(file);
  await page.locator('.home-quick-converter[data-state="ready"]').waitFor({ timeout: 90_000 });
  await page.locator('.home-quick-preview canvas').waitFor({ timeout: 30_000 });
  return page.locator('.home-quick-converter').evaluate((element) => ({
    state: element.getAttribute('data-state'),
    kind: element.getAttribute('data-kind'),
    mode: element.getAttribute('data-mode'),
    filename: element.querySelector('.home-quick-file-row strong')?.textContent ?? '',
    downloadDisabled: element.querySelector('.home-quick-download')?.hasAttribute('disabled') ?? true,
  }));
}

async function downloadResult(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download STL' }).click(),
  ]);
  const path = await download.path();
  const details = path ? await stat(path) : null;
  return { filename: download.suggestedFilename(), bytes: details?.size ?? 0 };
}

const results = {
  initial: {},
  jpg: {},
  jpeg: {},
  transparentPng: {},
  opaquePng: {},
  threeMf: {},
  unsupported: {},
  replace: {},
};

for (const [width, height] of [[1440, 900], [1280, 800], [390, 844]]) {
  const { context, page } = await createPage({ width, height });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openHomepage(page);
  const initial = await page.evaluate(() => ({
    title: document.title,
    h1Count: document.querySelectorAll('h1').length,
    h1: document.querySelector('h1')?.textContent?.trim(),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    state: document.querySelector('.home-quick-converter')?.getAttribute('data-state'),
    downloadCount: document.querySelectorAll('.home-quick-download').length,
  }));
  const forbiddenInitialResources = requests.filter((url) => /(?:MeshPreview|threeMf|lib3mf|\/image\.[^/]+\.js|\/stl\.[^/]+\.js|three\.core|\.wasm)/i.test(url));
  assert.equal(initial.h1Count, 1);
  assert.equal(initial.h1, 'Convert Images and 3D Files to STL Online');
  assert.equal(initial.overflow, false);
  assert.equal(initial.state, 'idle');
  assert.equal(initial.downloadCount, 0);
  assert.deepEqual(forbiddenInitialResources, []);
  await page.screenshot({ path: resolve(outputDirectory, `home-${width}x${height}-initial.png`) });
  results.initial[`${width}x${height}`] = { ...initial, forbiddenInitialResources };
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.jpg = await uploadAndWait(page, resolve('test-assets/01-photo-relief.jpg'));
  assert.equal(results.jpg.kind, 'jpg');
  assert.equal(results.jpg.mode, 'relief');
  assert.equal(results.jpg.downloadDisabled, false);
  results.jpg.download = await downloadResult(page);
  assert.ok(results.jpg.download.bytes > 84);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.screenshot({ path: resolve(outputDirectory, 'home-1440x900-jpg-ready.png') });
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  const buffer = await readFile(resolve('test-assets/01-photo-relief.jpg'));
  results.jpeg = await uploadAndWait(page, { name: 'photo-relief.jpeg', mimeType: 'image/jpeg', buffer });
  assert.equal(results.jpeg.kind, 'jpg');
  assert.equal(results.jpeg.mode, 'relief');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.transparentPng = await uploadAndWait(page, resolve('test-assets/02-transparent-silhouette.png'));
  assert.equal(results.transparentPng.kind, 'png');
  assert.equal(results.transparentPng.mode, 'extrude');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.opaquePng = await uploadAndWait(page, resolve('test-assets/04-white-bg-question.png'));
  assert.equal(results.opaquePng.kind, 'png');
  assert.equal(results.opaquePng.mode, 'relief');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.threeMf = await uploadAndWait(page, resolve('test-assets/generated/multi-object-transformed.3mf'));
  assert.equal(results.threeMf.kind, '3mf');
  assert.equal(results.threeMf.mode, '3mf');
  assert.equal(results.threeMf.downloadDisabled, false);
  results.threeMf.download = await downloadResult(page);
  assert.ok(results.threeMf.download.bytes > 84);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.screenshot({ path: resolve(outputDirectory, 'home-1440x900-3mf-ready.png') });
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  await page.locator('#home-quick-upload').setInputFiles({
    name: 'unsupported.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a supported model'),
  });
  await page.locator('.home-quick-converter[data-state="error"]').waitFor();
  results.unsupported = {
    message: await page.getByRole('alert').textContent(),
    downloadCount: await page.locator('.home-quick-download').count(),
  };
  assert.match(results.unsupported.message ?? '', /JPG, PNG, JPEG, or 3MF/);
  assert.equal(results.unsupported.downloadCount, 0);
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  const first = await uploadAndWait(page, resolve('test-assets/01-photo-relief.jpg'));
  const second = await uploadAndWait(page, resolve('test-assets/02-transparent-silhouette.png'));
  results.replace = { first, second };
  assert.equal(first.filename, '01-photo-relief.jpg');
  assert.equal(second.filename, '02-transparent-silhouette.png');
  assert.equal(second.mode, 'extrude');
  await context.close();
}

await browser.close();
await writeFile(resolve(outputDirectory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log('Homepage universal upload tests passed.');
