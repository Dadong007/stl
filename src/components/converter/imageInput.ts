export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 4096;
export const IMAGE_INTERNAL_RESOLUTION = 512;
export const IMAGE_DEFAULT_DEPTH_MM = 3;
export const IMAGE_DEFAULT_SIZE_MM = 100;
export const IMAGE_DEFAULT_BASE_MM = 1.5;

export type AcceptedImageInput = 'image' | 'png' | 'jpg';

export function isSupportedImage(file: File, acceptedInput: AcceptedImageInput): boolean {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (acceptedInput === 'png') return extension === '.png';
  if (acceptedInput === 'jpg') return extension === '.jpg' || extension === '.jpeg';
  return extension === '.jpg' || extension === '.jpeg' || extension === '.png';
}

export async function inspectImage(file: File): Promise<{
  width: number;
  height: number;
  meaningfulTransparency: boolean;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    let meaningfulTransparency = false;
    if (file.name.toLowerCase().endsWith('.png')
      && bitmap.width <= IMAGE_MAX_DIMENSION
      && bitmap.height <= IMAGE_MAX_DIMENSION) {
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const minimumTransparentPixels = Math.max(8, Math.ceil((data.length / 4) * 0.005));
      let transparentPixels = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] < 250 && ++transparentPixels >= minimumTransparentPixels) {
          meaningfulTransparency = true;
          break;
        }
      }
    }
    return { width: bitmap.width, height: bitmap.height, meaningfulTransparency };
  } finally {
    bitmap.close();
  }
}

export function hasTransparency(data: ArrayLike<number>): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true;
  }
  return false;
}
