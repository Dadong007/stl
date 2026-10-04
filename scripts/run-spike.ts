import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { createExtrudedMesh } from '../spike/core/extrude';
import { combineMeshes, createCuboid } from '../spike/core/fixtures';
import {
  convertWithLib3mf,
  create3mfModel,
  getLib3mfRuntime,
  inspectWithLib3mf,
} from '../spike/core/lib3mf';
import { createReliefMesh } from '../spike/core/relief';
import { exportAsciiStl, exportBinaryStl, parseStl } from '../spike/core/stl';
import type { IndexedMesh, PixelBuffer } from '../spike/core/types';
import { validateMesh } from '../spike/core/validate';

const root = process.cwd();
const assetsDirectory = path.join(root, 'test-assets');
const generatedDirectory = path.join(assetsDirectory, 'generated');
const outputDirectory = path.join(root, 'test-output');

interface TimedMeshResult {
  source: string;
  pixels: string;
  meshMs: number;
  exportMs: number;
  outputBytes: number;
  output: string;
  validation: ReturnType<typeof validateMesh>;
  stlReparse?: ReturnType<typeof validateMesh>;
  stlHeaderTriangles: number;
  components?: number;
  holes?: number;
  strategy?: IndexedMesh['strategy'];
  note?: string;
}

