import initializeLib3mf from '@3mfconsortium/lib3mf';
import type { Bounds, IndexedMesh } from './types';
import { parseStl } from './stl';

export interface Lib3mfInspection {
  unit: string;
  meshObjectCount: number;
  buildItemCount: number;
  vertexCount: number;
  triangleCount: number;
  allMeshesManifoldAndOriented: boolean;
  bounds: Bounds | null;
  warnings: number;
}

interface Lib3mfRuntime {
  module: any;
  wrapper: any;
  version: string;
}

let runtimePromise: Promise<Lib3mfRuntime> | undefined;
let fileSequence = 0;

export function getLib3mfRuntime(): Promise<Lib3mfRuntime> {
  runtimePromise ??= initializeLib3mf().then((module) => {
    const wrapper = new module.CWrapper();
    const version = wrapper.GetLibraryVersion();
    return {
      module,
      wrapper,
      version: `${version.Major}.${version.Minor}.${version.Micro}`,
    };
  });
  return runtimePromise;
}

function nextVirtualPath(extension: string): string {
  fileSequence += 1;
  return `/intostl-${Date.now()}-${fileSequence}.${extension}`;
}

function readModel(runtime: Lib3mfRuntime, bytes: Uint8Array, format: '3mf' | 'stl') {
  const path = nextVirtualPath(format);
  runtime.module.FS.writeFile(path, bytes);
  const model = runtime.wrapper.CreateModel();
  const reader = model.QueryReader(format);
  try {
    reader.ReadFromFile(path);
  } finally {
    runtime.module.FS.unlink(path);
  }
  return { model, reader };
}

function transformPoint(transform: any, point: [number, number, number]): [number, number, number] {
  const [x, y, z] = point;
  return [
    x * transform.get_Fields_0_0() + y * transform.get_Fields_1_0() + z * transform.get_Fields_2_0() + transform.get_Fields_3_0(),
    x * transform.get_Fields_0_1() + y * transform.get_Fields_1_1() + z * transform.get_Fields_2_1() + transform.get_Fields_3_1(),
    x * transform.get_Fields_0_2() + y * transform.get_Fields_1_2() + z * transform.get_Fields_2_2() + transform.get_Fields_3_2(),
  ];
}

function inspectLoadedModel(runtime: Lib3mfRuntime, model: any, warnings: number): Lib3mfInspection {
  let meshObjectCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let allMeshesManifoldAndOriented = true;
  const meshes = model.GetMeshObjects();
  while (meshes.MoveNext()) {
    const mesh = meshes.GetCurrentMeshObject();
    meshObjectCount += 1;
    vertexCount += mesh.GetVertexCount();
    triangleCount += mesh.GetTriangleCount();
    allMeshesManifoldAndOriented &&= mesh.IsManifoldAndOriented();
  }

  let buildItemCount = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const buildItems = model.GetBuildItems();
  while (buildItems.MoveNext()) {
    const item = buildItems.GetCurrent();
    buildItemCount += 1;
    const object = item.GetObjectResource();
    if (!object.IsMeshObject()) continue;
    const mesh = model.GetMeshObjectByID(item.GetObjectResourceID());
    const box = mesh.GetOutbox();
    const transform = item.HasObjectTransform()
      ? item.GetObjectTransform()
      : runtime.wrapper.GetIdentityTransform();
    const corners: Array<[number, number, number]> = [];
    for (const x of [box.get_MinCoordinate0(), box.get_MaxCoordinate0()]) {
      for (const y of [box.get_MinCoordinate1(), box.get_MaxCoordinate1()]) {
        for (const z of [box.get_MinCoordinate2(), box.get_MaxCoordinate2()]) {
          corners.push(transformPoint(transform, [x, y, z]));
        }
      }
    }
    for (const corner of corners) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], corner[axis]);
        max[axis] = Math.max(max[axis], corner[axis]);
      }
    }
  }
  const hasBounds = Number.isFinite(min[0]);
  const unitNames = ['micrometer', 'millimeter', 'centimeter', 'inch', 'foot', 'meter'];
  return {
    unit: unitNames[model.GetUnit().value] ?? `unknown-${model.GetUnit().value}`,
    meshObjectCount,
    buildItemCount,
    vertexCount,
    triangleCount,
    allMeshesManifoldAndOriented,
    bounds: hasBounds ? {
      min,
      max,
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    } : null,
    warnings,
  };
}

