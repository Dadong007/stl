import type { PixelBuffer } from './types';

export async function decodeImage(blob: Blob, longestDimension: number): Promise<PixelBuffer> {
  const bitmap = await createImageBitmap(blob);
  const scale = longestDimension / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(2, Math.round(bitmap.width * scale));
  const height = Math.max(2, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const image = context.getImageData(0, 0, width, height);
  return { width, height, data: image.data };
}