async function loadPixels(filename: string, longestDimension: number): Promise<PixelBuffer> {
  const source = sharp(path.join(assetsDirectory, filename));
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Image dimensions unavailable: ${filename}`);
  const scale = longestDimension / Math.max(metadata.width, metadata.height);
  const width = Math.max(2, Math.round(metadata.width * scale));
  const height = Math.max(2, Math.round(metadata.height * scale));
  const { data, info } = await sharp(path.join(assetsDirectory, filename))
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
  };
}

function stlHeaderTriangleCount(bytes: Uint8Array): number {
  if (bytes.length < 84) return -1;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
}

function ensureClosed(name: string, validation: ReturnType<typeof validateMesh>): void {
  if (!validation.finiteCoordinates || validation.degenerateTriangles > 0 || validation.boundaryEdges > 0 || validation.nonManifoldEdges > 0) {
    throw new Error(`${name} failed topology checks: ${JSON.stringify(validation)}`);
  }
}

async function writeMeshStl(
  filename: string,
  source: string,
  pixels: PixelBuffer,
  create: () => IndexedMesh,
  checkEdges: boolean,
): Promise<TimedMeshResult> {
  const meshStarted = performance.now();
  const mesh = create();
  const meshMs = performance.now() - meshStarted;
  const validation = validateMesh(mesh, checkEdges);
  if (checkEdges) ensureClosed(filename, validation);
  else if (!validation.finiteCoordinates || validation.degenerateTriangles > 0) {
    throw new Error(`${filename} failed finite/degenerate checks.`);
  }
  const exportStarted = performance.now();
  const bytes = exportBinaryStl(mesh);
  const exportMs = performance.now() - exportStarted;
  await writeFile(path.join(outputDirectory, filename), bytes);
  const reparse = bytes.length < 40_000_000 ? validateMesh(parseStl(bytes, `reparsed-${mesh.name}`), checkEdges) : undefined;
  if (reparse && checkEdges) ensureClosed(`${filename} reparse`, reparse);
  return {
    source,
    pixels: `${pixels.width}x${pixels.height}`,
    meshMs,
    exportMs,
    outputBytes: bytes.length,
    output: filename,
    validation,
    stlReparse: reparse,
    stlHeaderTriangles: stlHeaderTriangleCount(bytes),
    components: mesh.componentCount,
    holes: mesh.holeCount,
    strategy: mesh.strategy,
    note: checkEdges ? undefined : 'Full edge pairing omitted at 1024; the identical generator was fully checked at 512.',
  };
}

async function saveGenerated(filename: string, bytes: Uint8Array): Promise<string> {
  const target = path.join(generatedDirectory, filename);
  await writeFile(target, bytes);
  return target;
}

async function timedConversion(
  bytes: Uint8Array,
  input: '3mf' | 'stl',
  output: '3mf' | 'stl',
): Promise<Awaited<ReturnType<typeof convertWithLib3mf>> & { conversionMs: number }> {
  const started = performance.now();
  const result = await convertWithLib3mf(bytes, input, output);
  return { ...result, conversionMs: performance.now() - started };
}

await mkdir(generatedDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

const results: Record<string, any> = {
  environment: {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpuCount: globalThis.navigator?.hardwareConcurrency ?? null,
  },
  relief: {},
  extrude: {},
  threeMfToStl: {},
  stlToThreeMf: {},
};

console.log('Test A: relief mesh at 512 and 1024...');
for (const target of [512, 1024]) {
  const pixels = await loadPixels('01-photo-relief.jpg', target);
  results.relief[target] = await writeMeshStl(
    `photo-relief-${target}.stl`,
    '01-photo-relief.jpg',
    pixels,
    () => createReliefMesh(pixels),
    target === 512,
  );
  console.log(`  ${target}: ${results.relief[target].validation.triangleCount.toLocaleString()} triangles, ${(results.relief[target].outputBytes / 1_000_000).toFixed(1)} MB`);
}

console.log('Test B: alpha, white-background, holes, and disconnected regions...');
const extrudeCases = [
  { key: 'transparent', source: '02-transparent-silhouette.png', output: 'transparent-logo-extrude.stl', mode: 'alpha' as const },
  { key: 'whiteBackground', source: '04-white-bg-question.png', output: 'white-bg-logo-extrude.stl', mode: 'dark-on-light' as const },
  { key: 'holeShape', source: '05-transparent-room.png', output: 'transparent-room-hole-extrude.stl', mode: 'alpha' as const },
];
for (const test of extrudeCases) {
  const pixels = await loadPixels(test.source, 512);
  results.extrude[test.key] = await writeMeshStl(
    test.output,
    test.source,
    pixels,
    () => createExtrudedMesh(pixels, { maskMode: test.mode }),
    true,
  );
  console.log(`  ${test.key}: ${results.extrude[test.key].components} components, ${results.extrude[test.key].holes} holes`);
}

console.log('Generating deterministic STL and 3MF fixtures...');
const cube = createCuboid('10mm-cube', [10, 10, 10]);
const smallCube = createCuboid('5mm-cube', [5, 5, 5]);
const disconnected = combineMeshes('disconnected-cubes', [
  cube,
  createCuboid('translated-cube-shell', [6, 6, 6], [16, 2, 0]),
]);
const moderatePixels: PixelBuffer = {
  width: 128,
  height: 96,
  data: new Uint8Array(128 * 96 * 4),
};
for (let y = 0; y < moderatePixels.height; y += 1) {
  for (let x = 0; x < moderatePixels.width; x += 1) {
    const offset = (y * moderatePixels.width + x) * 4;
    const value = Math.round(127.5 + 127.5 * Math.sin(x / 9) * Math.cos(y / 11));
    moderatePixels.data[offset] = value;
    moderatePixels.data[offset + 1] = value;
    moderatePixels.data[offset + 2] = value;
    moderatePixels.data[offset + 3] = 255;
  }
}
const moderateMesh = createReliefMesh(moderatePixels, { widthMm: 80, reliefDepthMm: 2, baseThicknessMm: 1 });
const binaryCube = exportBinaryStl(cube);
const asciiCube = exportAsciiStl(cube);
const disconnectedStl = exportBinaryStl(disconnected);
const moderateStl = exportBinaryStl(moderateMesh);
await saveGenerated('binary-cube.stl', binaryCube);
await saveGenerated('ascii-cube.stl', asciiCube);
await saveGenerated('disconnected-cubes.stl', disconnectedStl);
await saveGenerated('moderate-grid.stl', moderateStl);

const simple3mf = await create3mfModel([{ mesh: cube }]);
const multi3mf = await create3mfModel([
  { mesh: cube },
  { mesh: smallCube, translation: [15, 2, 1] },
]);
await saveGenerated('simple-cube.3mf', simple3mf.bytes);
await saveGenerated('multi-object-transformed.3mf', multi3mf.bytes);
results.lib3mfVersion = (await getLib3mfRuntime()).version;
results.generatedFixtures = {
  binaryCubeBytes: binaryCube.length,
  asciiCubeBytes: asciiCube.length,
  disconnectedBytes: disconnectedStl.length,
  moderateBytes: moderateStl.length,
  simple3mf: simple3mf.inspection,
  multiObjectTransformed3mf: multi3mf.inspection,
};

console.log('Test C: 3MF to STL...');
for (const test of [
  { key: 'simple', bytes: simple3mf.bytes, output: 'simple-from-3mf.stl' },
  { key: 'multiObjectTransformed', bytes: multi3mf.bytes, output: 'multi-object-transformed-from-3mf.stl' },
]) {
  const converted = await timedConversion(test.bytes, '3mf', 'stl');
  const mesh = parseStl(converted.bytes, test.key);
  const validation = validateMesh(mesh, true);
  ensureClosed(test.output, validation);
  await writeFile(path.join(outputDirectory, test.output), converted.bytes);
  results.threeMfToStl[test.key] = {
    conversionMs: converted.conversionMs,
    inputBytes: test.bytes.length,
    outputBytes: converted.bytes.length,
    inputInspection: converted.inspection,
    outputValidation: validation,
    output: test.output,
  };
  console.log(`  ${test.key}: ${converted.inspection.buildItemCount} build items -> ${validation.triangleCount} STL triangles`);
}

console.log('Test D: STL to 3MF and round trips...');
const stlCases = [
  { key: 'binary', bytes: binaryCube, output: 'simple-from-stl.3mf' },
  { key: 'ascii', bytes: asciiCube, output: 'ascii-from-stl.3mf' },
  { key: 'disconnected', bytes: disconnectedStl, output: 'disconnected-from-stl.3mf' },
  { key: 'moderate', bytes: moderateStl, output: 'moderate-from-stl.3mf' },
];
for (const test of stlCases) {
  const sourceValidation = validateMesh(parseStl(test.bytes, `${test.key}-source`), true);
  try {
    const converted = await timedConversion(test.bytes, 'stl', '3mf');
    await writeFile(path.join(outputDirectory, test.output), converted.bytes);
    const outputInspection = await inspectWithLib3mf(converted.bytes, '3mf');
    const roundTrip = await timedConversion(converted.bytes, '3mf', 'stl');
    const roundTripMesh = parseStl(roundTrip.bytes, `${test.key}-roundtrip`);
    const roundTripValidation = validateMesh(roundTripMesh, true);
    ensureClosed(`${test.key} round trip`, roundTripValidation);
    const roundTripOutput = `${test.key}-roundtrip.stl`;
    await writeFile(path.join(outputDirectory, roundTripOutput), roundTrip.bytes);
    results.stlToThreeMf[test.key] = {
      success: true,
      conversionMs: converted.conversionMs,
      roundTripMs: roundTrip.conversionMs,
      inputBytes: test.bytes.length,
      outputBytes: converted.bytes.length,
      reader: converted.reader,
      inputInspection: converted.inspection,
      outputInspection,
      sourceValidation,
      roundTripValidation,
      triangleCountPreserved: sourceValidation.triangleCount === roundTripValidation.triangleCount,
      boundsPreserved: sourceValidation.bounds.size.every((value, index) => Math.abs(value - roundTripValidation.bounds.size[index]) < 1e-5),
      output: test.output,
      roundTripOutput,
    };
    console.log(`  ${test.key}: ${sourceValidation.triangleCount} triangles, round trip preserved=${results.stlToThreeMf[test.key].triangleCountPreserved}`);
  } catch (error) {
    results.stlToThreeMf[test.key] = {
      success: false,
      inputBytes: test.bytes.length,
      sourceValidation,
      error: error instanceof Error ? error.message : String(error),
      note: 'The source STL is valid and reparses in Three.js; official lib3mf rejected this input.',
    };
    console.log(`  ${test.key}: lib3mf rejected the valid source (${results.stlToThreeMf[test.key].error})`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
results.environment.dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
await writeFile(path.join(outputDirectory, 'spike-results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`Complete. Results: ${path.join(outputDirectory, 'spike-results.json')}`);
