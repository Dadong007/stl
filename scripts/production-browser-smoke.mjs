import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/win10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import sharp from 'sharp';

const baseUrl = 'http://127.0.0.1:4321';
const publicRoutes = ['/', '/image-to-stl/', '/png-to-stl/', '/3mf-to-stl/', '/logo-to-stl/', '/jpg-to-stl/', '/stl-to-3mf/', '/about/', '/privacy/', '/contact/'];
const toolRoutes = ['/image-to-stl/', '/png-to-stl/', '/3mf-to-stl/', '/logo-to-stl/', '/jpg-to-stl/', '/stl-to-3mf/'];
const faqRoutes = ['/', ...toolRoutes];
const newRoutes = ['/png-to-stl/', '/jpg-to-stl/', '/logo-to-stl/', '/stl-to-3mf/'];
const trustRoutes = ['/about/', '/privacy/', '/contact/'];
const expectedFooterRoutes = ['/image-to-stl/', '/png-to-stl/', '/jpg-to-stl/', '/logo-to-stl/', '/3mf-to-stl/', '/stl-to-3mf/', '/about/', '/privacy/', '/contact/'];
const googleTagScriptUrl = 'https://www.googletagmanager.com/gtag/js?id=G-GKTV9KDNXL';
const imageWorkspaceOutput = 'test-output/image-workspace';
const imageFamilyWorkspaceOutput = 'test-output/image-family-workspace';
const homeContentOutput = 'test-output/home-content';
const updatedImageRoutes = ['/png-to-stl/', '/jpg-to-stl/', '/logo-to-stl/'];
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
await context.route(googleTagScriptUrl, (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: '',
}));
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
  if ((url.protocol === 'http:' || url.protocol === 'https:')
    && !['127.0.0.1', 'localhost'].includes(url.hostname)
    && request.url() !== googleTagScriptUrl) {
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
  googleTagLoaderCount: document.querySelectorAll('script[src="https://www.googletagmanager.com/gtag/js?id=G-GKTV9KDNXL"]').length,
  googleTagConfigCount: Array.from(document.scripts).filter((script) => !script.src && script.textContent?.includes("gtag('config', 'G-GKTV9KDNXL')")).length,
  chooseToolH2FontSize: document.querySelector('#available-tools')
    ? getComputedStyle(document.querySelector('#available-tools')).fontSize
    : null,
  contentH2FontSizes: Array.from(document.querySelectorAll('.content-stack h2'))
    .map((heading) => getComputedStyle(heading).fontSize),
  faqSummaryGap: document.querySelector('.home-faq-list summary, .faq-list summary')
    ? getComputedStyle(document.querySelector('.home-faq-list summary, .faq-list summary')).columnGap
    : null,
  faqSummaryTypography: document.querySelector('.home-faq-list summary, .faq-list summary')
    ? (() => {
      const styles = getComputedStyle(document.querySelector('.home-faq-list summary, .faq-list summary'));
      return {
        color: styles.color,
        fontFamily: styles.fontFamily,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        letterSpacing: styles.letterSpacing,
        lineHeight: styles.lineHeight,
      };
    })()
    : null,
  faqAnswerPaddingLeft: document.querySelector('.home-faq-list details > p, .faq-list details > p')
    ? getComputedStyle(document.querySelector('.home-faq-list details > p, .faq-list details > p')).paddingLeft
    : null,
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
  const checkedStyle = page.locator('input[name="image-converter-style"]:checked');
  const style = await ((await checkedStyle.count())
    ? checkedStyle.inputValue()
    : page.locator('.control-grid select').inputValue());
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
  footerRoutes: [], brand: null, brandAssets: {}, uploadKeyboard: null, numericValidation: null,
  malformedStl: null, imageWorkspace: { desktop: {}, mobile: [], validation: null, content: null },
  imageFamilyWorkspaces: { desktop: {}, mobile: [], states: {}, content: {} },
  homeContent: { desktop: {}, mobile: {} },
  externalRequests, consoleErrors, pageErrors,
};

const readImageStyle = async (targetPage) => {
  const checkedStyle = targetPage.locator('input[name="image-converter-style"]:checked');
  return await checkedStyle.count()
    ? checkedStyle.inputValue()
    : targetPage.locator('.control-grid select').inputValue();
};

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

const inspectImageWorkspacePreview = async (targetPage, deviceScaleFactor) => {
  const layout = await targetPage.evaluate((dpr) => {
    const preview = document.querySelector('.image-workspace .preview-panel')?.getBoundingClientRect();
    const canvas = document.querySelector('.image-workspace .preview-canvas canvas');
    const canvasBounds = canvas?.getBoundingClientRect();
    const nav = document.querySelector('.on-this-page')?.getBoundingClientRect();
    const completion = document.querySelector('.image-workspace-completion')?.getBoundingClientRect();
    const download = document.querySelector('.image-workspace-completion .primary-button')?.getBoundingClientRect();
    const effectiveDpr = Math.min(dpr, 3);
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      deviceScaleFactor: dpr,
      effectiveDpr,
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
      completionAfterPreview: Boolean(completion && preview && completion.top >= preview.bottom - 1),
      downloadAfterPreview: Boolean(download && preview && download.top >= preview.bottom - 1),
      contentAfterCompletion: Boolean(nav && completion && nav.top >= completion.bottom),
      documentHeight: document.documentElement.scrollHeight,
      contentReachable: Boolean(nav && document.documentElement.scrollHeight < 10000),
    };
  }, deviceScaleFactor);
  const modelBounds = await modelPixelBounds(await targetPage.locator('.preview-canvas canvas').screenshot());
  return { ...layout, modelBounds };
};

const inspectDesktopImageWorkspace = (targetPage) => targetPage.locator('.image-workspace').evaluate((workspace) => {
  const bounds = workspace.getBoundingClientRect();
  const controls = workspace.querySelector('.converter-controls')?.getBoundingClientRect();
  const preview = workspace.querySelector('.preview-panel')?.getBoundingClientRect();
  const completion = workspace.querySelector('.image-workspace-completion')?.getBoundingClientRect();
  const download = workspace.querySelector('.primary-button')?.getBoundingClientRect();
  return {
    workspaceWidth: bounds.width,
    controlsRatio: controls ? controls.width / bounds.width : 0,
    previewRatio: preview ? preview.width / bounds.width : 0,
    completionSpansWorkspace: Boolean(completion && Math.abs(completion.width - bounds.width) <= 3),
    downloadVisible: Boolean(download && download.width > 0 && download.height > 0),
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    styleRadioCount: workspace.querySelectorAll('input[name="image-converter-style"]').length,
    styleSelectCount: workspace.querySelectorAll('select').length,
  };
});

const inspectImageRouteContent = (targetPage) => targetPage.evaluate(() => ({
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
  h1: document.querySelector('.tool-intro h1')?.textContent?.trim() ?? null,
  h1Count: document.querySelectorAll('h1').length,
  intro: document.querySelector('.tool-intro p')?.textContent?.trim() ?? null,
  privacy: document.querySelector('.privacy-note')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  onThisPage: document.querySelector('.on-this-page')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  headings: Array.from(document.querySelectorAll('.content-stack h2, .content-stack h3')).map((heading) => heading.textContent?.trim()),
  faq: Array.from(document.querySelectorAll('.faq-list details')).map((details) => ({
    question: details.querySelector('summary')?.textContent?.trim(),
    answer: details.querySelector('p')?.textContent?.trim(),
  })),
  internalLinks: Array.from(document.querySelectorAll('.tool-page a')).map((link) => ({
    text: link.textContent?.trim(),
    href: link.getAttribute('href'),
  })),
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
  robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
  schema: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) => script.textContent),
}));

