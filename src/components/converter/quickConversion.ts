import type { IndexedMesh } from '../../engines/image';
import { friendlyConversionError } from './fileHelpers';
import {
  hasTransparency,
  IMAGE_DEFAULT_BASE_MM,
  IMAGE_DEFAULT_DEPTH_MM,
  IMAGE_DEFAULT_SIZE_MM,
  IMAGE_INTERNAL_RESOLUTION,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_DIMENSION,
  inspectImage,
  isSupportedImage,
} from './imageInput';

const THREE_MF_MAX_BYTES = 50 * 1024 * 1024;

export type QuickConversionKind = 'jpg' | 'png' | '3mf';
export type QuickImageMode = 'relief' | 'extrude';
export type QuickConversionMode = QuickImageMode | '3mf';

export interface QuickImageSettings {
  mode: QuickImageMode;
  depthMm: number;
  sizeMm: number;
}

export interface QuickConversionResult {
  kind: QuickConversionKind;
  mode: QuickConversionMode;
  mesh: IndexedMesh;
  stl: Uint8Array;
}

export class QuickConversionError extends Error {}

export function quickFileKind(file: File): QuickConversionKind | null {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (extension === '.jpg' || extension === '.jpeg') return 'jpg';
  if (extension === '.png') return 'png';
  if (extension === '.3mf') return '3mf';
  return null;
}

async function convertImage(
  file: File,
  kind: 'jpg' | 'png',
  settings?: QuickImageSettings,
): Promise<QuickConversionResult> {
  if (!isSupportedImage(file, kind)) {
    throw new QuickConversionError('Choose a JPG, PNG, JPEG, or 3MF file.');
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new QuickConversionError('This image is larger than 20 MB. Choose a smaller file.');
  }

  let inspection: Awaited<ReturnType<typeof inspectImage>>;
  try {
    inspection = await inspectImage(file);
  } catch {
    throw new QuickConversionError('We could not read this image. Try another JPG or PNG file.');
  }
  if (inspection.width > IMAGE_MAX_DIMENSION || inspection.height > IMAGE_MAX_DIMENSION) {
    throw new QuickConversionError('This image is larger than 4096 × 4096 pixels. Resize it and try again.');
  }

  try {
    const [imageEngine, stlEngine] = await Promise.all([
      import('../../engines/image'),
      import('../../engines/formats/stl'),
    ]);
    const pixels = await imageEngine.decodeImage(file, IMAGE_INTERNAL_RESOLUTION);
    const mode: QuickImageMode = settings?.mode
      ?? (kind === 'png' && inspection.meaningfulTransparency ? 'extrude' : 'relief');
    const depthMm = settings?.depthMm ?? IMAGE_DEFAULT_DEPTH_MM;
    const sizeMm = settings?.sizeMm ?? IMAGE_DEFAULT_SIZE_MM;
    const mesh = mode === 'extrude'
      ? imageEngine.createExtrudedMesh(pixels, {
          widthMm: sizeMm,
          depthMm,
          maskMode: hasTransparency(pixels.data) ? 'alpha' : 'dark-on-light',
        })
      : imageEngine.createReliefMesh(pixels, {
          widthMm: sizeMm,
          reliefDepthMm: depthMm,
          baseThicknessMm: IMAGE_DEFAULT_BASE_MM,
        });
    return { kind, mode, mesh, stl: stlEngine.exportBinaryStl(mesh) };
  } catch (error) {
    throw new QuickConversionError(friendlyConversionError(error, 'image'));
  }
}

async function convertThreeMf(file: File): Promise<QuickConversionResult> {
  if (file.size > THREE_MF_MAX_BYTES) {
    throw new QuickConversionError('This 3MF file is larger than 50 MB. Choose a smaller file.');
  }
  try {
    const [threeMfEngine, stlEngine] = await Promise.all([
      import('../../engines/formats/threeMf'),
      import('../../engines/formats/stl'),
    ]);
    const input = new Uint8Array(await file.arrayBuffer());
    const converted = await threeMfEngine.convertWithLib3mf(input, '3mf', 'stl');
    const mesh = stlEngine.parseStl(converted.bytes, file.name);
    return { kind: '3mf', mode: '3mf', mesh, stl: converted.bytes };
  } catch (error) {
    throw new QuickConversionError(friendlyConversionError(error, '3mf'));
  }
}

export async function convertQuickFile(
  file: File,
  imageSettings?: QuickImageSettings,
): Promise<QuickConversionResult> {
  const kind = quickFileKind(file);
  if (!kind) throw new QuickConversionError('Choose a JPG, PNG, JPEG, or 3MF file.');
  return kind === '3mf' ? convertThreeMf(file) : convertImage(file, kind, imageSettings);
}
