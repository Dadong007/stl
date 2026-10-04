import type { Bounds, IndexedMesh, MeshValidation } from './types';

export function calculateBounds(positions: ArrayLike<number>): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

export function validateMesh(mesh: IndexedMesh, checkEdges = true): MeshValidation {
  let finiteCoordinates = true;
  for (const coordinate of mesh.positions) {
    if (!Number.isFinite(coordinate)) finiteCoordinates = false;
  }
  let degenerateTriangles = 0;
  const edgeCounts = new Map<bigint, number>();
  const addEdge = (a: number, b: number): void => {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const key = (BigInt(low) << 32n) | BigInt(high);
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  };

  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index];
    const b = mesh.indices[index + 1];
    const c = mesh.indices[index + 2];
    const ax = mesh.positions[a * 3];
    const ay = mesh.positions[a * 3 + 1];
    const az = mesh.positions[a * 3 + 2];
    const abx = mesh.positions[b * 3] - ax;
    const aby = mesh.positions[b * 3 + 1] - ay;
    const abz = mesh.positions[b * 3 + 2] - az;
    const acx = mesh.positions[c * 3] - ax;
    const acy = mesh.positions[c * 3 + 1] - ay;
    const acz = mesh.positions[c * 3 + 2] - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    if (crossX * crossX + crossY * crossY + crossZ * crossZ < 1e-18) {
      degenerateTriangles += 1;
    }
    if (checkEdges) {
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  if (checkEdges) {
    for (const count of edgeCounts.values()) {
      if (count === 1) boundaryEdges += 1;
      else if (count !== 2) nonManifoldEdges += 1;
    }
  }
  return {
    vertexCount: mesh.positions.length / 3,
    triangleCount: mesh.indices.length / 3,
    finiteCoordinates,
    degenerateTriangles,
    boundaryEdges,
    nonManifoldEdges,
    bounds: calculateBounds(mesh.positions),
  };
}
