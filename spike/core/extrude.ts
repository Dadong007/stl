import earcut from 'earcut';
import type { IndexedMesh, PixelBuffer } from './types';
import { validateMesh } from './validate';

export interface ExtrudeOptions {
  widthMm?: number;
  depthMm?: number;
  maskMode?: 'alpha' | 'dark-on-light';
  alphaThreshold?: number;
  luminanceThreshold?: number;
  minimumRegionPixels?: number;
  contourTolerancePixels?: number;
}

interface GridPoint {
  x: number;
  y: number;
}

interface Component {
  pixels: number[];
}

function signedArea(points: GridPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function pointInPolygon(point: GridPoint, polygon: GridPoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y);
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function resolveDiagonalTouches(mask: Uint8Array, width: number, height: number): void {
  // A checkerboard 2x2 block creates a point-only contour junction. Filling one
  // corner changes the raster by one pixel and prevents non-manifold STL vertices.
  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const topLeft = row * width + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;
      if (mask[topLeft] && mask[bottomRight] && !mask[topRight] && !mask[bottomLeft]) {
        mask[topRight] = 1;
      } else if (!mask[topLeft] && !mask[bottomRight] && mask[topRight] && mask[bottomLeft]) {
        mask[topLeft] = 1;
      }
    }
  }
}

function removeCollinear(points: GridPoint[]): GridPoint[] {
  if (points.length <= 3) return points;
  let current = points;
  let changed = true;
  while (changed && current.length > 3) {
    changed = false;
    const simplified: GridPoint[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const previous = current[(index - 1 + current.length) % current.length];
      const point = current[index];
      const next = current[(index + 1) % current.length];
      const cross =
        (point.x - previous.x) * (next.y - point.y) -
        (point.y - previous.y) * (next.x - point.x);
      if (cross === 0) changed = true;
      else simplified.push(point);
    }
    current = simplified;
  }
  return current;
}

