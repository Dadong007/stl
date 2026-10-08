import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import sharp from 'sharp';

const baseUrl = 'http://127.0.0.1:4321';
const outputDirectory = resolve('test-output/home-universal-hero');
const googleTagScriptUrl = 'https://www.googletagmanager.com/gtag/js?id=G-GKTV9KDNXL';
const expectedToolLinks = [
  '/image-to-stl/',
  '/png-to-stl/',
  '/3mf-to-stl/',
  '/logo-to-stl/',
  '/jpg-to-stl/',
  '/stl-to-3mf/',
];
await mkdir(outputDirectory, { recursive: true });
const wideJpgBuffer = await sharp(resolve('test-assets/01-photo-relief.jpg'))
  .resize(1200, 240, { fit: 'fill' })
  .jpeg({ quality: 88 })
  .toBuffer();

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
});

async function createPage(viewport = { width: 1440, height: 900 }, deviceScaleFactor = 1) {
  const context = await browser.newContext({ acceptDownloads: true, viewport, deviceScaleFactor });
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

async function inspectQuickMode(page) {
  return page.locator('.home-quick-converter').evaluate((element) => {
    const preview = element.querySelector('.home-quick-preview')?.getBoundingClientRect();
    const filename = element.querySelector('.home-quick-file-row strong');
    return {
      state: element.getAttribute('data-state'),
      kind: element.getAttribute('data-kind'),
      mode: element.getAttribute('data-mode'),
      settingsOpen: element.getAttribute('data-settings-open'),
      filename: filename?.textContent ?? '',
      filenameTitle: filename?.getAttribute('title') ?? '',
      summary: element.querySelector('.home-quick-summary-row strong')?.textContent ?? '',
      status: element.querySelector('.home-quick-status')?.textContent?.trim() ?? '',
      downloadDisabled: element.querySelector('.home-quick-download')?.hasAttribute('disabled') ?? true,
      adjustCount: element.querySelectorAll('.home-quick-adjust').length,
      settingsCount: element.querySelectorAll('.home-quick-settings').length,
      heroActive: element.closest('.home-hero')?.classList.contains('is-quick-active') ?? false,
      heroCopyDisplay: getComputedStyle(element.closest('.home-hero')?.querySelector('.home-hero-copy-block')).display,
      previewWidth: Math.round(preview?.width ?? 0),
      previewHeight: Math.round(preview?.height ?? 0),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

async function uploadAndWait(page, file) {
  await page.locator('#home-quick-upload').setInputFiles(file);
  await page.locator('.home-quick-converter[data-state="ready"]').waitFor({ timeout: 120_000 });
  await page.locator('.home-quick-preview canvas').waitFor({ timeout: 30_000 });
  return inspectQuickMode(page);
}

async function changeAndWait(page, action) {
  await action();
  await page.locator('.home-quick-converter[data-state="processing"]').waitFor({ timeout: 10_000 });
  await page.locator('.home-quick-converter[data-state="ready"]').waitFor({ timeout: 120_000 });
  await page.locator('.home-quick-preview canvas').waitFor({ timeout: 30_000 });
  return inspectQuickMode(page);
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

async function inspectPreviewFraming(page) {
  const preview = page.locator('.home-quick-preview');
  const screenshot = await preview.screenshot();
  const layout = await preview.evaluate((shell) => {
    const canvas = shell.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const shellBounds = shell.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    return {
      shellCssWidth: Math.round(shellBounds.width),
      shellCssHeight: Math.round(shellBounds.height),
      canvasCssWidth: Math.round(canvasBounds.width),
      canvasCssHeight: Math.round(canvasBounds.height),
      canvasBufferWidth: canvas.width,
      canvasBufferHeight: canvas.height,
      canvasContained: canvasBounds.width <= shellBounds.width + 1
        && canvasBounds.height <= shellBounds.height + 1,
      shellOverflow: shell.scrollWidth > shell.clientWidth + 1
        || shell.scrollHeight > shell.clientHeight + 1,
    };
  });
  assert.ok(layout, 'Expected a rendered canvas inside the visible preview shell.');
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let pixelCount = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const modelPixel = green - red >= 18 && green - blue >= 5 && red < 205;
      if (!modelPixel) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixelCount += 1;
    }
  }

  assert.ok(pixelCount > 100, 'Expected rendered model pixels in the homepage preview.');
  const modelWidth = maxX - minX + 1;
  const modelHeight = maxY - minY + 1;
  return {
    canvasWidth: info.width,
    canvasHeight: info.height,
    bounds: { minX, minY, maxX, maxY },
    margins: {
      left: minX,
      top: minY,
      right: info.width - 1 - maxX,
      bottom: info.height - 1 - maxY,
    },
    usage: {
      width: Number((modelWidth / info.width).toFixed(3)),
      height: Number((modelHeight / info.height).toFixed(3)),
    },
    centerOffset: {
      x: Number((Math.abs((minX + maxX) / 2 - info.width / 2) / info.width).toFixed(3)),
      y: Number((Math.abs((minY + maxY) / 2 - info.height / 2) / info.height).toFixed(3)),
    },
    layout,
  };
}

function assertFullyFramed(framing, label) {
  assert.equal(framing.layout.canvasContained, true, `${label} canvas should fit the visible preview shell.`);
  assert.equal(framing.layout.shellOverflow, false, `${label} preview shell should not overflow.`);
  assert.ok(
    Math.min(...Object.values(framing.margins)) >= 3,
    `${label} should retain visible padding on every side: ${JSON.stringify(framing)}`,
  );
  assert.ok(framing.centerOffset.x <= 0.12, `${label} should remain horizontally centered.`);
  assert.ok(framing.centerOffset.y <= 0.12, `${label} should remain vertically centered.`);
}

const results = {
  initial: {},
  jpg: {},
  jpeg: {},
  wideJpg: {},
  settings: {},
  transparentPng: {},
  opaquePng: {},
  threeMf: {},
  replacement: {},
  errors: {},
  mobile: {},
  resize: {},
};

for (const [width, height] of [[1440, 900], [1366, 768], [1280, 800], [1280, 720]]) {
  const { context, page } = await createPage({ width, height });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openHomepage(page);
  const initial = await page.evaluate((toolLinks) => {
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent || '{}'));
    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
      h1Count: document.querySelectorAll('h1').length,
      h1: document.querySelector('h1')?.textContent?.trim(),
      schemaTypes: schemas.map((schema) => schema['@type']),
      toolLinks: [...document.querySelectorAll('.tool-title-link')].map((link) => link.getAttribute('href')),
      expectedToolLinks: toolLinks,
      trustText: document.querySelector('.hero-benefits')?.textContent?.replace(/\s+/g, ' ').trim(),
      trustLabelCount: document.querySelectorAll('.hero-benefits > span').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      state: document.querySelector('.home-quick-converter')?.getAttribute('data-state'),
      downloadCount: document.querySelectorAll('.home-quick-download').length,
      uploadAccept: document.querySelector('#home-quick-upload')?.getAttribute('accept'),
    };
  }, expectedToolLinks);
  const forbiddenInitialResources = requests.filter((url) => /(?:MeshPreview|threeMf|lib3mf|\/image\.[^/]+\.js|\/stl\.[^/]+\.js|three\.core|\.wasm)/i.test(url));
  assert.equal(initial.title, 'IntoSTL — Free STL & 3D Printing Tools');
  assert.equal(initial.description, 'Free browser-based tools for converting images and 3D files to STL or 3MF. No sign-up and no uploads — your files stay on your device.');
  assert.equal(initial.canonical, 'https://intostl.com/');
  assert.equal(initial.robots, 'index, follow');
  assert.equal(initial.h1Count, 1);
  assert.equal(initial.h1, 'Convert Images and 3D Files to STL Online');
  assert.deepEqual(initial.schemaTypes, ['WebSite']);
  assert.deepEqual(initial.toolLinks, initial.expectedToolLinks);
  assert.equal(initial.trustText, 'No sign-up · Files stay on your device');
  assert.equal(initial.trustLabelCount, 1);
  assert.equal(initial.overflow, false);
  assert.equal(initial.state, 'idle');
  assert.equal(initial.downloadCount, 0);
  assert.equal(initial.uploadAccept, null);
  assert.deepEqual(forbiddenInitialResources, []);
  if (width === 1440) {
    await page.screenshot({ path: resolve(outputDirectory, 'home-1440x900-idle.png') });
  }
  results.initial[`${width}x${height}`] = { ...initial, forbiddenInitialResources };
  await context.close();
}

{
  const { context, page } = await createPage({ width: 1440, height: 900 }, 3);
  await openHomepage(page);
  results.jpg = await uploadAndWait(page, resolve('test-assets/01-photo-relief.jpg'));
  assert.equal(results.jpg.kind, 'jpg');
  assert.equal(results.jpg.mode, 'relief');
  assert.equal(results.jpg.summary, 'Relief · 3 mm · 100 mm');
  assert.equal(results.jpg.status, 'Your STL is ready.');
  assert.equal(results.jpg.downloadDisabled, false);
  assert.equal(results.jpg.adjustCount, 1);
  assert.equal(results.jpg.settingsCount, 0);
  assert.equal(results.jpg.heroActive, true);
  assert.equal(results.jpg.heroCopyDisplay, 'none');
  assert.ok(results.jpg.previewWidth >= 900);
  assert.ok(results.jpg.previewHeight >= 350);
  results.jpg.framing = await inspectPreviewFraming(page);
  assertFullyFramed(results.jpg.framing, 'Normal JPG relief');
  results.jpg.download = await downloadResult(page);
  assert.ok(results.jpg.download.bytes > 84);
  await page.screenshot({ path: resolve(outputDirectory, 'home-1440x900-jpg-ready.png') });

  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.locator('.home-quick-settings').waitFor();
  const defaultSettings = await page.locator('.home-quick-settings').evaluate((settings) => ({
    style: settings.querySelector('input[name="home-quick-style"]:checked')?.value,
    depth: settings.querySelectorAll('input[type="number"]')[0]?.value,
    size: settings.querySelectorAll('input[type="number"]')[1]?.value,
  }));
  const styleGroup = page.getByRole('group', { name: 'Style' });
  const reliefRadio = page.getByRole('radio', { name: 'Relief' });
  const extrudeRadio = page.getByRole('radio', { name: 'Extrude' });
  assert.deepEqual(defaultSettings, { style: 'relief', depth: '3', size: '100' });
  assert.equal(await styleGroup.count(), 1);
  assert.equal(await styleGroup.getByRole('radio').count(), 2);
  assert.equal(await page.locator('.home-quick-settings select').count(), 0);
  assert.equal(await reliefRadio.isChecked(), true);
  assert.equal(await extrudeRadio.isChecked(), false);
  assert.equal(await page.getByRole('button', { name: 'Adjust' }).count(), 0);
  await page.screenshot({ path: resolve(outputDirectory, 'home-1440x900-jpg-settings-expanded.png') });

  await reliefRadio.focus();
  assert.equal(await reliefRadio.evaluate((element) => document.activeElement === element), true);
  const preview = page.locator('.home-quick-preview canvas');
  const beforeOrbit = await preview.screenshot();
  const previewBox = await preview.boundingBox();
  assert.ok(previewBox);
  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(previewBox.x + previewBox.width / 2 + 70, previewBox.y + previewBox.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  const afterOrbit = await preview.screenshot();
  assert.equal(beforeOrbit.equals(afterOrbit), false, 'OrbitControls should rotate the homepage preview.');

  results.settings.extrude = await changeAndWait(page, () => extrudeRadio.click());
  assert.equal(results.settings.extrude.mode, 'extrude');
  assert.equal(results.settings.extrude.summary, 'Extrude · 3 mm · 100 mm');
  assert.equal(await extrudeRadio.isChecked(), true);
  results.settings.relief = await changeAndWait(page, () => reliefRadio.click());
  assert.equal(results.settings.relief.mode, 'relief');
  assert.equal(results.settings.relief.summary, 'Relief · 3 mm · 100 mm');
  assert.equal(await reliefRadio.isChecked(), true);

  const depthInput = page.locator('.home-quick-settings input[type="number"]').nth(0);
  const sizeInput = page.locator('.home-quick-settings input[type="number"]').nth(1);
  results.settings.depth = await changeAndWait(page, () => depthInput.fill('4'));
  assert.equal(results.settings.depth.summary, 'Relief · 4 mm · 100 mm');
  results.settings.size = await changeAndWait(page, () => sizeInput.fill('120'));
  assert.equal(results.settings.size.summary, 'Relief · 4 mm · 120 mm');

  await depthInput.fill('');
  await page.locator('.home-quick-converter[data-state="error"]').waitFor();
  results.settings.invalid = await inspectQuickMode(page);
  assert.match(results.settings.invalid.status, /depth from 0.5 to 50 mm/);
  assert.equal(results.settings.invalid.downloadDisabled, true);
  assert.equal(await page.locator('.home-quick-preview canvas').count(), 0);
  results.settings.restored = await changeAndWait(page, () => depthInput.fill('4'));
  assert.equal(results.settings.restored.downloadDisabled, false);
  await page.getByRole('button', { name: 'Done' }).click();
  assert.equal(await page.locator('.home-quick-settings').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Adjust' }).count(), 1);
  await context.close();
}

{
  const { context, page } = await createPage({ width: 1440, height: 900 }, 3);
  await openHomepage(page);
  results.wideJpg = await uploadAndWait(page, {
    name: 'wide-flat-relief.jpg',
    mimeType: 'image/jpeg',
    buffer: wideJpgBuffer,
  });
  assert.equal(results.wideJpg.mode, 'relief');
  results.wideJpg.framing = await inspectPreviewFraming(page);
  assertFullyFramed(results.wideJpg.framing, 'Wide JPG relief');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const shell = document.querySelector('.home-quick-preview');
    const canvas = shell?.querySelector('canvas');
    if (!(shell instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return false;
    const shellBounds = shell.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    return Math.abs(shellBounds.width - 336) <= 1
      && Math.abs(shellBounds.height - 320) <= 1
      && Math.abs(canvasBounds.width - shellBounds.width) <= 1
      && Math.abs(canvasBounds.height - shellBounds.height) <= 1;
  });
  results.resize.wideDesktopToMobile = await inspectPreviewFraming(page);
  assertFullyFramed(results.resize.wideDesktopToMobile, 'Wide JPG after desktop-to-mobile resize');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  const buffer = await readFile(resolve('test-assets/01-photo-relief.jpg'));
  results.jpeg = await uploadAndWait(page, { name: 'photo-relief.jpeg', mimeType: 'image/jpeg', buffer });
  assert.equal(results.jpeg.kind, 'jpg');
  assert.equal(results.jpeg.mode, 'relief');
  assert.equal(results.jpeg.summary, 'Relief · 3 mm · 100 mm');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.transparentPng = await uploadAndWait(page, resolve('test-assets/02-transparent-silhouette.png'));
  assert.equal(results.transparentPng.kind, 'png');
  assert.equal(results.transparentPng.mode, 'extrude');
  assert.equal(results.transparentPng.summary, 'Extrude · 3 mm · 100 mm');
  results.transparentPng.framing = await inspectPreviewFraming(page);
  assertFullyFramed(results.transparentPng.framing, 'Transparent PNG extrusion');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.opaquePng = await uploadAndWait(page, resolve('test-assets/04-white-bg-question.png'));
  assert.equal(results.opaquePng.kind, 'png');
  assert.equal(results.opaquePng.mode, 'relief');
  assert.equal(results.opaquePng.summary, 'Relief · 3 mm · 100 mm');
  results.opaquePng.framing = await inspectPreviewFraming(page);
  assertFullyFramed(results.opaquePng.framing, 'Opaque PNG relief');
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  results.threeMf = await uploadAndWait(page, resolve('test-assets/generated/multi-object-transformed.3mf'));
  assert.equal(results.threeMf.kind, '3mf');
  assert.equal(results.threeMf.mode, '3mf');
  assert.equal(results.threeMf.summary, '3MF → STL');
  assert.equal(results.threeMf.adjustCount, 0);
  assert.equal(results.threeMf.settingsCount, 0);
  assert.equal(results.threeMf.downloadDisabled, false);
  results.threeMf.framing = await inspectPreviewFraming(page);
  assertFullyFramed(results.threeMf.framing, 'Multi-object 3MF');
  results.threeMf.download = await downloadResult(page);
  assert.ok(results.threeMf.download.bytes > 84);
  await page.screenshot({ path: resolve(outputDirectory, 'home-1440x900-3mf-ready.png') });
  await context.close();
}

{
  const { context, page } = await createPage({ width: 1280, height: 800 });
  await openHomepage(page);
  const ready = await uploadAndWait(page, resolve('test-assets/01-photo-relief.jpg'));
  assert.equal(ready.overflow, false);
  assert.ok(ready.previewWidth >= 900);
  await page.screenshot({ path: resolve(outputDirectory, 'home-1280x800-jpg-ready.png') });
  await context.close();
}

{
  const { context, page } = await createPage();
  await openHomepage(page);
  const first = await uploadAndWait(page, resolve('test-assets/01-photo-relief.jpg'));
  const pngBuffer = await readFile(resolve('test-assets/02-transparent-silhouette.png'));
  const longName = `${'transparent-logo-'.repeat(10)}final.png`;
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose another file' }).click(),
  ]);
  await chooser.setFiles({ name: longName, mimeType: 'image/png', buffer: pngBuffer });
  await page.locator('.home-quick-converter[data-state="processing"]').waitFor();
  const cleared = await page.locator('.home-quick-converter').evaluate((element) => ({
    canvasCount: element.querySelectorAll('canvas').length,
    downloadDisabled: element.querySelector('.home-quick-download')?.hasAttribute('disabled'),
  }));
  assert.deepEqual(cleared, { canvasCount: 0, downloadDisabled: true });
  await page.locator('.home-quick-converter[data-state="ready"]').waitFor({ timeout: 120_000 });
  const second = await inspectQuickMode(page);
  const replacementFraming = await inspectPreviewFraming(page);
  assertFullyFramed(replacementFraming, 'Replacement PNG extrusion');
  const fileRow = await page.locator('.home-quick-file-row').evaluate((row) => {
    const name = row.querySelector('strong')?.getBoundingClientRect();
    const button = row.querySelector('button')?.getBoundingClientRect();
    return { overlap: Boolean(name && button && name.right > button.left), overflow: row.scrollWidth > row.clientWidth };
  });
  assert.equal(first.filename, '01-photo-relief.jpg');
  assert.equal(second.filename, longName);
  assert.equal(second.filenameTitle, longName);
  assert.equal(second.mode, 'extrude');
  assert.deepEqual(fileRow, { overlap: false, overflow: false });
  results.replacement = { first, cleared, second, fileRow, framing: replacementFraming };
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
  results.errors.unsupported = await inspectQuickMode(page);
  assert.match(results.errors.unsupported.status, /JPG, PNG, JPEG, or 3MF/);
  assert.equal(await page.getByRole('button', { name: 'Choose another file' }).count(), 1);

  await page.locator('#home-quick-upload').setInputFiles({
    name: 'corrupt-image.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not a valid jpeg'),
  });
  await page.locator('.home-quick-converter[data-state="error"]').waitFor();
  results.errors.corrupt = await inspectQuickMode(page);
  assert.match(results.errors.corrupt.status, /could not read this image/i);

  await page.locator('#home-quick-upload').setInputFiles({
    name: 'oversized-image.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await page.locator('.home-quick-converter[data-state="error"]').waitFor();
  results.errors.oversized = await inspectQuickMode(page);
  assert.match(results.errors.oversized.status, /larger than 20 MB/);
  assert.equal(results.errors.oversized.downloadDisabled, true);
  await context.close();
}

const mobileFixtures = [
  {
    key: 'normal-jpg',
    file: resolve('test-assets/01-photo-relief.jpg'),
    kind: 'jpg',
    mode: 'relief',
    hasAdjust: true,
  },
  {
    key: 'wide-jpg',
    file: { name: 'wide-5x1-relief.jpg', mimeType: 'image/jpeg', buffer: wideJpgBuffer },
    kind: 'jpg',
    mode: 'relief',
    hasAdjust: true,
  },
  {
    key: 'opaque-png',
    file: resolve('test-assets/04-white-bg-question.png'),
    kind: 'png',
    mode: 'relief',
    hasAdjust: true,
  },
  {
    key: 'transparent-png',
    file: resolve('test-assets/02-transparent-silhouette.png'),
    kind: 'png',
    mode: 'extrude',
    hasAdjust: true,
  },
  {
    key: 'multi-object-3mf',
    file: resolve('test-assets/generated/multi-object-transformed.3mf'),
    kind: '3mf',
    mode: '3mf',
    hasAdjust: false,
  },
];

for (const [width, height] of [[390, 844], [430, 932]]) {
  const { context, page } = await createPage({ width, height }, 3);
  for (const fixture of mobileFixtures) {
    await openHomepage(page);
    const ready = await uploadAndWait(page, fixture.file);
    const framing = await inspectPreviewFraming(page);
    assertFullyFramed(framing, `${fixture.key} at ${width}x${height}`);
    const controls = await page.evaluate(() => {
      const reachable = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        replaceReachable: reachable('.home-quick-replace'),
        adjustReachable: reachable('.home-quick-adjust'),
        downloadReachable: reachable('.home-quick-download'),
      };
    });
    assert.equal(ready.kind, fixture.kind);
    assert.equal(ready.mode, fixture.mode);
    assert.equal(controls.overflow, false);
    assert.equal(controls.replaceReachable, true);
    assert.equal(controls.downloadReachable, true);
    assert.equal(controls.adjustReachable, fixture.hasAdjust);
    results.mobile[`${width}x${height}-${fixture.key}`] = { ready, controls, framing };
  }
  await context.close();
}

await browser.close();
await writeFile(resolve(outputDirectory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log('Homepage Quick Converter UX tests passed.');
