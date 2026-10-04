import type { IndexedMesh } from './types';

export function createCuboid(
  name: string,
  size: [number, number, number],
  offset: [number, number, number] = [0, 0, 0],
): IndexedMesh {
  const [sx, sy, sz] = size;
  const [ox, oy, oz] = offset;
  const positions = Float32Array.from([
    ox, oy, oz,
    ox + sx, oy, oz,
    ox + sx, oy + sy, oz,
    ox, oy + sy, oz,
    ox, oy, oz + sz,
    ox + sx, oy, oz + sz,
    ox + sx, oy + sy, oz + sz,
    ox, oy + sy, oz + sz,
  ]);
  const indices = Uint32Array.from([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]);
  return { positions, indices, name, componentCount: 1, holeCount: 0, strategy: 'fixture' };
}

export function combineMeshes(name: string, meshes: IndexedMesh[]): IndexedMesh {
  const positionCount = meshes.reduce((sum, mesh) => sum + mesh.positions.length, 0);
  const indexCount = meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0);
  const positions = new Float32Array(positionCount);
  const indices = new Uint32Array(indexCount);
  let positionOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;
  for (const mesh of meshes) {
    positions.set(mesh.positions, positionOffset);
    for (let index = 0; index < mesh.indices.length; index += 1) {
      indices[indexOffset + index] = mesh.indices[index] + vertexOffset;
    }
    positionOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
    vertexOffset += mesh.positions.length / 3;
  }
  return {
    positions,
    indices,
    name,
    componentCount: meshes.length,
    holeCount: meshes.reduce((sum, mesh) => sum + (mesh.holeCount ?? 0), 0),
    strategy: 'fixture',
  };
}