const captureDesktopImageWorkspace = async (targetPage, route, screenshotName) => {
  const viewports = [[1440, 900], [1366, 768], [1280, 800], [1280, 720]];
  results.imageFamilyWorkspaces.desktop[route] = {};
  results.imageFamilyWorkspaces.content[route] = await inspectImageRouteContent(targetPage);
  for (const [width, height] of viewports) {
    await targetPage.setViewportSize({ width, height });
    results.imageFamilyWorkspaces.desktop[route][`${width}x${height}`] = await inspectDesktopImageWorkspace(targetPage);
    if (width === 1440 && height === 900) {
      await targetPage.evaluate(() => window.scrollTo(0, 0));
      await targetPage.screenshot({ path: `${imageFamilyWorkspaceOutput}/${screenshotName}` });
    }
  }
  await targetPage.setViewportSize({ width: 1440, height: 900 });
};

const exerciseUnifiedImageControls = async ({
  targetPage,
  initialStyle,
  replacement,
  replacementName,
  replacementStyle,
}) => {
  const oppositeStyle = initialStyle === 'relief' ? 'extrude' : 'relief';
  const switchStyle = async (nextStyle) => {
    await targetPage.getByRole('radio', { name: nextStyle === 'relief' ? 'Relief' : 'Extrude' }).check();
    await targetPage.locator('.status-processing').waitFor({ timeout: 30_000 });
    await targetPage.locator('.status-ready').waitFor({ timeout: 120_000 });
    await targetPage.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
    return readImageStyle(targetPage);
  };
  const changedStyle = await switchStyle(oppositeStyle);
  const restoredStyle = await switchStyle(initialStyle);
  const numericInputs = targetPage.locator('.number-control input');
  const depthInput = numericInputs.nth(0);
  const sizeInput = numericInputs.nth(1);
  await depthInput.fill('4');
  await targetPage.locator('.status-processing').waitFor({ timeout: 30_000 });
  await targetPage.locator('.status-ready').waitFor({ timeout: 120_000 });
  await sizeInput.fill('120');
  await targetPage.locator('.status-processing').waitFor({ timeout: 30_000 });
  await targetPage.locator('.status-ready').waitFor({ timeout: 120_000 });
  await depthInput.fill('0');
  await targetPage.locator('.status-error').filter({ hasText: 'Enter a depth from 0.5 to 50 mm in 0.5 mm steps.' }).waitFor();
  const invalidDepth = await targetPage.evaluate(() => ({
    downloadDisabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled ?? false,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));
  await depthInput.fill('3');
  await targetPage.locator('.status-processing').waitFor({ timeout: 30_000 });
  await targetPage.locator('.status-ready').waitFor({ timeout: 120_000 });
  await sizeInput.fill('301');
  await targetPage.locator('.status-error').filter({ hasText: 'Enter a whole-number size from 10 to 300 mm.' }).waitFor();
  const invalidSize = await targetPage.evaluate(() => ({
    downloadDisabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled ?? false,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));
  await sizeInput.fill('100');
  await targetPage.locator('.status-processing').waitFor({ timeout: 30_000 });
  await targetPage.locator('.status-ready').waitFor({ timeout: 120_000 });
  await targetPage.locator('#image-upload').setInputFiles(replacement);
  await targetPage.locator('.status-ready').filter({ hasText: replacementName }).waitFor({ timeout: 120_000 });
  await targetPage.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  return {
    initialStyle,
    changedStyle,
    restoredStyle,
    replacementStyle: await readImageStyle(targetPage),
    expectedReplacementStyle: replacementStyle,
    invalidDepth,
    invalidSize,
    downloadEnabled: await targetPage.getByRole('button', { name: 'Download STL' }).isEnabled(),
  };
};

try {
  results.chromeVersion = browser.version();
  await mkdir(imageWorkspaceOutput, { recursive: true });
  await mkdir(imageFamilyWorkspaceOutput, { recursive: true });
  await mkdir(homeContentOutput, { recursive: true });
  const meshPreviewSource = await readFile('src/components/converter/MeshPreview.tsx', 'utf8');
  const homepageQuickConverterSource = await readFile('src/components/converter/HomepageQuickConverter.tsx', 'utf8');
  results.imageFamilyWorkspaces.fitPadding = {
    dedicatedDefaultIsPointOne: /fitPadding\s*=\s*0\.1/.test(meshPreviewSource),
    homepageRemainsPointZeroSix: /fitPadding=\{0\.06\}/.test(homepageQuickConverterSource),
  };

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

  const inspectHomeContent = () => page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    h1Count: document.querySelectorAll('h1').length,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null,
    ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? null,
    schemaTypes: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => JSON.parse(script.textContent ?? '{}')['@type']),
    heroBenefits: Array.from(document.querySelectorAll('.hero-benefits > span')).map((item) => item.textContent?.trim()),
    quickConverterCount: document.querySelectorAll('.home-quick-converter').length,
    toolList: Array.from(document.querySelectorAll('.tool-entry')).map((item) => ({
      title: item.querySelector('h3')?.textContent?.trim(),
      description: item.querySelector('p')?.textContent?.trim(),
      href: item.querySelector('a')?.getAttribute('href'),
    })),
    trustStripCount: document.querySelectorAll('.trust-strip').length,
    newHeadings: Array.from(document.querySelectorAll('.home-content-section h2')).map((heading) => heading.textContent?.trim()),
    stepHeadings: Array.from(document.querySelectorAll('.home-steps h3')).map((heading) => heading.textContent?.trim()),
    faqQuestions: Array.from(document.querySelectorAll('.home-faq-list summary')).map((summary) => summary.textContent?.trim()),
    faqAnswersInHtml: document.querySelectorAll('.home-faq-list details > p').length,
    headingFontSizes: {
      tools: getComputedStyle(document.querySelector('#available-tools')).fontSize,
      how: getComputedStyle(document.querySelector('#home-how-heading')).fontSize,
      faq: getComputedStyle(document.querySelector('#home-faq-heading')).fontSize,
    },
    sectionBackgrounds: {
      how: getComputedStyle(document.querySelector('.home-how-section')).backgroundColor,
      faq: getComputedStyle(document.querySelector('.home-faq-section')).backgroundColor,
      footer: getComputedStyle(document.querySelector('.site-footer')).backgroundColor,
    },
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    stepColumns: getComputedStyle(document.querySelector('.home-steps')).gridTemplateColumns.split(' ').length,
  }));

  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 800], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    results.homeContent.desktop[`${width}x${height}`] = await inspectHomeContent();
    if (width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${homeContentOutput}/home-1440x900-top.png` });
      await page.locator('.home-how-section').screenshot({ path: `${homeContentOutput}/home-1440-how.png` });
      await page.locator('#home-faq-heading').locator('..').screenshot({ path: `${homeContentOutput}/home-1440-faq.png` });

      const documentBox = (selector) => page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { y: rect.top + window.scrollY, height: rect.height };
      });
      const howBox = await documentBox('.home-how-section');
      const faqBox = await documentBox('.home-faq-section');
      const footerBox = await documentBox('.site-footer');
      const transitionY = Math.max(0, howBox.y - 320);
      await page.evaluate((y) => window.scrollTo(0, y), transitionY);
      await page.screenshot({ path: `${homeContentOutput}/home-1440-tool-to-how.png` });

      const faqFooterHeight = Math.ceil(footerBox.y + footerBox.height - faqBox.y);
      await page.setViewportSize({ width: 1440, height: faqFooterHeight });
      await page.evaluate((y) => window.scrollTo(0, y), faqBox.y);
      await page.screenshot({ path: `${homeContentOutput}/home-1440-faq-footer.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  }
  for (const [width, height] of [[430, 932], [390, 844]]) {
    await page.setViewportSize({ width, height });
    results.homeContent.mobile[`${width}x${height}`] = await inspectHomeContent();
    if (width === 390) {
      await page.locator('.home-how-section').screenshot({ path: `${homeContentOutput}/home-390-how.png` });
      await page.locator('#home-faq-heading').locator('..').screenshot({ path: `${homeContentOutput}/home-390-faq.png` });
      await page.locator('.home-faq-list details').first().locator('summary').click();
      await page.locator('.home-faq-list details').first().screenshot({ path: `${homeContentOutput}/home-390-faq-expanded.png` });
      const mobileFaqBox = await page.locator('.home-faq-section').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { y: rect.top + window.scrollY, height: rect.height };
      });
      const mobileFooterBox = await page.locator('.site-footer').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { y: rect.top + window.scrollY, height: rect.height };
      });
      const mobileFaqFooterHeight = Math.ceil(mobileFooterBox.y + mobileFooterBox.height - mobileFaqBox.y);
      await page.setViewportSize({ width: 390, height: mobileFaqFooterHeight });
      await page.evaluate((y) => window.scrollTo(0, y), mobileFaqBox.y);
      await page.screenshot({ path: `${homeContentOutput}/home-390-faq-footer-expanded.png` });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const asset of ['/logo.svg', '/favicon.svg', '/favicon-32x32.png', '/apple-touch-icon.png']) {
    const response = await context.request.get(`${baseUrl}${asset}`);
    results.brandAssets[asset] = {
      status: response.status(),
      contentType: response.headers()['content-type'] ?? null,
      bytes: (await response.body()).length,
    };
  }

  await page.goto(`${baseUrl}/contact/`, { waitUntil: 'networkidle' });
  const contactStructure = await page.locator('.contact-form').evaluate((form) => ({
    hasAction: form.hasAttribute('action'),
    hasMethod: form.hasAttribute('method'),
    fields: Array.from(form.querySelectorAll('select, input:not([type="hidden"]), textarea')).map((field) => ({
      id: field.id,
      name: field.getAttribute('name'),
      label: form.querySelector(`label[for="${field.id}"]`)?.textContent?.trim() ?? null,
    })),
    hasTokenField: Boolean(form.querySelector('#contact-turnstile-token[type="hidden"]')),
    fileInputCount: form.querySelectorAll('input[type="file"]').length,
    initialSubmitDisabled: form.querySelector('button[type="submit"]')?.disabled ?? false,
  }));
  const contactSubmit = page.getByRole('button', { name: 'Submit feedback' });
  const setContactToken = (value) => page.locator('#contact-turnstile-token').evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

  await page.locator('#feedback-message').fill('short');
  await setContactToken('test-token');
  const shortMessageDisabled = await contactSubmit.isDisabled();

  await page.locator('#feedback-message').fill('This message is long enough for feedback.');
  await page.locator('#feedback-email').fill('not-an-email');
  const invalidEmailDisabled = await contactSubmit.isDisabled();

  await page.locator('#feedback-email').fill('person@example.com');
  const validSubmitEnabled = await contactSubmit.isEnabled();

  await page.route('**/api/contact', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'verification_failed', message: 'Please complete the verification and try again.' }),
  }), { times: 1 });
  await contactSubmit.click();
  await page.locator('#contact-status[data-state="error"]').waitFor();
  const turnstileFailureMessage = await page.locator('#contact-status').textContent();

  await setContactToken('test-token');
  await page.route('**/api/contact', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Thanks — your feedback was sent.' }),
  }), { times: 1 });
  await contactSubmit.click();
  await page.locator('#contact-status[data-state="success"]').waitFor();
  const successMessage = await page.locator('#contact-status').textContent();

  await page.locator('#feedback-message').fill('This delivery should return a mocked failure.');
  await page.locator('#feedback-email').fill('person@example.com');
  await setContactToken('test-token');
  await page.route('**/api/contact', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'delivery_failed', message: 'Your feedback could not be sent. Please try again.' }),
  }), { times: 1 });
  await contactSubmit.click();
  await page.locator('#contact-status[data-state="error"]').waitFor();
  const emailFailureMessage = await page.locator('#contact-status').textContent();

  results.contact = {
    ...contactStructure,
    shortMessageDisabled,
    invalidEmailDisabled,
    validSubmitEnabled,
    turnstileFailureMessage,
    successMessage,
    emailFailureMessage,
  };

  const sitemapIndex = await context.request.get(`${baseUrl}/sitemap-index.xml`);
  const sitemapIndexText = await sitemapIndex.text();
  const sitemapPath = sitemapIndexText.match(/<loc>https:\/\/intostl\.com\/(sitemap-[^<]+)<\/loc>/)?.[1];
  if (sitemapPath) {
    const sitemap = await context.request.get(`${baseUrl}/${sitemapPath}`);
    const sitemapText = await sitemap.text();
    results.sitemapRoutes = [...sitemapText.matchAll(/<loc>https:\/\/intostl\.com([^<]*)<\/loc>/g)].map((match) => match[1] || '/').sort();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/image-to-stl/`, { waitUntil: 'networkidle' });
  results.imageWorkspace.content = await page.evaluate(() => ({
    h1: document.querySelector('.tool-intro h1')?.textContent?.trim() ?? null,
    intro: document.querySelector('.tool-intro p')?.textContent?.trim() ?? null,
    privacy: document.querySelector('.privacy-note')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    onThisPage: document.querySelector('.on-this-page')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    headings: Array.from(document.querySelectorAll('.content-stack h2, .content-stack h3')).map((heading) => heading.textContent?.trim()),
    faq: Array.from(document.querySelectorAll('.faq-list details')).map((details) => ({
      question: details.querySelector('summary')?.textContent?.trim(),
      answer: details.querySelector('p')?.textContent?.trim(),
    })),
    internalLinks: Array.from(document.querySelectorAll('.tool-page a')).map((link) => ({
      text: link.textContent?.trim(),
      href: link.getAttribute('href'),
    })),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
    schema: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) => script.textContent),
  }));
  results.imageWorkspace.desktop.idle = await page.locator('.image-workspace').evaluate((workspace) => {
    const controls = workspace.querySelector('.converter-controls')?.getBoundingClientRect();
    const preview = workspace.querySelector('.preview-panel')?.getBoundingClientRect();
    const completion = workspace.querySelector('.image-workspace-completion')?.getBoundingClientRect();
    return {
      workspaceWidth: workspace.getBoundingClientRect().width,
      controlsWidth: controls?.width ?? 0,
      previewWidth: preview?.width ?? 0,
      completionWidth: completion?.width ?? 0,
      styleRadioCount: workspace.querySelectorAll('input[name="image-converter-style"]').length,
      styleSelectCount: workspace.querySelectorAll('select').length,
    };
  });
  await page.screenshot({ path: `${imageWorkspaceOutput}/image-to-stl-1440x900-idle.png` });
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 800], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    results.imageWorkspace.desktop[`${width}x${height}`] = await page.locator('.image-workspace').evaluate((workspace) => {
      const bounds = workspace.getBoundingClientRect();
      const controls = workspace.querySelector('.converter-controls')?.getBoundingClientRect();
      const preview = workspace.querySelector('.preview-panel')?.getBoundingClientRect();
      const completion = workspace.querySelector('.image-workspace-completion')?.getBoundingClientRect();
      const download = workspace.querySelector('.primary-button')?.getBoundingClientRect();
      return {
        workspaceWidth: bounds.width,
        controlsWidth: controls?.width ?? 0,
        previewWidth: preview?.width ?? 0,
        controlsRatio: controls ? controls.width / bounds.width : 0,
        previewRatio: preview ? preview.width / bounds.width : 0,
        completionSpansWorkspace: Boolean(completion && Math.abs(completion.width - bounds.width) <= 3),
        downloadVisible: Boolean(download && download.width > 0 && download.height > 0),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < 5; index += 1) await page.keyboard.press('Tab');
  const uploadField = page.locator('.upload-field');
  const uploadFocused = await uploadField.evaluate((element) => (
    document.activeElement === element && element.matches(':focus-visible')
  ));
  const chooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const chooser = await chooserPromise;
  await chooser.setFiles('test-assets/01-photo-relief.jpg');
  await page.locator('.status-ready').filter({ hasText: '01-photo-relief.jpg' }).waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${imageWorkspaceOutput}/image-to-stl-1440x900-jpg-ready.png` });
  await page.keyboard.press('Tab');
  results.uploadKeyboard = await page.evaluate((focused) => ({
    visibleFocus: focused,
    focusStopCount: Array.from(document.querySelectorAll('.upload-field, .upload-input'))
      .filter((element) => element.tabIndex >= 0).length,
    inputTabIndex: document.querySelector('.upload-input')?.tabIndex ?? null,
    nextFocusTag: document.activeElement?.tagName ?? null,
    nextFocusText: document.activeElement?.textContent?.trim() ?? null,
    keyboardUploadReady: document.querySelector('.converter-status')?.classList.contains('status-ready') ?? false,
  }), uploadFocused);

  const readNumericState = () => page.evaluate(() => ({
    message: document.querySelector('.converter-status')?.textContent?.trim() ?? null,
    downloadDisabled: document.querySelector('.primary-button')?.disabled ?? null,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
    depth: document.querySelectorAll('input[type="number"]')[0]?.value ?? null,
    depthInvalid: document.querySelectorAll('input[type="number"]')[0]?.getAttribute('aria-invalid') ?? null,
    size: document.querySelectorAll('input[type="number"]')[1]?.value ?? null,
    sizeInvalid: document.querySelectorAll('input[type="number"]')[1]?.getAttribute('aria-invalid') ?? null,
  }));
  const depthInput = page.getByLabel('Depth');
  const sizeInput = page.getByLabel('Size');
  const depthError = 'Enter a depth from 0.5 to 50 mm in 0.5 mm steps.';
  const sizeError = 'Enter a whole-number size from 10 to 300 mm.';

  await depthInput.fill('0');
  await page.locator('.status-error').filter({ hasText: depthError }).waitFor();
  const depthBelow = await readNumericState();
  await depthInput.fill('50.5');
  await page.locator('.status-error').filter({ hasText: depthError }).waitFor();
  const depthAbove = await readNumericState();
  await depthInput.fill('3');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });

  await sizeInput.fill('9');
  await page.locator('.status-error').filter({ hasText: sizeError }).waitFor();
  const sizeBelow = await readNumericState();
  await sizeInput.fill('301');
  await page.locator('.status-error').filter({ hasText: sizeError }).waitFor();
  const sizeAbove = await readNumericState();
  await sizeInput.fill('100');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });

  await depthInput.fill('');
  await page.locator('.status-error').filter({ hasText: depthError }).waitFor();
  const blankDepth = await readNumericState();
  await depthInput.fill('3');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  const restoredValid = await readNumericState();
  results.numericValidation = { depthBelow, depthAbove, sizeBelow, sizeAbove, blankDepth, restoredValid };

  const imageJpg = await uploadImage('test-assets/01-photo-relief.jpg', 'relief');
  await page.locator('#image-upload').setInputFiles('test-assets/04-white-bg-question.png');
  await page.locator('.status-ready').filter({ hasText: '04-white-bg-question.png' }).waitFor({ timeout: 120_000 });
  const solidPngInitialStyle = await readImageStyle(page);
  await page.locator('#image-upload').setInputFiles('test-assets/02-transparent-silhouette.png');
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const transparentPngInitialStyle = await readImageStyle(page);
  await page.screenshot({ path: `${imageWorkspaceOutput}/image-to-stl-1440x900-transparent-png-ready.png` });
  await page.getByRole('radio', { name: 'Relief' }).check();
  await page.locator('.status-processing').waitFor({ timeout: 30_000 });
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const manualStyleAfterOverride = await readImageStyle(page);
  await page.getByRole('radio', { name: 'Extrude' }).check();
  await page.locator('.status-processing').waitFor({ timeout: 30_000 });
  await page.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  const manualStyleAfterSecondOverride = await readImageStyle(page);
  results.image = {
    imageJpg,
    solidPngInitialStyle,
    transparentPngInitialStyle,
    manualStyleAfterOverride,
    manualStyleAfterSecondOverride,
  };
  const transparentBytes = await readFile('test-assets/02-transparent-silhouette.png');
  const longFilename = `${'transparent-logo-'.repeat(10)}final.png`;
  await page.locator('#image-upload').setInputFiles({
    name: longFilename,
    mimeType: 'image/png',
    buffer: transparentBytes,
  });
  await page.locator('.status-ready').filter({ hasText: longFilename }).waitFor({ timeout: 120_000 });
  const longFilenameContained = await page.locator('.upload-field strong').evaluate((label) => (
    label.scrollWidth <= label.clientWidth + 1
  ));
  await page.locator('#image-upload').setInputFiles('test-assets/01-photo-relief.jpg');
  await page.locator('.status-ready').filter({ hasText: '01-photo-relief.jpg' }).waitFor({ timeout: 120_000 });
  const replacementStyle = await readImageStyle(page);
  await page.locator('#image-upload').setInputFiles({
    name: 'corrupt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await page.locator('.status-error').filter({ hasText: 'We could not read this image.' }).waitFor({ timeout: 30_000 });
  const corruptState = await readNumericState();
  await page.locator('#image-upload').setInputFiles({
    name: 'oversized.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await page.locator('.status-error').filter({ hasText: 'This image is larger than 20 MB.' }).waitFor({ timeout: 30_000 });
  const oversizedState = await readNumericState();
  results.imageWorkspace.validation = {
    longFilenameContained,
    replacementStyle,
    corruptState,
    oversizedState,
  };

  await page.goto(`${baseUrl}/3mf-to-stl/`, { waitUntil: 'networkidle' });
  const threeMfAccept = await page.locator('#three-mf-upload').getAttribute('accept');
  await page.locator('#three-mf-upload').setInputFiles({
    name: 'unsupported.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a 3MF file'),
  });
  await page.locator('.status-error').filter({ hasText: 'Choose a file with the .3mf extension.' }).waitFor();
  const unsupportedThreeMf = await page.evaluate(() => ({
    message: document.querySelector('.converter-status')?.textContent?.trim() ?? null,
    downloadDisabled: document.querySelector('.primary-button')?.disabled ?? null,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));
  await page.locator('#three-mf-upload').setInputFiles('test-assets/generated/multi-object-transformed.3mf');
  await page.locator('.status-ready').waitFor({ timeout: 120_000 });
  await page.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  results.threeMf = {
    accept: threeMfAccept,
    unsupported: unsupportedThreeMf,
    download: publicDownload(await downloadArtifact(page.getByRole('button', { name: 'Download STL' }))),
    preview: true,
  };

  await page.goto(`${baseUrl}/png-to-stl/`, { waitUntil: 'networkidle' });
  const pngOpaque = await uploadImage('test-assets/04-white-bg-question.png', 'relief');
  const pngTransparent = await uploadImage('test-assets/02-transparent-silhouette.png', 'extrude');
  results.png = { opaque: pngOpaque, transparent: pngTransparent };
  await captureDesktopImageWorkspace(page, '/png-to-stl/', 'png-to-stl-1440x900-transparent-ready.png');
  results.imageFamilyWorkspaces.states['/png-to-stl/'] = await exerciseUnifiedImageControls({
    targetPage: page,
    initialStyle: 'extrude',
    replacement: 'test-assets/04-white-bg-question.png',
    replacementName: '04-white-bg-question.png',
    replacementStyle: 'relief',
  });
  const overDimensionPng = await sharp({
    create: { width: 4097, height: 2, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } },
  }).png().toBuffer();
  const longPngName = `${'transparent-mark-'.repeat(10)}final.png`;
  await page.locator('#image-upload').setInputFiles({ name: longPngName, mimeType: 'image/png', buffer: transparentBytes });
  await page.locator('.status-ready').filter({ hasText: longPngName }).waitFor({ timeout: 120_000 });
  const pngLongFilenameContained = await page.locator('.upload-field strong').evaluate((label) => label.scrollWidth <= label.clientWidth + 1);
  await page.locator('#image-upload').setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await page.locator('.status-error').filter({ hasText: 'We could not read this image.' }).waitFor();
  const corruptGuard = await page.evaluate(() => ({
    downloadDisabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled ?? false,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));
  await page.locator('#image-upload').setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await page.locator('.status-error').filter({ hasText: 'This image is larger than 20 MB.' }).waitFor();
  const byteLimitGuard = await page.evaluate(() => ({
    downloadDisabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled ?? false,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));
  await page.locator('#image-upload').setInputFiles({ name: 'too-wide.png', mimeType: 'image/png', buffer: overDimensionPng });
  await page.locator('.status-error').filter({ hasText: 'This image is larger than 4096 × 4096 pixels.' }).waitFor();
  const dimensionGuard = await page.evaluate(() => ({
    downloadDisabled: document.querySelector('.image-workspace-completion .primary-button')?.disabled ?? false,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));
  results.imageFamilyWorkspaces.states.sharedInputGuards = {
    longFilenameContained: pngLongFilenameContained,
    corruptGuard,
    byteLimitGuard,
    dimensionGuard,
  };

  await page.goto(`${baseUrl}/jpg-to-stl/`, { waitUntil: 'networkidle' });
  results.jpg = await uploadImage('test-assets/01-photo-relief.jpg', 'relief');
  await captureDesktopImageWorkspace(page, '/jpg-to-stl/', 'jpg-to-stl-1440x900-ready.png');
  const jpgBytes = await readFile('test-assets/01-photo-relief.jpg');
  results.imageFamilyWorkspaces.states['/jpg-to-stl/'] = await exerciseUnifiedImageControls({
    targetPage: page,
    initialStyle: 'relief',
    replacement: { name: 'photo-replacement.jpeg', mimeType: 'image/jpeg', buffer: jpgBytes },
    replacementName: 'photo-replacement.jpeg',
    replacementStyle: 'relief',
  });

  await page.goto(`${baseUrl}/logo-to-stl/`, { waitUntil: 'networkidle' });
  results.logo = await uploadImage('test-assets/02-transparent-silhouette.png', 'extrude');
  await captureDesktopImageWorkspace(page, '/logo-to-stl/', 'logo-to-stl-1440x900-transparent-ready.png');
  results.imageFamilyWorkspaces.states['/logo-to-stl/'] = await exerciseUnifiedImageControls({
    targetPage: page,
    initialStyle: 'extrude',
    replacement: 'test-assets/01-photo-relief.jpg',
    replacementName: '01-photo-relief.jpg',
    replacementStyle: 'extrude',
  });

  await page.goto(`${baseUrl}/stl-to-3mf/`, { waitUntil: 'networkidle' });
  await page.locator('#stl-upload').setInputFiles({
    name: 'malformed.stl',
    mimeType: 'model/stl',
    buffer: Buffer.from('not a valid STL'),
  });
  await page.locator('.status-error').waitFor({ timeout: 30_000 });
  results.malformedStl = await page.evaluate(() => ({
    message: document.querySelector('.converter-status')?.textContent?.trim() ?? null,
    downloadDisabled: document.querySelector('.primary-button')?.disabled ?? null,
    hasPreview: Boolean(document.querySelector('.preview-canvas canvas')),
  }));

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

  const wideReliefPng = await sharp(Buffer.from(`
    <svg width="1000" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="200" fill="#f7f7f7" />
      <rect x="70" y="35" width="860" height="130" rx="42" fill="#303030" />
      <circle cx="210" cy="100" r="42" fill="#e8e8e8" />
      <circle cx="790" cy="100" r="42" fill="#e8e8e8" />
    </svg>
  `)).png().toBuffer();
  const wideReliefJpg = await sharp(wideReliefPng).jpeg({ quality: 92 }).toBuffer();

  const openMobileImageWorkspace = async ({
    route = '/image-to-stl/',
    width,
    height,
    dpr,
    file,
    expectedStyle,
    selectedStyle,
    screenshot,
    outputDirectory = imageWorkspaceOutput,
  }) => {
    const mobileContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width, height },
      deviceScaleFactor: dpr,
    });
    await mobileContext.route(googleTagScriptUrl, (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    }));
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    await mobilePage.locator('#image-upload').setInputFiles(file);
    await mobilePage.locator('.status-ready').waitFor({ timeout: 120_000 });
    await mobilePage.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
    if (selectedStyle) {
      await mobilePage.getByRole('radio', { name: selectedStyle === 'relief' ? 'Relief' : 'Extrude' }).check();
      await mobilePage.locator('.status-processing').waitFor({ timeout: 30_000 });
      await mobilePage.locator('.status-ready').waitFor({ timeout: 120_000 });
      await mobilePage.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
    }
    const style = await readImageStyle(mobilePage);
    const metrics = await inspectImageWorkspacePreview(mobilePage, dpr);
    if (screenshot) {
      await mobilePage.evaluate(() => {
        const workspace = document.querySelector('.image-workspace');
        if (workspace) window.scrollTo(0, workspace.getBoundingClientRect().top + window.scrollY - 8);
      });
      await mobilePage.screenshot({ path: `${outputDirectory}/${screenshot}` });
    }
    return { mobileContext, mobilePage, result: { route, width, height, dpr, expectedStyle, style, ...metrics } };
  };

  const jpgMobile = await openMobileImageWorkspace({
    width: 390,
    height: 844,
    dpr: 1,
    file: 'test-assets/01-photo-relief.jpg',
    expectedStyle: 'relief',
    screenshot: 'image-to-stl-390x844-jpg-ready.png',
  });
  results.imageWorkspace.mobile.push(jpgMobile.result);
  await jpgMobile.mobilePage.locator('#image-upload').setInputFiles('test-assets/02-transparent-silhouette.png');
  await jpgMobile.mobilePage.locator('.status-ready').filter({ hasText: '02-transparent-silhouette.png' }).waitFor({ timeout: 120_000 });
  await jpgMobile.mobilePage.locator('.preview-canvas canvas').waitFor({ timeout: 30_000 });
  const replacementMetrics = await inspectImageWorkspacePreview(jpgMobile.mobilePage, 1);
  results.imageWorkspace.mobile.push({
    width: 390,
    height: 844,
    dpr: 1,
    expectedStyle: 'extrude',
    style: await readImageStyle(jpgMobile.mobilePage),
    replacement: true,
    ...replacementMetrics,
  });
  await jpgMobile.mobilePage.evaluate(() => {
    const workspace = document.querySelector('.image-workspace');
    if (workspace) window.scrollTo(0, workspace.getBoundingClientRect().top + window.scrollY - 8);
  });
  await jpgMobile.mobilePage.screenshot({ path: `${imageWorkspaceOutput}/image-to-stl-390x844-transparent-png-ready.png` });
  await jpgMobile.mobilePage.locator('.on-this-page').scrollIntoViewIfNeeded();
  await jpgMobile.mobilePage.screenshot({ path: `${imageWorkspaceOutput}/image-to-stl-390x844-below-preview.png` });
  await jpgMobile.mobileContext.close();

  const wideMobile = await openMobileImageWorkspace({
    width: 390,
    height: 844,
    dpr: 2,
    file: { name: 'very-wide-relief.png', mimeType: 'image/png', buffer: wideReliefPng },
    expectedStyle: 'relief',
  });
  results.imageWorkspace.mobile.push({ ...wideMobile.result, wide: true });
  await wideMobile.mobileContext.close();

  const opaqueMobile = await openMobileImageWorkspace({
    width: 390,
    height: 844,
    dpr: 3,
    file: 'test-assets/04-white-bg-question.png',
    expectedStyle: 'relief',
  });
  results.imageWorkspace.mobile.push({ ...opaqueMobile.result, opaque: true });
  await opaqueMobile.mobileContext.close();

  const wideViewportMobile = await openMobileImageWorkspace({
    width: 430,
    height: 932,
    dpr: 2,
    file: 'test-assets/02-transparent-silhouette.png',
    expectedStyle: 'extrude',
    screenshot: 'image-to-stl-430x932-transparent-png-ready.png',
  });
  results.imageWorkspace.mobile.push(wideViewportMobile.result);
  await wideViewportMobile.mobileContext.close();

  const mobileImageFamilyConfigs = [
    {
      route: '/png-to-stl/',
      file: 'test-assets/02-transparent-silhouette.png',
      expectedStyle: 'extrude',
      wideFile: { name: 'very-wide-relief.png', mimeType: 'image/png', buffer: wideReliefPng },
      screenshot: 'png-to-stl-390x844-transparent-ready.png',
    },
    {
      route: '/jpg-to-stl/',
      file: 'test-assets/01-photo-relief.jpg',
      expectedStyle: 'relief',
      wideFile: { name: 'very-wide-relief.jpeg', mimeType: 'image/jpeg', buffer: wideReliefJpg },
      screenshot: 'jpg-to-stl-390x844-ready.png',
    },
    {
      route: '/logo-to-stl/',
      file: 'test-assets/02-transparent-silhouette.png',
      expectedStyle: 'extrude',
      wideFile: { name: 'very-wide-logo.png', mimeType: 'image/png', buffer: wideReliefPng },
      wideSelectedStyle: 'relief',
      screenshot: 'logo-to-stl-390x844-transparent-ready.png',
    },
  ];

  for (const config of mobileImageFamilyConfigs) {
    const mobile390 = await openMobileImageWorkspace({
      route: config.route,
      width: 390,
      height: 844,
      dpr: 1,
      file: config.file,
      expectedStyle: config.expectedStyle,
      screenshot: config.screenshot,
      outputDirectory: imageFamilyWorkspaceOutput,
    });
    results.imageFamilyWorkspaces.mobile.push(mobile390.result);
    if (config.route === '/png-to-stl/') {
      await mobile390.mobilePage.locator('.on-this-page').scrollIntoViewIfNeeded();
      await mobile390.mobilePage.screenshot({
        path: `${imageFamilyWorkspaceOutput}/png-to-stl-390x844-preview-completion-nav.png`,
      });
    }
    await mobile390.mobileContext.close();

    const mobile430 = await openMobileImageWorkspace({
      route: config.route,
      width: 430,
      height: 932,
      dpr: 2,
      file: config.file,
      expectedStyle: config.expectedStyle,
    });
    results.imageFamilyWorkspaces.mobile.push(mobile430.result);
    await mobile430.mobileContext.close();

    const mobileWide = await openMobileImageWorkspace({
      route: config.route,
      width: 390,
      height: 844,
      dpr: 3,
      file: config.wideFile,
      expectedStyle: 'relief',
      selectedStyle: config.wideSelectedStyle,
    });
    results.imageFamilyWorkspaces.mobile.push({ ...mobileWide.result, wide: true });
    await mobileWide.mobileContext.close();
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
  const invalidNumericStates = [
    results.numericValidation.depthBelow,
    results.numericValidation.depthAbove,
    results.numericValidation.sizeBelow,
    results.numericValidation.sizeAbove,
    results.numericValidation.blankDepth,
  ];
  const desktopWorkspaceStates = Object.entries(results.imageWorkspace.desktop)
    .filter(([key]) => key.includes('x'))
    .map(([, value]) => value);
  const expectedImageHeadings = [
    'How to convert an image to STL',
    'Relief vs Extrude: two ways to turn an image into STL',
    'What images work best for 3D printing?',
    'Image to STL FAQ',
  ];
  const expectedImageLinks = [
    ['How to convert an image to STL', '#image-how'],
    ['Relief vs Extrude', '#image-styles'],
    ['Best images for STL conversion', '#image-printing'],
    ['FAQ', '#image-faq'],
    ['PNG converter', '/png-to-stl/'],
    ['logo converter', '/logo-to-stl/'],
    ['JPG to STL guide', '/jpg-to-stl/'],
    ['PNG to STL', '/png-to-stl/'],
    ['JPG to STL', '/jpg-to-stl/'],
    ['Logo to STL', '/logo-to-stl/'],
  ];
  const imageContent = results.imageWorkspace.content;
  const mobileWorkspaceFailed = results.imageWorkspace.mobile.some((entry) => {
    const expectedWidth = entry.width === 390 ? 368 : 408;
    return entry.style !== entry.expectedStyle
      || !entry.noHorizontalOverflow
      || !entry.boundedPreviewHeight
      || !entry.canvasMatchesPreview
      || !entry.drawingBufferMatchesDpr
      || !entry.completionAfterPreview
      || !entry.downloadAfterPreview
      || !entry.contentAfterCompletion
      || !entry.contentReachable
      || !entry.modelBounds.contained
      || Math.abs(entry.preview.width - expectedWidth) > 1;
  });
  const imageFamilyDesktopStates = updatedImageRoutes.flatMap((route) => (
    Object.values(results.imageFamilyWorkspaces.desktop[route] ?? {})
  ));
  const imageFamilyDesktopFailed = imageFamilyDesktopStates.some((entry) => (
    entry.controlsRatio < 0.3
    || entry.controlsRatio > 0.34
    || entry.previewRatio < 0.66
    || entry.previewRatio > 0.7
    || !entry.completionSpansWorkspace
    || !entry.downloadVisible
    || !entry.noHorizontalOverflow
    || entry.styleRadioCount !== 2
    || entry.styleSelectCount !== 0
  ));
  const imageFamilyMobileFailed = results.imageFamilyWorkspaces.mobile.some((entry) => {
    const expectedWidth = entry.width === 390 ? 368 : 408;
    return entry.style !== entry.expectedStyle
      || !entry.noHorizontalOverflow
      || !entry.boundedPreviewHeight
      || !entry.canvasMatchesPreview
      || !entry.drawingBufferMatchesDpr
      || !entry.completionAfterPreview
      || !entry.downloadAfterPreview
      || !entry.contentAfterCompletion
      || !entry.contentReachable
      || !entry.modelBounds.contained
      || Math.abs(entry.preview.width - expectedWidth) > 1;
  });
  const imageFamilyControlFailed = updatedImageRoutes.some((route) => {
    const state = results.imageFamilyWorkspaces.states[route];
    const expectedOpposite = state.initialStyle === 'relief' ? 'extrude' : 'relief';
    return state.changedStyle !== expectedOpposite
      || state.restoredStyle !== state.initialStyle
      || state.replacementStyle !== state.expectedReplacementStyle
      || !state.invalidDepth.downloadDisabled
      || state.invalidDepth.hasPreview
      || !state.invalidSize.downloadDisabled
      || state.invalidSize.hasPreview
      || !state.downloadEnabled;
  });
  const expectedImageFamilyContent = {
    '/png-to-stl/': {
      title: 'PNG to STL Converter — Free Online Tool | IntoSTL',
      description: 'Convert PNG images into printable STL models in your browser. Transparent PNGs can be extruded, while opaque images can become reliefs.',
      h1: 'Convert PNG to STL',
      intro: 'Turn a PNG into a printable relief or extruded model without uploading it.',
      privacy: '● Private by design. Your PNG is processed locally in your browser.',
      onThisPage: 'On this pageHow to convert PNG to STLTransparent PNGsRelief vs ExtrudeBest PNGsFAQ',
      headings: ['How to convert PNG to STL', 'How transparent PNGs become STL shapes', 'Relief or Extrude for PNG?', 'What PNG images work best?', 'PNG to STL FAQ'],
      faqCount: 4,
      canonical: 'https://intostl.com/png-to-stl/',
    },
    '/jpg-to-stl/': {
      title: 'JPG to STL Converter — Free Online Tool | IntoSTL',
      description: 'Convert JPG or JPEG images into printable STL relief models directly in your browser. Free, private and no sign-up required.',
      h1: 'Convert JPG to STL',
      intro: 'Turn a JPG or JPEG into a printable 3D relief directly in your browser.',
      privacy: '● Private by design. Your JPG is processed locally in your browser.',
      onThisPage: 'On this pageHow to convert JPG to STLHow photo relief worksBest JPG imagesFAQ',
      headings: ['How to convert JPG or JPEG to STL', 'How a JPG photo becomes a 3D relief', 'What JPG images work best?', 'JPG to STL FAQ'],
      faqCount: 4,
      canonical: 'https://intostl.com/jpg-to-stl/',
    },
    '/logo-to-stl/': {
      title: 'Logo to STL Converter — Create Printable 3D Logos | IntoSTL',
      description: 'Turn PNG or JPG logos into extruded STL models for 3D printing. Works best with transparent or high-contrast logos and runs locally in your browser.',
      h1: 'Convert a Logo to STL',
      intro: 'Turn a PNG or JPG logo into a solid, printable STL directly in your browser.',
      privacy: '● Private by design. Your logo is processed locally in your browser.',
      onThisPage: 'On this pageHow to convert a logo to STLTransparent vs solid backgroundBest logos for extrusionFAQ',
      headings: ['How to convert a logo to STL', 'Transparent vs solid-background logos', 'What logos work best for STL extrusion?', 'Logo to STL FAQ'],
      faqCount: 4,
      canonical: 'https://intostl.com/logo-to-stl/',
    },
  };
  const imageFamilyContentFailed = updatedImageRoutes.some((route) => {
    const actual = results.imageFamilyWorkspaces.content[route];
    const expected = expectedImageFamilyContent[route];
    return actual.title !== expected.title
      || actual.description !== expected.description
      || actual.h1 !== expected.h1
      || actual.h1Count !== 1
      || actual.intro !== expected.intro
      || actual.privacy !== expected.privacy
      || actual.onThisPage !== expected.onThisPage
      || JSON.stringify(actual.headings) !== JSON.stringify(expected.headings)
      || actual.faq.length !== expected.faqCount
      || actual.canonical !== expected.canonical
      || actual.robots !== 'index, follow'
      || actual.schema.length !== 3
      || actual.internalLinks.some((link) => !link.text || !link.href);
  });
  const sharedInputGuards = results.imageFamilyWorkspaces.states.sharedInputGuards;
  const failed = pageErrors.length > 0
    || consoleErrors.length > 0
    || externalRequests.length > 0
    || results.skipLink.normal.visibleInViewport
    || !results.skipLink.keyboardFocused.visibleInViewport
    || !results.skipLink.keyboardFocused.focusVisible
    || pageEntries.some((entry) => entry.status !== 200 || !entry.hasContent || entry.h1Count !== 1 || entry.hasOverflow || !entry.description || !entry.canonical || !entry.brandLogoLoaded || !entry.footerLogoLoaded || entry.googleTagLoaderCount !== 1 || entry.googleTagConfigCount !== 1)
    || toolRoutes.some((route) => results.pages[route].contentH2FontSizes.some(
      (fontSize) => fontSize !== results.pages['/'].chooseToolH2FontSize,
    ))
    || faqRoutes.some((route) => results.pages[route].faqSummaryGap !== '11px'
      || results.pages[route].faqAnswerPaddingLeft !== '21px')
    || faqRoutes.some((route) => JSON.stringify(results.pages[route].faqSummaryTypography)
      !== JSON.stringify(results.pages['/'].faqSummaryTypography))
    || newRoutes.some((route) => !['WebApplication', 'BreadcrumbList', 'FAQPage'].every((type) => results.pages[route].schemaTypes.includes(type)))
    || trustRoutes.some((route) => !results.pages[route].schemaTypes.includes('BreadcrumbList'))
    || JSON.stringify(results.sitemapRoutes) !== JSON.stringify(expectedSitemapRoutes)
    || JSON.stringify(results.footerRoutes) !== JSON.stringify(expectedFooterRoutes)
    || JSON.stringify(results.brand.iconLinks) !== JSON.stringify(['/favicon.svg', '/favicon-32x32.png', '/apple-touch-icon.png'])
    || results.brand.trustIconCount !== 0
    || Object.values(results.homeContent.desktop).some((entry) => entry.noHorizontalOverflow !== true || entry.stepColumns !== 3)
    || Object.values(results.homeContent.mobile).some((entry) => entry.noHorizontalOverflow !== true || entry.stepColumns !== 1)
    || results.homeContent.desktop['1440x900'].title !== 'IntoSTL — Free STL & 3D Printing Tools'
    || results.homeContent.desktop['1440x900'].description !== 'Free browser-based tools for converting images and 3D files to STL or 3MF. No sign-up and no uploads — your files stay on your device.'
    || results.homeContent.desktop['1440x900'].h1 !== 'Convert Images and 3D Files to STL Online'
    || results.homeContent.desktop['1440x900'].h1Count !== 1
    || results.homeContent.desktop['1440x900'].canonical !== 'https://intostl.com/'
    || results.homeContent.desktop['1440x900'].robots !== 'index, follow'
    || results.homeContent.desktop['1440x900'].ogTitle !== results.homeContent.desktop['1440x900'].title
    || results.homeContent.desktop['1440x900'].ogDescription !== results.homeContent.desktop['1440x900'].description
    || JSON.stringify(results.homeContent.desktop['1440x900'].schemaTypes) !== JSON.stringify(['WebSite'])
    || JSON.stringify(results.homeContent.desktop['1440x900'].heroBenefits) !== JSON.stringify(['Free', 'No sign-up', 'Files stay on your device'])
    || results.homeContent.desktop['1440x900'].quickConverterCount !== 1
    || JSON.stringify(results.homeContent.desktop['1440x900'].toolList) !== JSON.stringify([
      { title: 'Image to STL', description: 'Turn a JPG or PNG into a printable relief or extruded model.', href: '/image-to-stl/' },
      { title: 'PNG to STL', description: 'Make a relief or extrusion from a transparent or opaque PNG.', href: '/png-to-stl/' },
      { title: '3MF to STL', description: 'Convert 3MF geometry to a widely supported binary STL file.', href: '/3mf-to-stl/' },
      { title: 'Logo to STL', description: 'Extrude a PNG or JPG logo into a solid printable model.', href: '/logo-to-stl/' },
      { title: 'JPG to STL', description: 'Turn a JPG or JPEG into a printable 3D relief.', href: '/jpg-to-stl/' },
      { title: 'STL to 3MF', description: 'Convert binary or ASCII STL geometry into a 3MF model.', href: '/stl-to-3mf/' },
    ])
    || results.homeContent.desktop['1440x900'].trustStripCount !== 0
    || JSON.stringify(results.homeContent.desktop['1440x900'].newHeadings) !== JSON.stringify(['How IntoSTL works', 'FAQ'])
    || JSON.stringify(results.homeContent.desktop['1440x900'].stepHeadings) !== JSON.stringify(['Choose your file', 'Preview the result', 'Download your model'])
    || new Set(Object.values(results.homeContent.desktop['1440x900'].headingFontSizes)).size !== 1
    || results.homeContent.desktop['1440x900'].faqQuestions.length !== 6
    || results.homeContent.desktop['1440x900'].faqAnswersInHtml !== 6
    || JSON.stringify(results.homeContent.desktop['1440x900'].sectionBackgrounds) !== JSON.stringify({
      how: 'rgb(244, 248, 246)',
      faq: 'rgb(255, 255, 255)',
      footer: 'rgb(240, 243, 242)',
    })
    || Object.values(results.brandAssets).some((asset) => asset.status !== 200 || !asset.contentType?.startsWith('image/') || asset.bytes <= 0)
    || results.contact.hasAction
    || results.contact.hasMethod
    || results.contact.fileInputCount !== 0
    || !results.contact.hasTokenField
    || !results.contact.initialSubmitDisabled
    || !results.contact.shortMessageDisabled
    || !results.contact.invalidEmailDisabled
    || !results.contact.validSubmitEnabled
    || results.contact.turnstileFailureMessage !== 'Please complete the verification and try again.'
    || results.contact.successMessage !== 'Thanks — your feedback was sent.'
    || results.contact.emailFailureMessage !== 'Your feedback could not be sent. Please try again.'
    || results.contact.fields.length !== 3
    || results.image.solidPngInitialStyle !== 'relief'
    || results.image.transparentPngInitialStyle !== 'extrude'
    || results.image.manualStyleAfterOverride !== 'relief'
    || results.image.manualStyleAfterSecondOverride !== 'extrude'
    || !results.uploadKeyboard.visibleFocus
    || results.uploadKeyboard.focusStopCount !== 1
    || results.uploadKeyboard.inputTabIndex !== -1
    || results.uploadKeyboard.nextFocusTag !== 'INPUT'
    || !results.uploadKeyboard.keyboardUploadReady
    || results.imageWorkspace.desktop.idle.styleRadioCount !== 2
    || results.imageWorkspace.desktop.idle.styleSelectCount !== 0
    || desktopWorkspaceStates.some((entry) => entry.controlsRatio < 0.3
      || entry.controlsRatio > 0.34
      || entry.previewRatio < 0.66
      || entry.previewRatio > 0.7
      || !entry.completionSpansWorkspace
      || !entry.downloadVisible
      || !entry.noHorizontalOverflow)
    || !results.imageWorkspace.validation.longFilenameContained
    || results.imageWorkspace.validation.replacementStyle !== 'relief'
    || !results.imageWorkspace.validation.corruptState.downloadDisabled
    || results.imageWorkspace.validation.corruptState.hasPreview
    || !results.imageWorkspace.validation.oversizedState.downloadDisabled
    || results.imageWorkspace.validation.oversizedState.hasPreview
    || mobileWorkspaceFailed
    || imageFamilyDesktopFailed
    || imageFamilyMobileFailed
    || imageFamilyControlFailed
    || imageFamilyContentFailed
    || !results.imageFamilyWorkspaces.fitPadding.dedicatedDefaultIsPointOne
    || !results.imageFamilyWorkspaces.fitPadding.homepageRemainsPointZeroSix
    || !sharedInputGuards.longFilenameContained
    || !sharedInputGuards.corruptGuard.downloadDisabled
    || sharedInputGuards.corruptGuard.hasPreview
    || !sharedInputGuards.byteLimitGuard.downloadDisabled
    || sharedInputGuards.byteLimitGuard.hasPreview
    || !sharedInputGuards.dimensionGuard.downloadDisabled
    || sharedInputGuards.dimensionGuard.hasPreview
    || imageContent.h1 !== 'Convert an Image to STL'
    || imageContent.intro !== 'Upload a JPG or PNG, choose Relief or Extrude, and create a printable model directly in your browser.'
    || imageContent.privacy !== '● Private by design. Your files are processed locally in your browser and are not uploaded to our servers.'
    || imageContent.onThisPage !== 'On this pageHow to convert an image to STLRelief vs ExtrudeBest images for STL conversionFAQ'
    || JSON.stringify(imageContent.headings) !== JSON.stringify(expectedImageHeadings)
    || JSON.stringify(imageContent.internalLinks.map(({ text, href }) => [text, href])) !== JSON.stringify(expectedImageLinks)
    || imageContent.faq.length !== 3
    || imageContent.canonical !== 'https://intostl.com/image-to-stl/'
    || imageContent.robots !== 'index, follow'
    || imageContent.schema.length !== 3
    || invalidNumericStates.some((entry) => !entry.downloadDisabled || entry.hasPreview)
    || results.numericValidation.depthBelow.depth !== '0'
    || results.numericValidation.depthAbove.depth !== '50.5'
    || results.numericValidation.sizeBelow.size !== '9'
    || results.numericValidation.sizeAbove.size !== '301'
    || results.numericValidation.blankDepth.depth !== ''
    || results.numericValidation.depthBelow.depthInvalid !== 'true'
    || results.numericValidation.depthAbove.depthInvalid !== 'true'
    || results.numericValidation.sizeBelow.sizeInvalid !== 'true'
    || results.numericValidation.sizeAbove.sizeInvalid !== 'true'
    || results.numericValidation.blankDepth.depthInvalid !== 'true'
    || results.numericValidation.depthBelow.message !== depthError
    || results.numericValidation.depthAbove.message !== depthError
    || results.numericValidation.sizeBelow.message !== sizeError
    || results.numericValidation.sizeAbove.message !== sizeError
    || results.numericValidation.blankDepth.message !== depthError
    || results.numericValidation.restoredValid.downloadDisabled
    || !results.numericValidation.restoredValid.hasPreview
    || results.png.opaque.style !== results.png.opaque.expectedStyle
    || results.png.transparent.style !== results.png.transparent.expectedStyle
    || results.jpg.style !== results.jpg.expectedStyle
    || results.logo.style !== results.logo.expectedStyle
    || imageDownloads.some((download) => !download.filename.endsWith('.stl') || download.bytes <= 84)
    || results.threeMf.accept !== null
    || results.threeMf.unsupported.message !== 'Choose a file with the .3mf extension.'
    || !results.threeMf.unsupported.downloadDisabled
    || results.threeMf.unsupported.hasPreview
    || results.threeMf.download.filename !== 'multi-object-transformed.stl'
    || results.threeMf.download.bytes <= 84
    || threeMfDownloads.some((download) => !download.filename.endsWith('.3mf') || download.bytes <= 0)
    || !results.stlToThreeMf.binary.reparse.ready
    || !results.stlToThreeMf.ascii.reparse.ready
    || results.malformedStl.message !== 'The STL file could not be converted. Check that it is a valid binary or ASCII STL model and try again.'
    || !results.malformedStl.downloadDisabled
    || results.malformedStl.hasPreview
    || Object.values(results.mobile).some((entry) => entry.hasOverflow || !entry.preview || !entry.downloadEnabled)
    || Object.values(results.trustMobile).some((entry) => entry.hasOverflow || entry.h1Count !== 1);

  await writeFile('test-output/phase-2-browser-results.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
