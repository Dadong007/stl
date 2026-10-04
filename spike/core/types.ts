export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface IndexedMesh {
  positions: Float32Array;
  indices: Uint32Array;
  name: string;
  componentCount?: number;
  holeCount?: number;
  strategy?: 'height-field' | 'contour' | 'shared-raster-fallback' | 'fixture' | 'parsed';
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export interface MeshValidation {
  vertexCount: number;
  triangleCount: number;
  finiteCoordinates: boolean;
  degenerateTriangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  bounds: Bounds;
}
