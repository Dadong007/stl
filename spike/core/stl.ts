import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { IndexedMesh } from './types';

export function meshToThreeGeometry(mesh: IndexedMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function exportBinaryStl(mesh: IndexedMesh): Uint8Array {
  const geometry = meshToThreeGeometry(mesh);
  const object = new THREE.Mesh(geometry);
  object.name = mesh.name;
  const dataView = new STLExporter().parse(object, { binary: true }) as DataView;
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength).slice();
  geometry.dispose();
  return bytes;
}

export function exportAsciiStl(mesh: IndexedMesh): Uint8Array {
  const geometry = meshToThreeGeometry(mesh);
  const object = new THREE.Mesh(geometry);
  object.name = mesh.name;
  const text = new STLExporter().parse(object, { binary: false }) as string;
  geometry.dispose();
  return new TextEncoder().encode(text);
}

export function parseStl(bytes: Uint8Array, name = 'parsed-stl'): IndexedMesh {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const geometry = new STLLoader().parse(arrayBuffer);
  const attribute = geometry.getAttribute('position');
  const positions: number[] = [];
  const indices = new Uint32Array(attribute.count);
  const vertexMap = new Map<string, number>();

  for (let index = 0; index < attribute.count; index += 1) {
    const x = attribute.getX(index);
    const y = attribute.getY(index);
    const z = attribute.getZ(index);
    const key = `${x.toPrecision(9)},${y.toPrecision(9)},${z.toPrecision(9)}`;
    let vertex = vertexMap.get(key);
    if (vertex === undefined) {
      vertex = positions.length / 3;
      vertexMap.set(key, vertex);
      positions.push(x, y, z);
    }
    indices[index] = vertex;
  }
  geometry.dispose();
  return { positions: Float32Array.from(positions), indices, name, strategy: 'parsed' };
}
