# IntoSTL — Phase 1 Production Report

## 1. Final project structure

```text
intostl/
├─ public/
│  ├─ favicon.svg
│  └─ robots.txt
├─ scripts/
│  ├─ browser-smoke.mjs
│  ├─ production-browser-smoke.mjs
│  └─ run-spike.ts
├─ spike/                         # preserved validation harness and engines
├─ src/
│  ├─ components/converter/
│  │  ├─ ImageConverter.tsx
│  │  ├─ MeshPreview.tsx
│  │  ├─ ThreeMfConverter.tsx
│  │  ├─ UploadField.tsx
│  │  └─ fileHelpers.ts
│  ├─ config/site.ts
│  ├─ engines/
│  │  ├─ formats/{stl,threeMf}.ts
│  │  └─ image/index.ts
│  ├─ layouts/BaseLayout.astro
│  ├─ pages/{index,image-to-stl,3mf-to-stl}.astro
│  └─ styles/global.css
├─ test-assets/                   # preserved
├─ test-output/                   # preserved; Phase 1 evidence added
├─ AGENTS.md
├─ astro.config.mjs
├─ package.json
├─ THIRD_PARTY_LICENSES.md
└─ vite.config.ts                # preserved spike configuration
```

Astro owns the document shell, navigation, SEO content, schema and footer. React is limited to the two converter islands. Geometry and file-format logic remains outside the UI.

## 2. Installed production dependency versions

| Dependency | Exact installed version | Purpose |
| --- | --- | --- |
| `astro` | `7.3.5` | Static site build |
| `@astrojs/react` | `7.0.0` | Converter islands |
| `@astrojs/sitemap` | `3.7.4` | Static sitemap generation |
| `react` / `react-dom` | `19.3.0` | Interactive converter UI only |
| `three` | `0.185.1` | Binary STL export/read and 3D preview |
| `earcut` | `3.0.2` | Proven Extrude triangulation |
| `@3mfconsortium/lib3mf` | **`2.5.0-fix.2`** | Browser-local 3MF conversion; still pinned exactly |

`@astrojs/check` `0.9.10` is installed as a development-only production type/content checker. Existing spike-only development packages remain installed and documented.

## 3. Routes created

- `/`
- `/image-to-stl/`
- `/3mf-to-stl/`

The Astro build generated exactly these three HTML routes.

## 4. Spike code reused

The production engine entry points are intentionally thin re-exports of the validated modules in `spike/core/`:

- `relief.ts` for the closed height-field, base and perimeter walls.
- `extrude.ts` for alpha/threshold masking, contours, holes, disconnected regions and topology-gated shared-raster fallback.
- `image-browser.ts` for 512-longest-side Canvas decoding.
- `stl.ts` for Three.js binary STL output and STL reading.
- `lib3mf.ts` for official lib3mf WASM conversion, build transforms and multi-object handling.

No validated geometry algorithm was rewritten or behavior-adjusted. The retained spike imports and regression runner still use the original files directly.

## 5. Image to STL behavior

- Accepts `.jpg`, `.jpeg` and `.png` only.
- Rejects files above 20 MB and source dimensions above 4096 × 4096.
- Automatically processes the selected file at a fixed 512-pixel longest-side internal resolution.
- Defaults to Relief, 3 mm depth and 100 mm size, with the validated 1.5 mm base thickness.
- Exposes only Style, Depth and Size controls; changes regenerate the model and preview.
- Extrude chooses alpha masking when any transparency exists, otherwise the proven dark-on-light threshold path.
- Produces binary STL and downloads `original-name.stl`.
- Provides plain-language unsupported-format, size, dimension, decoding, empty-foreground, conversion and detectable memory errors.

Chrome produced and downloaded the 512 relief fixture as `01-photo-relief.stl` (26,161,784 bytes) and the transparent Extrude fixture as `02-transparent-silhouette.stl` (12,284 bytes).

## 6. 3MF to STL behavior

- Accepts `.3mf` files up to 50 MB.
- Initializes the official lib3mf WASM only after file selection.
- Preserves final transformed geometry and combines the validated multiple build items into one binary STL result.
- Parses the result for the shared 3D preview and downloads `original-name.stl`.
- Clearly states that colors, materials, textures and other metadata are not preserved.

Chrome converted the transformed two-object fixture to `multi-object-transformed.stl` (1,284 bytes). The retained regression suite confirmed 24 triangles, two build items, preserved transforms, `20 × 10 × 10 mm` bounds and closed manifold output.

## 7. Performance and lazy loading

