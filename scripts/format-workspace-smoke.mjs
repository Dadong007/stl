import assert from 'node:assert/strict';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import sharp from 'sharp';

const baseUrl = 'http://127.0.0.1:4321';
const outputDirectory = 'test-output/format-workspace';
const googleTagScriptUrl = 'https://www.googletagmanager.com/gtag/js?id=G-GKTV9KDNXL';
const desktopViewports = [[1440, 900], [1366, 768], [1280, 800], [1280, 720]];
const temporaryOversizedFiles = [];

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const results = {
  desktop: {},
  mobile: [],
  states: {},
  content: {},
};

const createContext = async (viewport, deviceScaleFactor = 1) => {
  const context = await browser.newContext({ acceptDownloads: true, viewport, deviceScaleFactor });
  await context.route(googleTagScriptUrl, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '',
  }));
  return context;
};

const uploadAndWait = async (page, selector, file) => {
  await page.locator(selector).setInputFiles(file);
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
};

const inspectContent = (page) => page.evaluate(() => ({
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
  h1: document.querySelector('.tool-intro h1')?.textContent?.trim() ?? null,
  h1Count: document.querySelectorAll('h1').length,
  intro: document.querySelector('.tool-intro p')?.textContent?.trim() ?? null,
  privacy: document.querySelector('.privacy-note')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  onThisPage: document.querySelector('.on-this-page')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  headings: Array.from(document.querySelectorAll('.content-stack h2, .content-stack h3'))
    .map((heading) => heading.textContent?.trim()),
  faqCount: document.querySelectorAll('.faq-list details').length,
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
  robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
  schemaCount: document.querySelectorAll('script[type="application/ld+json"]').length,
  internalLinksValid: Array.from(document.querySelectorAll('.tool-page a'))
    .every((link) => Boolean(link.textContent?.trim() && link.getAttribute('href'))),
}));

const inspectDesktop = (page) => page.locator('.format-workspace').evaluate((workspace) => {
  const bounds = workspace.getBoundingClientRect();
  const controls = workspace.querySelector('.converter-controls')?.getBoundingClientRect();
  const preview = workspace.querySelector('.preview-panel')?.getBoundingClientRect();
  const completion = workspace.querySelector('.image-workspace-completion')?.getBoundingClientRect();
  const status = workspace.querySelector('.converter-status')?.getBoundingClientRect();
  const download = workspace.querySelector('.primary-button')?.getBoundingClientRect();
  return {
    controlsRatio: controls ? controls.width / bounds.width : 0,
    previewRatio: preview ? preview.width / bounds.width : 0,
    completionSpansWorkspace: Boolean(completion && Math.abs(completion.width - bounds.width) <= 3),
    statusAndDownloadShareRow: Boolean(status && download && Math.abs(status.top - download.top) < 10),
    downloadVisible: Boolean(download && download.width > 0 && download.height > 0),
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    imageControlCount: workspace.querySelectorAll('.control-grid, .image-style-control').length,
  };
});

const modelPixelBounds = async (png) => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (red < 190 && green > red + 18 && green > blue - 15) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixels += 1;
      }
    }
  }
  const margin = 2;
  return {
    imageWidth: info.width,
    imageHeight: info.height,
    pixels,
    minX,
    minY,
    maxX,
    maxY,
    contained: pixels > 100
      && minX > margin
      && minY > margin
      && maxX < info.width - margin - 1
      && maxY < info.height - margin - 1,
  };
};

const inspectMobile = async (page, deviceScaleFactor) => {
  const layout = await page.evaluate((dpr) => {
    const upload = document.querySelector('.format-workspace .upload-field')?.getBoundingClientRect();
    const preview = document.querySelector('.format-workspace .preview-panel')?.getBoundingClientRect();
    const canvas = document.querySelector('.format-workspace .preview-canvas canvas');
    const canvasBounds = canvas?.getBoundingClientRect();
    const status = document.querySelector('.image-workspace-completion .converter-status')?.getBoundingClientRect();
    const download = document.querySelector('.image-workspace-completion .primary-button')?.getBoundingClientRect();
    const completion = document.querySelector('.image-workspace-completion')?.getBoundingClientRect();
    const nav = document.querySelector('.on-this-page')?.getBoundingClientRect();
    const effectiveDpr = Math.min(dpr, 3);
    return {
      preview: preview ? { width: preview.width, height: preview.height, top: preview.top, bottom: preview.bottom } : null,
      canvasCss: canvasBounds ? { width: canvasBounds.width, height: canvasBounds.height } : null,
      canvasBuffer: canvas ? { width: canvas.width, height: canvas.height } : null,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      boundedPreviewHeight: Boolean(preview && preview.height >= 289 && preview.height <= 291),
      canvasMatchesPreview: Boolean(preview && canvasBounds
        && Math.abs(preview.width - canvasBounds.width) <= 1
        && Math.abs(preview.height - canvasBounds.height) <= 1),
      drawingBufferMatchesDpr: Boolean(canvas && canvasBounds
        && Math.abs(canvas.width - Math.round(canvasBounds.width * effectiveDpr)) <= 1
        && Math.abs(canvas.height - Math.round(canvasBounds.height * effectiveDpr)) <= 1),
      correctOrder: Boolean(upload && preview && status && download && nav
        && upload.top < preview.top
        && status.top >= preview.bottom - 1
        && download.top >= status.top
        && nav.top >= (completion?.bottom ?? download.bottom)),
      downloadEnabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled === false,
      contentReachable: Boolean(nav && document.documentElement.scrollHeight < 10000),
    };
  }, deviceScaleFactor);
  return {
    ...layout,
    modelBounds: await modelPixelBounds(await page.locator('.preview-canvas canvas').screenshot()),
  };
};

