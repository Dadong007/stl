import type { IndexedMesh, PixelBuffer } from './types';

export interface ReliefOptions {
  widthMm?: number;
  reliefDepthMm?: number;
  baseThicknessMm?: number;
  invert?: boolean;
}

export function createReliefMesh(
  pixels: PixelBuffer,
  options: ReliefOptions = {},
): IndexedMesh {
  const { width, height, data } = pixels;
  if (width < 2 || height < 2 || data.length !== width * height * 4) {
    throw new Error('Relief input must be an RGBA image at least 2 x 2 pixels.');
  }

  const widthMm = options.widthMm ?? 100;
  const reliefDepthMm = options.reliefDepthMm ?? 3;
  const baseThicknessMm = options.baseThicknessMm ?? 1.5;
  const heightMm = widthMm * (height / width);
  const perimeter: number[] = [];

  for (let x = 0; x < width; x += 1) perimeter.push(x);
  for (let y = 1; y < height; y += 1) perimeter.push(y * width + width - 1);
  for (let x = width - 2; x >= 0; x -= 1) perimeter.push((height - 1) * width + x);
  for (let y = height - 2; y > 0; y -= 1) perimeter.push(y * width);

  const topVertexCount = width * height;
  const bottomStart = topVertexCount;
  const bottomCenter = bottomStart + perimeter.length;
  const positions = new Float32Array((bottomCenter + 1) * 3);

  for (let row = 0; row < height; row += 1) {
    const y = heightMm / 2 - (row / (height - 1)) * heightMm;
    for (let column = 0; column < width; column += 1) {
      const vertex = row * width + column;
      const source = vertex * 4;
      const luminance = (
        0.2126 * data[source] +
        0.7152 * data[source + 1] +
        0.0722 * data[source + 2]
      ) / 255;
      const normalizedHeight = options.invert ? 1 - luminance : luminance;
      positions[vertex * 3] = -widthMm / 2 + (column / (width - 1)) * widthMm;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = baseThicknessMm + normalizedHeight * reliefDepthMm;
    }
  }

  for (let index = 0; index < perimeter.length; index += 1) {
    const top = perimeter[index];
    const bottom = bottomStart + index;
    positions[bottom * 3] = positions[top * 3];
    positions[bottom * 3 + 1] = positions[top * 3 + 1];
    positions[bottom * 3 + 2] = 0;
  }
  positions[bottomCenter * 3] = 0;
  positions[bottomCenter * 3 + 1] = 0;
  positions[bottomCenter * 3 + 2] = 0;

  const topTriangleCount = 2 * (width - 1) * (height - 1);
  const triangleCount = topTriangleCount + 3 * perimeter.length;
  const indices = new Uint32Array(triangleCount * 3);
  let cursor = 0;
  const add = (a: number, b: number, c: number): void => {
    indices[cursor++] = a;
    indices[cursor++] = b;
    indices[cursor++] = c;
  };

  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const topLeft = row * width + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;
      add(topLeft, bottomLeft, topRight);
      add(topRight, bottomLeft, bottomRight);
    }
  }

  for (let index = 0; index < perimeter.length; index += 1) {
    const next = (index + 1) % perimeter.length;
    const topA = perimeter[index];
    const topB = perimeter[next];
    const bottomA = bottomStart + index;
    const bottomB = bottomStart + next;
    // The perimeter runs clockwise, so its left side is the exterior wall normal.
    add(bottomA, topA, topB);
    add(bottomA, topB, bottomB);
    add(bottomCenter, bottomA, bottomB);
  }

  return {
    positions,
    indices,
    name: `relief-${width}x${height}`,
    componentCount: 1,
    holeCount: 0,
    strategy: 'height-field',
  };
}