- Initial HTML is statically rendered by Astro, including all explanatory and SEO content.
- Converter islands hydrate to expose the upload UI, but image algorithms load only after image selection.
- Three.js preview code is a lazy React component and is not requested until a mesh exists.
- STL and 3MF entry points are separate dynamic chunks, so an image upload does not load lib3mf JavaScript or WASM.
- The 2.23 MB lib3mf WASM is fetched and initialized only for 3MF conversion.
- The preview renders on resize and OrbitControls changes instead of running a permanent animation loop, and disposes controls, geometry, material, renderer and WebGL context when replaced or unmounted.

The validated MVP deliberately remains on the main thread at 512 resolution. No worker or additional state/runtime dependency was added.

## 8. SEO implementation

- Site origin is `https://intostl.com`.
- Every page has a unique title, description, canonical URL, robots directive, Open Graph title/description/URL and exactly one H1.
- All explanatory sections, FAQs and internal links are static Astro HTML and remain crawlable without executing the converter.
- Homepage includes `WebSite` JSON-LD.
- Tool pages include `WebApplication`, `BreadcrumbList` and visible-FAQ-matched `FAQPage` JSON-LD.
- `@astrojs/sitemap` generates `sitemap-index.xml` and `sitemap-0.xml`.
- `public/robots.txt` allows crawling and points to the production sitemap.

## 9. Mobile implementation

- Converter controls and preview stack into one column below 800 px.
- The 390 × 844 Chrome checks completed both tool layouts with no horizontal overflow.
- Upload, selects, numeric controls, orbit/zoom canvas and download buttons retain touch-sized targets.
- Shared typography and layouts remain readable without separate mobile functionality.

## 10. Privacy guarantees

- The implementation contains no backend API, upload endpoint, server conversion, storage, account system or analytics.
- File objects and byte arrays are read directly in the browser and passed only to local Canvas, Three.js and lib3mf/WASM code.
- Downloads use temporary browser `blob:` URLs.
- The browser smoke run observed zero non-local HTTP(S) requests during both conversions. File contents and filenames were not transmitted.

## 11. Build and test results

| Check | Result |
| --- | --- |
| `npm run build` (`astro check && astro build`) | PASS — 30 files checked; 0 errors, 0 warnings, 0 hints; 3 static pages generated |
| `npm run spike` | PASS — Relief, Extrude, 3MF→STL, binary/ASCII/disconnected STL→3MF and round trips |
| Existing `scripts/browser-smoke.mjs` in Chrome 154 | PASS — no page errors; all topology/transform checks passed |
| `npm run smoke:production` in Chrome 154 | PASS — both end-to-end flows, previews and downloads; 0 console errors, 0 page errors, 0 external requests |
| Desktop visual check | PASS — homepage and both tool pages inspected from captured screenshots |
| Mobile visual/overflow check | PASS — both converter pages at 390 px; no horizontal overflow |
| Phase 2 route check | PASS — all four prohibited routes return 404 |

Astro telemetry was disabled in the managed local shell because its global settings directory is outside the writable workspace. The production build itself is unaffected. Vite retains the known non-blocking browser-externalization notices from the lib3mf universal package; the resulting browser conversion passed.

## 12. Known limitations

- Image meshing is intentionally fixed at 512 longest-side resolution; 1024 is not exposed.
- Relief derives height from luminance and Extrude uses simple alpha or light-background thresholding; there is no image cleanup or background-removal workflow.
- Thin or antialiased Extrude contours may use the larger validated shared-raster fallback.
- Large conversions can briefly occupy the main browser thread; workers are outside Phase 1 scope.
- STL output cannot retain 3MF colors, materials, textures or document metadata.
- Current browser support requires Canvas, `createImageBitmap`, WebGL and WebAssembly.

## 13. Manual inspection

With `npm run dev` running:

- Homepage: `http://127.0.0.1:4321/`
- Image to STL: `http://127.0.0.1:4321/image-to-stl/`
- 3MF to STL: `http://127.0.0.1:4321/3mf-to-stl/`

Captured evidence:

- `test-output/phase-1-home-desktop.png`
- `test-output/phase-1-image-desktop.png`
- `test-output/phase-1-image-mobile.png`
- `test-output/phase-1-3mf-desktop.png`
- `test-output/phase-1-3mf-mobile.png`
- `test-output/phase-1-browser-results.json`

## 14. Phase 2 scope confirmation

No `/png-to-stl/`, `/jpg-to-stl/`, `/logo-to-stl/` or `/stl-to-3mf/` page, placeholder or navigation link was created. Automated requests confirmed that all four routes return 404.

PHASE 1 STATUS — READY FOR MANUAL REVIEW
