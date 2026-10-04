import './style.css';
import { createExtrudedMesh } from './core/extrude';
import { decodeImage } from './core/image-browser';
import { convertWithLib3mf, inspectWithLib3mf } from './core/lib3mf';
import { createReliefMesh } from './core/relief';
import { exportBinaryStl, parseStl } from './core/stl';
import { validateMesh } from './core/validate';

declare global {
  interface Window {
    __SPIKE_DONE__?: boolean;
    __SPIKE_RESULTS__?: unknown;
  }
}

const status = document.querySelector<HTMLPreElement>('#status')!;
const fixture = document.querySelector<HTMLSelectElement>('#fixture')!;
const fileInput = document.querySelector<HTMLInputElement>('#file')!;
const resolution = document.querySelector<HTMLSelectElement>('#resolution')!;

function setStatus(value: unknown): void {
  status.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function selectedBlob(): Promise<{ blob: Blob; name: string }> {
  const file = fileInput.files?.[0];
  if (file) return { blob: file, name: file.name };
  const response = await fetch(`/${fixture.value}`);
  if (!response.ok) throw new Error(`Could not load fixture: ${fixture.value}`);
  return { blob: await response.blob(), name: fixture.value.split('/').at(-1)! };
}

function download(bytes: Uint8Array, filename: string, type: string): void {
  const copy = bytes.slice().buffer;
  const url = URL.createObjectURL(new Blob([copy], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function runImage(mode: 'relief' | 'alpha' | 'white'): Promise<void> {
  const selected = await selectedBlob();
  const target = Number(resolution.value);
  setStatus(`Decoding ${selected.name} at ${target}px...`);
  const pixels = await decodeImage(selected.blob, target);
  const started = performance.now();
  const mesh = mode === 'relief'
    ? createReliefMesh(pixels)
    : createExtrudedMesh(pixels, { maskMode: mode === 'alpha' ? 'alpha' : 'dark-on-light' });
  const meshMs = performance.now() - started;
  const exportStarted = performance.now();
  const bytes = exportBinaryStl(mesh);
  const exportMs = performance.now() - exportStarted;
  const validation = validateMesh(mesh, true);
  setStatus({ selected: selected.name, pixels: `${pixels.width}x${pixels.height}`, meshMs, exportMs, bytes: bytes.length, ...validation });
  const stem = selected.name.replace(/\.[^.]+$/, '');
  download(bytes, `${stem}-${mode}.stl`, 'model/stl');
}

async function runFormat(input: '3mf' | 'stl', output: '3mf' | 'stl'): Promise<void> {
  const selected = await selectedBlob();
  const bytes = new Uint8Array(await selected.blob.arrayBuffer());
  setStatus(`Initializing lib3mf and converting ${selected.name}...`);
  const started = performance.now();
  const converted = await convertWithLib3mf(bytes, input, output);
  const conversionMs = performance.now() - started;
  const outputInspection = output === '3mf'
    ? await inspectWithLib3mf(converted.bytes, '3mf')
    : validateMesh(parseStl(converted.bytes), true);
  setStatus({ selected: selected.name, lib3mf: converted.version, conversionMs, input: converted.inspection, output: outputInspection, bytes: converted.bytes.length });
  download(converted.bytes, selected.name.replace(/\.[^.]+$/, `.${output}`), output === '3mf' ? 'model/3mf' : 'model/stl');
}

async function fetchFixture(path: string): Promise<Blob> {
  const response = await fetch(`/${path}`);
  if (!response.ok) throw new Error(`Fixture fetch failed: ${path}`);
  return response.blob();
}

async function runBrowserSmokeSuite(): Promise<void> {
  window.__SPIKE_DONE__ = false;
  setStatus('Running browser smoke suite...');
  const results: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };

  for (const target of [512, 1024]) {
    const pixels = await decodeImage(await fetchFixture('01-photo-relief.jpg'), target);
    const started = performance.now();
    const mesh = createReliefMesh(pixels);
    const meshMs = performance.now() - started;
    const exportStarted = performance.now();
    const stl = exportBinaryStl(mesh);
    const exportMs = performance.now() - exportStarted;
    results[`relief${target}`] = {
      pixels: `${pixels.width}x${pixels.height}`,
      meshMs,
      exportMs,
      triangleCount: mesh.indices.length / 3,
      stlBytes: stl.length,
      finiteCoordinates: validateMesh(mesh, false).finiteCoordinates,
      edgeCheck: 'Node-side full topology check; omitted here to avoid distorting responsiveness timing.',
    };
    setStatus(results);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const extrudeCases = [
    ['transparent', '02-transparent-silhouette.png', 'alpha'],
    ['whiteBackground', '04-white-bg-question.png', 'dark-on-light'],
    ['holeShape', '05-transparent-room.png', 'alpha'],
  ] as const;
  for (const [key, path, maskMode] of extrudeCases) {
    const pixels = await decodeImage(await fetchFixture(path), 512);
    const started = performance.now();
    const mesh = createExtrudedMesh(pixels, { maskMode });
    const meshMs = performance.now() - started;
    const stl = exportBinaryStl(mesh);
    results[key] = {
      pixels: `${pixels.width}x${pixels.height}`,
      meshMs,
      triangleCount: mesh.indices.length / 3,
      stlBytes: stl.length,
      components: mesh.componentCount,
      holes: mesh.holeCount,
      strategy: mesh.strategy,
      topology: validateMesh(mesh, true),
    };
    setStatus(results);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const threeMf = new Uint8Array(await (await fetchFixture('generated/multi-object-transformed.3mf')).arrayBuffer());
  const toStlStarted = performance.now();
  const stl = await convertWithLib3mf(threeMf, '3mf', 'stl');
  results.threeMfToStl = {
    conversionMs: performance.now() - toStlStarted,
    bytes: stl.bytes.length,
    input: stl.inspection,
    output: validateMesh(parseStl(stl.bytes), true),
  };

  const binaryStl = new Uint8Array(await (await fetchFixture('generated/disconnected-cubes.stl')).arrayBuffer());
  const to3mfStarted = performance.now();
  const threeMfRoundTrip = await convertWithLib3mf(binaryStl, 'stl', '3mf');
  results.stlToThreeMf = {
    conversionMs: performance.now() - to3mfStarted,
    bytes: threeMfRoundTrip.bytes.length,
    output: await inspectWithLib3mf(threeMfRoundTrip.bytes, '3mf'),
  };

  window.__SPIKE_RESULTS__ = results;
  window.__SPIKE_DONE__ = true;
  setStatus(results);
}

function handle(button: string, operation: () => Promise<void>): void {
  document.querySelector<HTMLButtonElement>(button)!.addEventListener('click', () => {
    operation().catch((error: unknown) => {
      console.error(error);
      setStatus(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error));
    });
  });
}

handle('#relief', () => runImage('relief'));
handle('#extrude-alpha', () => runImage('alpha'));
handle('#extrude-white', () => runImage('white'));
handle('#to-stl', () => runFormat('3mf', 'stl'));
handle('#to-3mf', () => runFormat('stl', '3mf'));
handle('#smoke', runBrowserSmokeSuite);

if (new URLSearchParams(location.search).has('autorun')) {
  runBrowserSmokeSuite().catch((error: unknown) => {
    window.__SPIKE_DONE__ = true;
    window.__SPIKE_RESULTS__ = { error: error instanceof Error ? error.message : String(error) };
    setStatus(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error));
  });
}