const readState = (page) => page.evaluate(() => ({
  message: document.querySelector('.converter-status')?.textContent?.trim() ?? null,
  downloadDisabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled ?? null,
  hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  filenameContained: (() => {
    const name = document.querySelector('.upload-field strong');
    const field = document.querySelector('.upload-field');
    if (!name || !field) return false;
    const nameBounds = name.getBoundingClientRect();
    const fieldBounds = field.getBoundingClientRect();
    const style = getComputedStyle(name);
    return nameBounds.left >= fieldBounds.left
      && nameBounds.right <= fieldBounds.right
      && style.overflow === 'hidden'
      && style.textOverflow === 'ellipsis';
  })(),
}));

const exerciseErrorStates = async ({ page, selector, validFile, validBytes, extension, subject }) => {
  await uploadAndWait(page, selector, validFile);
  const firstReady = await readState(page);
  await page.locator(selector).setInputFiles({
    name: `wrong-extension-${subject}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('unsupported'),
  });
  await page.locator('.status-error').waitFor();
  const wrongExtension = await readState(page);

  await page.locator(selector).setInputFiles({
    name: `corrupt.${extension}`,
    mimeType: extension === '3mf' ? 'model/3mf' : 'model/stl',
    buffer: Buffer.from('not a valid model'),
  });
  await page.locator('.status-error').waitFor({ timeout: 30_000 });
  const corrupt = await readState(page);

  const oversizedPath = `${outputDirectory}/oversized.${extension}`;
  const oversizedFile = await open(oversizedPath, 'w');
  await oversizedFile.truncate(50 * 1024 * 1024 + 1);
  await oversizedFile.close();
  temporaryOversizedFiles.push(oversizedPath);
  await page.locator(selector).setInputFiles(oversizedPath);
  await page.locator('.status-error').waitFor();
  const oversized = await readState(page);

  const longName = `${`${subject}-selected-file-`.repeat(9)}final.${extension}`;
  await page.locator(selector).setInputFiles({
    name: longName,
    mimeType: extension === '3mf' ? 'model/3mf' : 'model/stl',
    buffer: validBytes,
  });
  await page.locator('.status-ready').filter({ hasText: longName }).waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const longFilename = await readState(page);

  await uploadAndWait(page, selector, validFile);
  const replacement = await readState(page);
  return { firstReady, wrongExtension, corrupt, oversized, longFilename, replacement };
};

try {
  await mkdir(outputDirectory, { recursive: true });
  const desktopContext = await createContext({ width: 1440, height: 900 });
  const page = await desktopContext.newPage();

  const desktopCases = [
    {
      route: '/3mf-to-stl/',
      selector: '#three-mf-upload',
      file: 'test-assets/generated/multi-object-transformed.3mf',
      screenshot: '3mf-to-stl-1440x900-ready.png',
    },
    {
      route: '/stl-to-3mf/',
      selector: '#stl-upload',
      file: 'test-assets/generated/binary-cube.stl',
      screenshot: 'stl-to-3mf-1440x900-binary-ready.png',
    },
    {
      route: '/stl-to-3mf/',
      selector: '#stl-upload',
      file: 'test-assets/generated/ascii-cube.stl',
      screenshot: 'stl-to-3mf-1440x900-ascii-ready.png',
      key: '/stl-to-3mf/ascii',
    },
  ];

  for (const testCase of desktopCases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}${testCase.route}`, { waitUntil: 'networkidle' });
    results.content[testCase.key ?? testCase.route] = await inspectContent(page);
    await uploadAndWait(page, testCase.selector, testCase.file);
    const key = testCase.key ?? testCase.route;
    results.desktop[key] = {};
    for (const [width, height] of desktopViewports) {
      await page.setViewportSize({ width, height });
      results.desktop[key][`${width}x${height}`] = await inspectDesktop(page);
      if (width === 1440 && height === 900) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${outputDirectory}/${testCase.screenshot}` });
      }
    }
  }

  const threeMfBytes = await readFile('test-assets/generated/multi-object-transformed.3mf');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/3mf-to-stl/`, { waitUntil: 'networkidle' });
  results.states.threeMf = await exerciseErrorStates({
    page,
    selector: '#three-mf-upload',
    validFile: 'test-assets/generated/multi-object-transformed.3mf',
    validBytes: threeMfBytes,
    extension: '3mf',
    subject: '3mf',
  });

  const binaryStlBytes = await readFile('test-assets/generated/binary-cube.stl');
  await page.goto(`${baseUrl}/stl-to-3mf/`, { waitUntil: 'networkidle' });
  results.states.stl = await exerciseErrorStates({
    page,
    selector: '#stl-upload',
    validFile: 'test-assets/generated/binary-cube.stl',
    validBytes: binaryStlBytes,
    extension: 'stl',
    subject: 'stl',
  });
  await desktopContext.close();

  const mobileCases = [
    { route: '/3mf-to-stl/', selector: '#three-mf-upload', file: 'test-assets/generated/multi-object-transformed.3mf', width: 390, height: 844, dpr: 1, screenshot: '3mf-to-stl-390x844-ready.png' },
    { route: '/3mf-to-stl/', selector: '#three-mf-upload', file: 'test-assets/generated/multi-object-transformed.3mf', width: 390, height: 844, dpr: 2 },
    { route: '/3mf-to-stl/', selector: '#three-mf-upload', file: 'test-assets/generated/multi-object-transformed.3mf', width: 430, height: 932, dpr: 3 },
    { route: '/stl-to-3mf/', selector: '#stl-upload', file: 'test-assets/generated/binary-cube.stl', width: 390, height: 844, dpr: 1, screenshot: 'stl-to-3mf-390x844-ready.png', belowScreenshot: 'stl-to-3mf-390x844-preview-completion-nav.png' },
    { route: '/stl-to-3mf/', selector: '#stl-upload', file: 'test-assets/generated/ascii-cube.stl', width: 390, height: 844, dpr: 2 },
    { route: '/stl-to-3mf/', selector: '#stl-upload', file: 'test-assets/generated/disconnected-cubes.stl', width: 430, height: 932, dpr: 3, screenshot: 'stl-to-3mf-430x932-disconnected-ready.png' },
  ];

  for (const testCase of mobileCases) {
    const mobileContext = await createContext(
      { width: testCase.width, height: testCase.height },
      testCase.dpr,
    );
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${baseUrl}${testCase.route}`, { waitUntil: 'networkidle' });
    await uploadAndWait(mobilePage, testCase.selector, testCase.file);
    const metrics = await inspectMobile(mobilePage, testCase.dpr);
    results.mobile.push({ ...testCase, ...metrics });
    if (testCase.screenshot) {
      await mobilePage.evaluate(() => {
        const workspace = document.querySelector('.format-workspace');
        if (workspace) window.scrollTo(0, workspace.getBoundingClientRect().top + window.scrollY - 8);
      });
      await mobilePage.screenshot({ path: `${outputDirectory}/${testCase.screenshot}` });
    }
    if (testCase.belowScreenshot) {
      await mobilePage.locator('.on-this-page').scrollIntoViewIfNeeded();
      await mobilePage.screenshot({ path: `${outputDirectory}/${testCase.belowScreenshot}` });
    }
    await mobileContext.close();
  }

  const expectedContent = {
    '/3mf-to-stl/': {
      title: '3MF to STL Converter — Free, No Upload | IntoSTL',
      description: 'Convert 3MF files to STL directly in your browser while preserving final geometry and transforms. Free, private and no upload required.',
      h1: 'Convert 3MF to STL',
      intro: 'Turn the final geometry in a 3MF model into a binary STL without sending the file anywhere.',
      privacy: '● Private by design. Your files are processed locally in your browser and are not uploaded to our servers.',
      onThisPage: 'On this pageHow to convert 3MF to STLWhat is preservedWhat is lostWhy convertFAQ',
      headings: ['How to convert 3MF to STL', 'What is preserved when converting 3MF to STL?', 'What 3MF data STL cannot keep', 'Why convert 3MF to STL?', '3MF to STL FAQ'],
      faqCount: 4,
      canonical: 'https://intostl.com/3mf-to-stl/',
    },
    '/stl-to-3mf/': {
      title: 'STL to 3MF Converter — Free, No Upload | IntoSTL',
      description: 'Convert binary or ASCII STL files to 3MF directly in your browser. Geometry is preserved and STL units are treated as millimeters.',
      h1: 'Convert STL to 3MF',
      intro: 'Turn a binary or ASCII STL into a 3MF model while keeping the conversion entirely on your device.',
      privacy: '● Private by design. Your STL is processed locally in your browser.',
      onThisPage: 'On this pageHow to convert STL to 3MFWhat changesUnitsWhy convertFAQ',
      headings: ['How to convert STL to 3MF', 'What changes when STL becomes 3MF?', 'STL units and millimeter handling', 'Why convert STL to 3MF?', 'STL to 3MF FAQ'],
      faqCount: 4,
      canonical: 'https://intostl.com/stl-to-3mf/',
    },
  };

  for (const [route, expected] of Object.entries(expectedContent)) {
    const actual = results.content[route];
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${route} ${key}`);
    assert.equal(actual.h1Count, 1, `${route} H1 count`);
    assert.equal(actual.robots, 'index, follow', `${route} robots`);
    assert.equal(actual.schemaCount, 3, `${route} JSON-LD count`);
    assert.equal(actual.internalLinksValid, true, `${route} internal links`);
  }

  for (const states of Object.values(results.desktop)) {
    for (const state of Object.values(states)) {
      assert.ok(state.controlsRatio >= 0.3 && state.controlsRatio <= 0.34, 'desktop controls ratio');
      assert.ok(state.previewRatio >= 0.66 && state.previewRatio <= 0.7, 'desktop preview ratio');
      assert.equal(state.completionSpansWorkspace, true, 'desktop completion width');
      assert.equal(state.statusAndDownloadShareRow, true, 'desktop completion row');
      assert.equal(state.downloadVisible, true, 'desktop download visible');
      assert.equal(state.noHorizontalOverflow, true, 'desktop horizontal overflow');
      assert.equal(state.imageControlCount, 0, 'format workspaces must not contain image controls');
    }
  }

  for (const stateGroup of Object.values(results.states)) {
    assert.equal(stateGroup.firstReady.downloadDisabled, false, 'valid file download state');
    assert.equal(stateGroup.firstReady.hasPreview, true, 'valid file preview state');
    for (const state of [stateGroup.wrongExtension, stateGroup.corrupt, stateGroup.oversized]) {
      assert.equal(state.downloadDisabled, true, 'invalid file download state');
      assert.equal(state.hasPreview, false, 'invalid file stale preview');
    }
    assert.equal(stateGroup.longFilename.filenameContained, true, 'long filename containment');
    assert.equal(stateGroup.longFilename.downloadDisabled, false, 'long valid filename download state');
    assert.equal(stateGroup.replacement.downloadDisabled, false, 'replacement download state');
    assert.equal(stateGroup.replacement.hasPreview, true, 'replacement preview state');
  }
  assert.equal(results.states.threeMf.wrongExtension.message, 'Choose a file with the .3mf extension.');
  assert.equal(results.states.threeMf.corrupt.message, 'The 3MF file could not be converted. Check that it is a valid 3MF model and try again.');
  assert.equal(results.states.threeMf.oversized.message, 'This 3MF file is larger than 50 MB. Choose a smaller file.');
  assert.equal(results.states.stl.wrongExtension.message, 'Choose a file with the .stl extension.');
  assert.equal(results.states.stl.corrupt.message, 'The STL file could not be converted. Check that it is a valid binary or ASCII STL model and try again.');
  assert.equal(results.states.stl.oversized.message, 'This STL file is larger than 50 MB. Choose a smaller file.');

  for (const state of results.mobile) {
    const expectedWidth = state.width === 390 ? 368 : 408;
    assert.ok(Math.abs(state.preview.width - expectedWidth) <= 1, 'mobile preview width');
    assert.equal(state.boundedPreviewHeight, true, 'mobile preview height');
    assert.equal(state.canvasMatchesPreview, true, 'mobile canvas CSS dimensions');
    assert.equal(state.drawingBufferMatchesDpr, true, 'mobile DPR drawing buffer');
    assert.equal(state.correctOrder, true, 'mobile workflow order');
    assert.equal(state.downloadEnabled, true, 'mobile download enabled');
    assert.equal(state.contentReachable, true, 'mobile following content reachability');
    assert.equal(state.noHorizontalOverflow, true, 'mobile horizontal overflow');
    assert.equal(state.modelBounds.contained, true, 'mobile model containment');
  }

  await writeFile(`${outputDirectory}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log('Format workspace smoke tests passed.');
} finally {
  await browser.close();
  await Promise.all(temporaryOversizedFiles.map((path) => rm(path, { force: true })));
}