function pointSegmentDistanceSquared(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projectedX = start.x + t * dx;
  const projectedY = start.y + t * dy;
  return (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;
}

function simplifyOpen(points: GridPoint[], tolerance: number): GridPoint[] {
  if (points.length <= 2) return points;
  let farthestIndex = -1;
  let farthestDistance = tolerance * tolerance;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistanceSquared(points[index], points[0], points.at(-1)!);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  if (farthestIndex < 0) return [points[0], points.at(-1)!];
  const left = simplifyOpen(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyOpen(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyLoop(points: GridPoint[], tolerance: number): GridPoint[] {
  const collinearRemoved = removeCollinear(points);
  if (collinearRemoved.length <= 3 || tolerance <= 0) return collinearRemoved;
  let first = 0;
  let second = 1;
  let greatestDistance = -1;
  for (let index = 1; index < collinearRemoved.length; index += 1) {
    const dx = collinearRemoved[index].x - collinearRemoved[0].x;
    const dy = collinearRemoved[index].y - collinearRemoved[0].y;
    const distance = dx * dx + dy * dy;
    if (distance > greatestDistance) {
      greatestDistance = distance;
      second = index;
    }
  }
  greatestDistance = -1;
  for (let index = 0; index < collinearRemoved.length; index += 1) {
    const dx = collinearRemoved[index].x - collinearRemoved[second].x;
    const dy = collinearRemoved[index].y - collinearRemoved[second].y;
    const distance = dx * dx + dy * dy;
    if (distance > greatestDistance) {
      greatestDistance = distance;
      first = index;
    }
  }
  if (first > second) [first, second] = [second, first];
  const forward = collinearRemoved.slice(first, second + 1);
  const backward = [...collinearRemoved.slice(second), ...collinearRemoved.slice(0, first + 1)];
  const simplified = [
    ...simplifyOpen(forward, tolerance).slice(0, -1),
    ...simplifyOpen(backward, tolerance).slice(0, -1),
  ];
  return simplified.length >= 3 ? removeCollinear(simplified) : collinearRemoved;
}

function findComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: Component[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    const pixels: number[] = [];
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const candidates = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const candidate of candidates) {
        if (candidate >= 0 && mask[candidate] && !visited[candidate]) {
          visited[candidate] = 1;
          queue[tail++] = candidate;
        }
      }
    }
    components.push({ pixels });
  }
  return components;
}

function componentLoops(
  component: Component,
  mask: Uint8Array,
  width: number,
  height: number,
  contourTolerance: number,
): GridPoint[][] {
  const cornerWidth = width + 1;
  const edges: Array<[number, number]> = [];
  const encode = (x: number, y: number): number => y * cornerWidth + x;
  const add = (ax: number, ay: number, bx: number, by: number): void => {
    edges.push([encode(ax, ay), encode(bx, by)]);
  };

  for (const pixel of component.pixels) {
    const column = pixel % width;
    const row = Math.floor(pixel / width);
    const bottom = height - row - 1;
    const top = bottom + 1;
    if (row === 0 || !mask[pixel - width]) add(column, top, column + 1, top);
    if (column + 1 === width || !mask[pixel + 1]) add(column + 1, top, column + 1, bottom);
    if (row + 1 === height || !mask[pixel + width]) add(column + 1, bottom, column, bottom);
    if (column === 0 || !mask[pixel - 1]) add(column, bottom, column, top);
  }

  const outgoing = new Map<number, number[]>();
  edges.forEach(([start], edgeIndex) => {
    const list = outgoing.get(start);
    if (list) list.push(edgeIndex);
    else outgoing.set(start, [edgeIndex]);
  });
  const used = new Uint8Array(edges.length);
  const loops: GridPoint[][] = [];

  for (let firstEdge = 0; firstEdge < edges.length; firstEdge += 1) {
    if (used[firstEdge]) continue;
    const firstCorner = edges[firstEdge][0];
    let edgeIndex = firstEdge;
    const corners: number[] = [];
    while (!used[edgeIndex]) {
      used[edgeIndex] = 1;
      const [start, end] = edges[edgeIndex];
      corners.push(start);
      if (end === firstCorner) break;
      const candidates = outgoing.get(end)?.filter((candidate) => !used[candidate]) ?? [];
      const incomingX = (end % cornerWidth) - (start % cornerWidth);
      const incomingY = Math.floor(end / cornerWidth) - Math.floor(start / cornerWidth);
      const direction = (x: number, y: number): number => {
        if (x > 0) return 0;
        if (y > 0) return 1;
        if (x < 0) return 2;
        return 3;
      };
      const incomingDirection = direction(incomingX, incomingY);
      const turnPriority = [1, 2, 3, 0]; // straight, left, back, right indexed by CCW delta
      candidates.sort((left, right) => {
        const leftEnd = edges[left][1];
        const rightEnd = edges[right][1];
        const leftDirection = direction(
          (leftEnd % cornerWidth) - (end % cornerWidth),
          Math.floor(leftEnd / cornerWidth) - Math.floor(end / cornerWidth),
        );
        const rightDirection = direction(
          (rightEnd % cornerWidth) - (end % cornerWidth),
          Math.floor(rightEnd / cornerWidth) - Math.floor(end / cornerWidth),
        );
        return turnPriority[(leftDirection - incomingDirection + 4) % 4]
          - turnPriority[(rightDirection - incomingDirection + 4) % 4];
      });
      const next = candidates[0];
      if (next === undefined) {
        throw new Error('Contour extraction produced an open boundary.');
      }
      edgeIndex = next;
    }
    if (corners.length >= 3) {
      loops.push(simplifyLoop(corners.map((corner) => ({
        x: corner % cornerWidth,
        y: Math.floor(corner / cornerWidth),
      })), contourTolerance));
    }
  }
  return loops;
}

export function createMask(pixels: PixelBuffer, options: ExtrudeOptions = {}): Uint8Array {
  const mode = options.maskMode ?? 'alpha';
  const alphaThreshold = options.alphaThreshold ?? 128;
  const luminanceThreshold = options.luminanceThreshold ?? 220;
  const mask = new Uint8Array(pixels.width * pixels.height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const source = pixel * 4;
    const alpha = pixels.data[source + 3];
    const luminance =
      0.2126 * pixels.data[source] +
      0.7152 * pixels.data[source + 1] +
      0.0722 * pixels.data[source + 2];
    mask[pixel] = mode === 'alpha'
      ? Number(alpha >= alphaThreshold)
      : Number(alpha >= alphaThreshold && luminance <= luminanceThreshold);
  }
  return mask;
}

function createSharedRasterExtrusion(
  mask: Uint8Array,
  width: number,
  height: number,
  widthMm: number,
  depthMm: number,
  componentCount: number,
  holeCount: number,
): IndexedMesh {
  const scale = widthMm / width;
  const heightMm = height * scale;
  const positions: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<number, [number, number]>();
  const cornerWidth = width + 1;
  const vertexPair = (x: number, y: number): [number, number] => {
    const key = y * cornerWidth + x;
    const existing = vertices.get(key);
    if (existing) return existing;
    const px = x * scale - widthMm / 2;
    const py = y * scale - heightMm / 2;
    const top = positions.length / 3;
    positions.push(px, py, depthMm);
    const bottom = positions.length / 3;
    positions.push(px, py, 0);
    const pair: [number, number] = [top, bottom];
    vertices.set(key, pair);
    return pair;
  };

  const wall = (start: [number, number], end: [number, number]): void => {
    const [topA, bottomA] = start;
    const [topB, bottomB] = end;
    indices.push(bottomA, topA, topB, bottomA, topB, bottomB);
  };

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const pixel = row * width + column;
      if (!mask[pixel]) continue;
      const bottomY = height - row - 1;
      const topY = bottomY + 1;
      const topLeft = vertexPair(column, topY);
      const topRight = vertexPair(column + 1, topY);
      const bottomRight = vertexPair(column + 1, bottomY);
      const bottomLeft = vertexPair(column, bottomY);

      indices.push(
        topLeft[0], bottomLeft[0], topRight[0],
        topRight[0], bottomLeft[0], bottomRight[0],
        topLeft[1], topRight[1], bottomLeft[1],
        topRight[1], bottomRight[1], bottomLeft[1],
      );
      if (row === 0 || !mask[pixel - width]) wall(topLeft, topRight);
      if (column + 1 === width || !mask[pixel + 1]) wall(topRight, bottomRight);
      if (row + 1 === height || !mask[pixel + width]) wall(bottomRight, bottomLeft);
      if (column === 0 || !mask[pixel - 1]) wall(bottomLeft, topLeft);
    }
  }

  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    name: 'extruded-image-raster-fallback',
    componentCount,
    holeCount,
    strategy: 'shared-raster-fallback',
  };
}

