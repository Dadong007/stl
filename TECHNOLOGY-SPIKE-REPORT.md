# IntoSTL Technology Spike — Phase 0

## Environment

- Windows x64; Node `v24.15.0`; npm `11.12.1`.
- Browser verification: Headless Chrome `154.0.0.0`, 12 logical CPUs, Vite dev server on localhost. The complete browser suite finished in 2.05 s with no page errors and made no non-local data requests.
- Core versions: Three.js `0.185.1`, `@3mfconsortium/lib3mf` `2.6.0-alpha.2` (lib3mf core reports `2.6.0`), Earcut `3.0.2`, Vite `7.1.12`, TypeScript `5.9.3`.
- Raw measurements are in `test-output/spike-results.json` and `test-output/browser-results.json`. `npm run build` and `npm run spike` pass.

## Test A — Relief STL

**Success.** `01-photo-relief.jpg` was converted to a closed height-field solid with a flat base, perimeter walls, 100 mm width, preserved aspect ratio, 3 mm relief, and 1.5 mm base.

| Internal grid | Triangles | STL size | Node mesh + export | Chrome mesh + export |
| --- | ---: | ---: | ---: | ---: |
| 512 × 507 | 523,234 | 26.16 MB | 15.9 + 127.7 ms | 12.1 + 167.6 ms |
| 1024 × 1014 | 2,084,814 | 104.24 MB | 52.3 + 478.2 ms | 31.2 + 695.4 ms |

The 512 mesh and its reparsed STL have zero degenerate triangles, open edges, or non-manifold edges; bounds are `100 × 99.023 × 4.5 mm`. The 1024 mesh has finite coordinates and zero degenerates and uses the identical closed-mesh construction; a second full edge-map/reparse was omitted because it would add substantial memory unrelated to conversion timing.

Recommendation: use 512 on the longest mesh dimension by default. Near-square 1024 creates about 2.1 million triangles, a 104 MB binary STL, and a visible ~0.7 s main-thread pause; it is excessive for the MVP default.

## Test B — Extruded STL

**Success.** Alpha is preferred for transparent images; dark-on-light luminance thresholding handles white backgrounds. Contours are simplified by 1.5 pixels, classified into outer rings and holes, triangulated with Earcut, and extruded with shared front/back vertices and boundary walls.

| Asset / mode | Components | Holes | Triangles | STL size | Topology |
| --- | ---: | ---: | ---: | ---: | --- |
| `02-transparent-silhouette.png` / alpha | 1 | 0 | 236 | 11.9 KB | closed; 0 degenerates |
| `04-white-bg-question.png` / threshold | 2 | 0 | 380 | 19.1 KB | closed; 0 degenerates |
| `05-transparent-room.png` / alpha | 2 | 8 | 1,788 | 89.5 KB | closed; 0 degenerates |

The question mark preserves its detached dot. The room fixture exercises eight internal holes. Chrome Canvas antialiasing produced a contour variant for the thin room graphic that failed the edge-pair check, so the browser correctly switched to a shared-raster surface fallback: 189,948 triangles, 9.50 MB, zero open/non-manifold edges, and the same eight holes. This fallback is not one cube per pixel; adjacent pixels share surface vertices and only the exterior/hole boundaries receive walls.

Limitations: threshold quality depends on foreground/background contrast; very thin, noisy, or antialiased graphics can invoke the larger fallback mesh. The spike does not include AI background removal or editable cleanup controls.

## Test C — 3MF → STL

**Success using official lib3mf WASM.**

- Simple cube: one object/build item, 12 triangles, `10 × 10 × 10 mm`; conversion 14.7 ms in Node.
- Multi-object transformed fixture: two mesh objects and two build items, including a translated `5 mm` cube; final bounds remained `20 × 10 × 10 mm`, 24 triangles; conversion 3.0 ms in Node and 68.1 ms in Chrome including the already-initialized WASM call.
- Both STL results reparse as closed, oriented meshes with zero degenerates/open/non-manifold edges.
- Colors, materials, textures, and 3MF metadata are intentionally not preserved in STL. MVP semantics are final transformed geometry only.

## Test D — STL → 3MF

**Success.** All outputs use millimeters and were reread by lib3mf, converted back to STL, and compared for triangle count and bounds.