export async function inspectWithLib3mf(
  bytes: Uint8Array,
  format: '3mf' | 'stl',
): Promise<Lib3mfInspection> {
  const runtime = await getLib3mfRuntime();
  const { model, reader } = readModel(runtime, bytes, format);
  return inspectLoadedModel(runtime, model, reader.GetWarningCount());
}

export async function convertWithLib3mf(
  bytes: Uint8Array,
  inputFormat: '3mf' | 'stl',
  outputFormat: '3mf' | 'stl',
): Promise<{ bytes: Uint8Array; inspection: Lib3mfInspection; version: string; reader: 'lib3mf' | 'three-stl-loader-fallback' }> {
  const runtime = await getLib3mfRuntime();
  let loaded: ReturnType<typeof readModel>;
  try {
    loaded = readModel(runtime, bytes, inputFormat);
  } catch (error) {
    const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256))).trimStart();
    if (inputFormat === 'stl' && outputFormat === '3mf' && prefix.startsWith('solid')) {
      const mesh = parseStl(bytes, 'ascii-stl-fallback');
      const created = await create3mfModel([{ mesh }]);
      return { ...created, reader: 'three-stl-loader-fallback' };
    }
    throw error;
  }
  const { model, reader } = loaded;
  const inspection = inspectLoadedModel(runtime, model, reader.GetWarningCount());
  const outputPath = nextVirtualPath(outputFormat);
  const writer = model.QueryWriter(outputFormat);
  writer.WriteToFile(outputPath);
  const output = (runtime.module.FS.readFile(outputPath) as Uint8Array).slice();
  runtime.module.FS.unlink(outputPath);
  return { bytes: output, inspection, version: runtime.version, reader: 'lib3mf' };
}

function fillMeshGeometry(module: any, target: any, mesh: IndexedMesh): void {
  const vertices = new module['std$$vector$sPosition$']();
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const position = new module.sPosition();
    position.set_Coordinates0(mesh.positions[index]);
    position.set_Coordinates1(mesh.positions[index + 1]);
    position.set_Coordinates2(mesh.positions[index + 2]);
    vertices.push_back(position);
    position.delete();
  }
  const triangles = new module['std$$vector$sTriangle$']();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const triangle = new module.sTriangle();
    triangle.set_Indices0(mesh.indices[index]);
    triangle.set_Indices1(mesh.indices[index + 1]);
    triangle.set_Indices2(mesh.indices[index + 2]);
    triangles.push_back(triangle);
    triangle.delete();
  }
  target.SetGeometry(vertices, triangles);
  vertices.delete();
  triangles.delete();
}

export async function create3mfModel(
  entries: Array<{ mesh: IndexedMesh; translation?: [number, number, number] }>,
): Promise<{ bytes: Uint8Array; inspection: Lib3mfInspection; version: string }> {
  const runtime = await getLib3mfRuntime();
  const model = runtime.wrapper.CreateModel();
  model.SetUnit(runtime.module.eModelUnit.MilliMeter);
  for (const entry of entries) {
    const object = model.AddMeshObject();
    object.SetName(entry.mesh.name);
    fillMeshGeometry(runtime.module, object, entry.mesh);
    const transform = entry.translation
      ? runtime.wrapper.GetTranslationTransform(...entry.translation)
      : runtime.wrapper.GetIdentityTransform();
    model.AddBuildItem(object, transform);
  }
  const outputPath = nextVirtualPath('3mf');
  model.QueryWriter('3mf').WriteToFile(outputPath);
  const output = (runtime.module.FS.readFile(outputPath) as Uint8Array).slice();
  runtime.module.FS.unlink(outputPath);
  return {
    bytes: output,
    inspection: inspectLoadedModel(runtime, model, 0),
    version: runtime.version,
  };
}