export function createExtrudedMesh(
  pixels: PixelBuffer,
  options: ExtrudeOptions = {},
): IndexedMesh {
  const { width, height } = pixels;
  if (width < 2 || height < 2 || pixels.data.length !== width * height * 4) {
    throw new Error('Extrude input must be an RGBA image at least 2 x 2 pixels.');
  }
  const widthMm = options.widthMm ?? 100;
  const depthMm = options.depthMm ?? 3;
  const minimumRegionPixels = options.minimumRegionPixels ?? 4;
  const contourTolerance = options.contourTolerancePixels ?? 1.5;
  const mask = createMask(pixels, options);
  resolveDiagonalTouches(mask, width, height);
  const components = findComponents(mask, width, height)
    .filter((component) => component.pixels.length >= minimumRegionPixels);
  if (components.length === 0) throw new Error('No foreground regions were found.');

  const positions: number[] = [];
  const indices: number[] = [];
  let holeCount = 0;
  const scale = widthMm / width;
  const heightMm = height * scale;

  const addOrientedFace = (a: number, b: number, c: number, positiveZ: boolean): void => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if ((cross > 0) === positiveZ) indices.push(a, b, c);
    else indices.push(a, c, b);
  };

  for (const component of components) {
    const extracted = componentLoops(component, mask, width, height, contourTolerance)
      .filter((loop) => loop.length >= 3);
    const outers = extracted.filter((loop) => signedArea(loop) < 0)
      .sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)));
    const holes = extracted.filter((loop) => signedArea(loop) > 0);
    const polygonGroups = outers.map((outer) => [outer]);
    for (const hole of holes) {
      const containingOuter = outers.findIndex((outer) => pointInPolygon(hole[0], outer));
      if (containingOuter >= 0) {
        polygonGroups[containingOuter].push(hole);
        holeCount += 1;
      }
    }

    for (const loops of polygonGroups) {

      const flattened: number[] = [];
      const holeStarts: number[] = [];
      const contourStarts: number[] = [];
      let localCount = 0;
      loops.forEach((loop, loopIndex) => {
        contourStarts.push(localCount);
        if (loopIndex > 0) holeStarts.push(localCount);
        for (const point of loop) {
          flattened.push(point.x * scale - widthMm / 2, point.y * scale - heightMm / 2);
          localCount += 1;
        }
      });

      const topStart = positions.length / 3;
      for (let index = 0; index < localCount; index += 1) {
        positions.push(flattened[index * 2], flattened[index * 2 + 1], depthMm);
      }
      const bottomStart = positions.length / 3;
      for (let index = 0; index < localCount; index += 1) {
        positions.push(flattened[index * 2], flattened[index * 2 + 1], 0);
      }

      const faceTriangles = earcut(flattened, holeStarts, 2);
      for (let index = 0; index < faceTriangles.length; index += 3) {
        const a = faceTriangles[index];
        const b = faceTriangles[index + 1];
        const c = faceTriangles[index + 2];
        addOrientedFace(topStart + a, topStart + b, topStart + c, true);
        addOrientedFace(bottomStart + a, bottomStart + b, bottomStart + c, false);
      }

      loops.forEach((loop, loopIndex) => {
        const contourStart = contourStarts[loopIndex];
        for (let pointIndex = 0; pointIndex < loop.length; pointIndex += 1) {
          const next = (pointIndex + 1) % loop.length;
          const topA = topStart + contourStart + pointIndex;
          const topB = topStart + contourStart + next;
          const bottomA = bottomStart + contourStart + pointIndex;
          const bottomB = bottomStart + contourStart + next;
          indices.push(bottomA, topA, topB, bottomA, topB, bottomB);
        }
      });
    }
  }

  if (indices.length === 0) throw new Error('Foreground contours did not produce geometry.');
  const contourMesh: IndexedMesh = {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    name: 'extruded-image',
    componentCount: components.length,
    holeCount,
    strategy: 'contour',
  };
  const contourValidation = validateMesh(contourMesh, true);
  if (
    contourValidation.finiteCoordinates &&
    contourValidation.degenerateTriangles === 0 &&
    contourValidation.boundaryEdges === 0 &&
    contourValidation.nonManifoldEdges === 0
  ) {
    return contourMesh;
  }
  return createSharedRasterExtrusion(
    mask,
    width,
    height,
    widthMm,
    depthMm,
    components.length,
    holeCount,
  );
}