| Input | Triangles | Conversion | 3MF size | Reader | Round trip |
| --- | ---: | ---: | ---: | --- | --- |
| Binary cube | 12 | 2.3 ms | 1.61 KB | lib3mf | exact count/bounds |
| ASCII cube | 12 | 5.4 ms | 1.62 KB | Three STLLoader fallback | exact count/bounds |
| Two disconnected shells | 24 | 1.7 ms | 1.75 KB | lib3mf | exact count/bounds |
| Moderate relief fixture | 25,462 | 63.7 ms | 282.9 KB | lib3mf | exact count/bounds |

The official lib3mf STL reader rejected the valid Three.js ASCII STL with `Reading from a stream was not possible`. The implementation detects rejected ASCII input, parses it with Three.js `STLLoader`, then creates and writes the 3MF through official lib3mf. No STL or 3MF format parser was written locally.

## Browser performance

- The browser smoke suite exercised both image modes, 3MF → STL, and STL → 3MF locally in Chrome; total wall time was 2.05 s with no uncaught page errors.
- 512 relief caused a short ~168 ms export task. This is acceptable for an MVP with a busy state.
- 1024 relief caused a ~695 ms export task and a 104 MB output. This is visibly blocking and should not be the default.
- Contour extrusion took 23–27 ms in Chrome. The complex shared-raster fallback took about 41 ms to build; its larger STL is the meaningful cost.
- Browser 3MF → STL took 68 ms for the transformed two-object fixture; disconnected STL → 3MF took 6.8 ms.
- Web Workers are not required for the 512 MVP path. Reconsider a worker before offering 1024 relief or routinely processing large model files.

## Recommended MVP limits

- Source image dimensions: accept up to `4096 × 4096` initially, then always downsample before meshing. This is a conservative decoded-memory guard; the provided source set only reached 1080 px, so log real-world failures before raising it.
- Image file size: 20 MB provisional, combined with the dimension cap. Compressed byte size alone is not a memory limit.
- Internal relief/extrude resolution: 512 longest side default; consider an explicit 768 advanced option later. Do not expose 1024 by default.
- STL/3MF input size: 50 MB initial MVP cap. The spike successfully generated a 104 MB STL but only parsed model fixtures up to 1.27 MB; raise toward 100 MB only after a dedicated large-input memory test on low-memory browsers.
- Generated downloads: warn rather than fail near 100 MB. The measured 1024 relief already crosses that threshold.

## Architecture recommendation

1. **Browser-only processing is viable:** yes. All four paths ran locally with no upload or conversion API.
2. **Three.js is suitable for preview/STL:** yes. `STLExporter` produced valid binary/ASCII STL and `STLLoader` provides the needed ASCII fallback.
3. **Official lib3mf WASM is suitable for production:** conditionally yes. Browser read/write, transforms, multiple objects, disconnected shells, units, and round trips worked. Pin the exact alpha package version, retain reparse tests, and keep the ASCII fallback until the upstream reader accepts the fixture.
4. **Relief approach is suitable:** yes at a 512 internal grid. It creates a predictable, watertight solid without per-pixel cubes.
5. **Extrude approach is suitable:** yes for simple logos/silhouettes. Contour meshes are compact; the topology-gated shared-raster fallback preserves correctness for thin complex holes.
6. **Web Workers are needed for MVP:** no at 512. They become advisable if 1024 relief or much larger files are exposed.
7. **Blockers before Astro:** no technical blocker in these four paths. Manual slicer inspection remains the release gate, and the lib3mf alpha/fallback behavior should stay covered by fixtures.

## Manual slicer checklist

Open these files in OrcaSlicer, PrusaSlicer, or Cura:

1. `test-output/photo-relief-512.stl` — expect a `100 × 99.023 × 4.5 mm` closed plate, flat 1.5 mm base, and visible Earth relief.
2. `test-output/transparent-logo-extrude.stl` — expect one clean silhouette, 3 mm thick, with no stray islands.
3. `test-output/white-bg-logo-extrude.stl` — expect a question mark plus a separate dot, both 3 mm thick.
4. `test-output/transparent-room-hole-extrude.stl` — expect two regions and eight open internal holes; verify the slicer does not fill them.
5. `test-output/multi-object-transformed-from-3mf.stl` — expect two closed cubes with the smaller cube translated; overall bounds `20 × 10 × 10 mm`.
6. `test-output/disconnected-from-stl.3mf` and `test-output/ascii-from-stl.3mf` — expect preserved disconnected shells and a `10 mm` cube respectively, in millimeters.

Programmatic validation passed, but slicer validation is not claimed until a human completes this checklist.

## GO / NO-GO

GO — Ready to build the IntoSTL MVP.
