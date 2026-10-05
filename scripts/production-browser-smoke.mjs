import { readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = 'http://127.0.0.1:4321';
const publicRoutes = ['/', '/image-to-stl/', '/png-to-stl/', '/3mf-to-stl/', '/logo-to-stl/', '/jpg-to-stl/', '/stl-to-3mf/', '/about/', '/privacy/', '/contact/'];
const newRoutes = ['/png-to-stl/', '/jpg-to-stl/', '/logo-to-stl/', '/stl-to-3mf/'];
const trustRoutes = ['/about/', '/privacy/', '/contact/'];
const expectedFooterRoutes = ['/image-to-stl/', '/png-to-stl/', '/jpg-to-stl/', '/logo-to-stl/', '/3mf-to-stl/', '/stl-to-3mf/', '/about/', '/privacy/', '/contact/'];
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
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
  brandLogoLoaded: document.querySelector('.brand-logo')?.complete && document.querySelector('.brand-logo')?.naturalWidth > 0,
  footerLogoLoaded: document.querySelector('.footer-logo')?.complete && document.querySelector('.footer-logo')?.naturalWidth > 0,
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

const downloadArtifact = async (button) => {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const path = await download.path();
  const details = path ? await stat(path) : null;
  return {
    filename: download.suggestedFilename(),
    bytes: details?.size ?? 0,
    buffer: path ? await readFile(path) : Buffer.alloc(0),
  };
};

const publicDownload = ({ filename, bytes }) => ({ filename, bytes });

const uploadImage = async (asset, expectedStyle) => {
  const filename = asset.split('/').at(-1);
  await page.locator('#image-upload').setInputFiles(asset);
  await page.locator('.status-ready').filter({ hasText: filename }).waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const style = await page.getByLabel('Style').inputValue();
  const download = await downloadArtifact(page.getByRole('button', { name: 'Download STL' }));
  return { expectedStyle, style, download: publicDownload(download), preview: true };
};

const uploadStl = async (asset) => {
  const filename = asset.split('/').at(-1);
  await page.locator('#stl-upload').setInputFiles(asset);
  await page.locator('.status-ready').filter({ hasText: filename }).waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const download = await downloadArtifact(page.getByRole('button', { name: 'Download 3MF' }));
  return { download, preview: true };
};

const reparseThreeMf = async (artifact) => {
  await page.goto(`${baseUrl}/3mf-to-stl/`, { waitUntil: 'networkidle' });
  await page.locator('#three-mf-upload').setInputFiles({
    name: artifact.filename,
    mimeType: 'model/3mf',
    buffer: artifact.buffer,
  });
  await page.locator('.status-ready').filter({ hasText: artifact.filename }).waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  return { ready: true, preview: true };
};

const results = {
  chromeVersion: '', pages: {}, sitemapRoutes: [], skipLink: null, image: null, threeMf: null,
  png: null, jpg: null, logo: null, stlToThreeMf: null, mobile: {}, trustMobile: {}, contact: null,
  footerRoutes: [], brand: null, brandAssets: {}, externalRequests, consoleErrors, pageErrors,
};

try {
  results.chromeVersion = browser.version();

  for (const route of publicRoutes) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    results.pages[route] = { status: response?.status() ?? 0, ...await inspectPage() };
  }

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  results.skipLink = await inspectSkipLink();
  results.footerRoutes = await page.locator('.footer-nav a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  results.brand = await page.evaluate(() => ({
    iconLinks: Array.from(document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')).map((link) => link.getAttribute('href')),
    trustIconCount: document.querySelectorAll('.trust-icon svg').length,
  }));
  await page.screenshot({ path: 'test-output/phase-2-home-desktop.png', fullPage: true });

  for (const asset of ['/logo.svg', '/favicon.svg', '/favicon-32x32.png', '/apple-touch-icon.png']) {
    const response = await context.request.get(`${baseUrl}${asset}`);
    results.brandAssets[asset] = {
      status: response.status(),
      contentType: response.headers()['content-type'] ?? null,
      bytes: (await response.body()).length,
    };
  }

  await page.goto(`${baseUrl}/contact/`, { waitUntil: 'networkidle' });
  results.contact = await page.locator('.contact-form').evaluate((form) => ({
    hasAction: form.hasAttribute('action'),
    hasMethod: form.hasAttribute('method'),
    fields: Array.from(form.querySelectorAll('select, input, textarea')).map((field) => ({
      id: field.id,
      name: field.getAttribute('name'),
      label: form.querySelector(`label[for="${field.id}"]`)?.textContent?.trim() ?? null,
    })),
    fileInputCount: form.querySelectorAll('input[type="file"]').length,
    submitDisabled: form.querySelector('button[type="submit"]')?.disabled ?? false,
  }));

  const sitemapIndex = await context.request.get(`${baseUrl}/sitemap-index.xml`);
  const sitemapIndexText = await sitemapIndex.text();
  const sitemapPath = sitemapIndexText.match(/<loc>https:\/\/intostl\.com\/(sitemap-[^<]+)<\/loc>/)?.[1];
  if (sitemapPath) {
    const sitemap = await context.request.get(`${baseUrl}/${sitemapPath}`);
    const sitemapText = await sitemap.text();
    results.sitemapRoutes = [...sitemapText.matchAll(/<loc>https:\/\/intostl\.com([^<]*)<\/loc>/g)].map((match) => match[1] || '/').sort();
  }

  await page.goto(`${baseUrl}/image-to-stl/`, { waitUntil: 'networkidle' });
  const imageJpg = await uploadImage('test-assets/01-photo-relief.jpg', 'relief');
  await page.locator('#image-upload').setInputFiles('test-assets/04-white-bg-question.png');
  await page.locator('.status-ready').filter({ hasText: '04-white-bg-question.png' }).waitFor({ timeout: 120_000 });
  const solidPngInitialStyle = await page.getByLabel('Style').inputValue();
  await page.locator('#image-upload').setInputFiles('test-assets/02-transparent-silhouette.png');
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const transparentPngInitialStyle = await page.getByLabel('Style').inputValue();
  await page.getByLabel('Style').selectOption('relief');
  await page.locator('.status-processing').waitFor({ timeout: 30_000 });
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const manualStyleAfterOverride = await page.getByLabel('Style').inputValue();
  results.image = { imageJpg, solidPngInitialStyle, transparentPngInitialStyle, manualStyleAfterOverride };

  await page.goto(`${baseUrl}/3mf-to-stl/`, { waitUntil: 'networkidle' });
  await page.locator('#three-mf-upload').setInputFiles('test-assets/generated/multi-object-transformed.3mf');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  results.threeMf = { download: publicDownload(await downloadArtifact(page.getByRole('button', { name: 'Download STL' }))), preview: true };

  await page.goto(`${baseUrl}/png-to-stl/`, { waitUntil: 'networkidle' });
  const pngOpaque = await uploadImage('test-assets/04-white-bg-question.png', 'relief');
  const pngTransparent = await uploadImage('test-assets/02-transparent-silhouette.png', 'extrude');
  results.png = { opaque: pngOpaque, transparent: pngTransparent };

  await page.goto(`${baseUrl}/jpg-to-stl/`, { waitUntil: 'networkidle' });
  results.jpg = await uploadImage('test-assets/01-photo-relief.jpg', 'relief');

  await page.goto(`${baseUrl}/logo-to-stl/`, { waitUntil: 'networkidle' });
  results.logo = await uploadImage('test-assets/02-transparent-silhouette.png', 'extrude');

  await page.goto(`${baseUrl}/stl-to-3mf/`, { waitUntil: 'networkidle' });
  const binary = await uploadStl('test-assets/generated/binary-cube.stl');
  const binaryReparse = await reparseThreeMf(binary.download);
  await page.goto(`${baseUrl}/stl-to-3mf/`, { waitUntil: 'networkidle' });
  const ascii = await uploadStl('test-assets/generated/ascii-cube.stl');
  const asciiReparse = await reparseThreeMf(ascii.download);
  await page.goto(`${baseUrl}/stl-to-3mf/`, { waitUntil: 'networkidle' });
  const disconnected = await uploadStl('test-assets/generated/disconnected-cubes.stl');
  results.stlToThreeMf = {
    binary: { ...binary, download: publicDownload(binary.download), reparse: binaryReparse },
    ascii: { ...ascii, download: publicDownload(ascii.download), reparse: asciiReparse },
    disconnected: { ...disconnected, download: publicDownload(disconnected.download) },
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFixtures = {
    '/png-to-stl/': 'test-assets/02-transparent-silhouette.png',
    '/jpg-to-stl/': 'test-assets/01-photo-relief.jpg',
    '/logo-to-stl/': 'test-assets/02-transparent-silhouette.png',
    '/stl-to-3mf/': 'test-assets/generated/binary-cube.stl',
  };
  for (const route of newRoutes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    const upload = page.locator(route === '/stl-to-3mf/' ? '#stl-upload' : '#image-upload');
    await upload.setInputFiles(mobileFixtures[route]);
    await page.locator('.status-ready').waitFor({ timeout: 120_000 });
    await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
    results.mobile[route] = {
      ...await inspectPage(),
      preview: true,
      downloadEnabled: await page.getByRole('button', { name: route === '/stl-to-3mf/' ? 'Download 3MF' : 'Download STL' }).isEnabled(),
    };
  }
  for (const route of trustRoutes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    results.trustMobile[route] = await inspectPage();
  }
  await page.screenshot({ path: 'test-output/phase-2-stl-to-3mf-mobile.png', fullPage: true });

  const pageEntries = Object.values(results.pages);
  const expectedSitemapRoutes = [...publicRoutes].sort();
  const imageDownloads = [results.image.imageJpg.download, results.png.opaque.download, results.png.transparent.download, results.jpg.download, results.logo.download];
  const threeMfDownloads = [results.stlToThreeMf.binary.download, results.stlToThreeMf.ascii.download, results.stlToThreeMf.disconnected.download];
  const failed = pageErrors.length > 0
    || consoleErrors.length > 0
    || externalRequests.length > 0
    || results.skipLink.normal.visibleInViewport
    || !results.skipLink.keyboardFocused.visibleInViewport
    || !results.skipLink.keyboardFocused.focusVisible
    || pageEntries.some((entry) => entry.status !== 200 || !entry.hasContent || entry.h1Count !== 1 || entry.hasOverflow || !entry.description || !entry.canonical || !entry.brandLogoLoaded || !entry.footerLogoLoaded)
    || newRoutes.some((route) => !['WebApplication', 'BreadcrumbList', 'FAQPage'].every((type) => results.pages[route].schemaTypes.includes(type)))
    || trustRoutes.some((route) => !results.pages[route].schemaTypes.includes('BreadcrumbList'))
    || JSON.stringify(results.sitemapRoutes) !== JSON.stringify(expectedSitemapRoutes)
    || JSON.stringify(results.footerRoutes) !== JSON.stringify(expectedFooterRoutes)
    || JSON.stringify(results.brand.iconLinks) !== JSON.stringify(['/favicon.svg', '/favicon-32x32.png', '/apple-touch-icon.png'])
    || results.brand.trustIconCount !== 3
    || Object.values(results.brandAssets).some((asset) => asset.status !== 200 || !asset.contentType?.startsWith('image/') || asset.bytes <= 0)
    || results.contact.hasAction
    || results.contact.hasMethod
    || results.contact.fileInputCount !== 0
    || !results.contact.submitDisabled
    || results.contact.fields.length !== 3
    || results.image.solidPngInitialStyle !== 'relief'
    || results.image.transparentPngInitialStyle !== 'extrude'
    || results.image.manualStyleAfterOverride !== 'relief'
    || results.png.opaque.style !== results.png.opaque.expectedStyle
    || results.png.transparent.style !== results.png.transparent.expectedStyle
    || results.jpg.style !== results.jpg.expectedStyle
    || results.logo.style !== results.logo.expectedStyle
    || imageDownloads.some((download) => !download.filename.endsWith('.stl') || download.bytes <= 84)
    || results.threeMf.download.filename !== 'multi-object-transformed.stl'
    || results.threeMf.download.bytes <= 84
    || threeMfDownloads.some((download) => !download.filename.endsWith('.3mf') || download.bytes <= 0)
    || !results.stlToThreeMf.binary.reparse.ready
    || !results.stlToThreeMf.ascii.reparse.ready
    || Object.values(results.mobile).some((entry) => entry.hasOverflow || !entry.preview || !entry.downloadEnabled)
    || Object.values(results.trustMobile).some((entry) => entry.hasOverflow || entry.h1Count !== 1);

  await writeFile('test-output/phase-2-browser-results.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
