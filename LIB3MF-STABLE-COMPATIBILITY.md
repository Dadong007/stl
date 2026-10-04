# IntoSTL — lib3mf Stable Compatibility Retest

## Versions

- Previously tested npm package: `@3mfconsortium/lib3mf` `2.6.0-alpha.2`; the WASM wrapper reported lib3mf core `2.6.0`.
- npm dist-tags at retest time: `latest = 2.5.0-fix.2`, `next = 2.6.0-alpha.2`.
- Stable candidate installed and pinned: `@3mfconsortium/lib3mf` `2.5.0-fix.2`; the wrapper reports core `2.5.0` and its README identifies the official lib3mf `v2.5.0` release artifact.
- Naming note: npm assigns `2.5.0-fix.2` to the production `latest` tag, although the hyphen makes it syntactically prerelease-like under strict SemVer. The package's only published version with no hyphen is `2.4.1`; this retest follows npm's authoritative stable `latest` tag.

## Test results

| Conversion test | Stable result | Geometry result |
| --- | --- | --- |
| A. Simple 3MF → STL | PASS | 12 triangles; `10 × 10 × 10 mm`; successful STL reparse |
| B. Transformed/multi-object 3MF → STL | PASS | 2 objects, 2 build items, 24 triangles; transform preserved; final bounds `20 × 10 × 10 mm` |
| C. Binary STL → 3MF | PASS | 12 triangles; `10 × 10 × 10 mm`; lib3mf reparse and STL round trip passed |
| D. ASCII STL → 3MF | PASS with existing fallback | Official stable reader rejected the valid file; Three.js `STLLoader` fallback plus lib3mf writer preserved 12 triangles and `10 × 10 × 10 mm` |
| E. Disconnected-shell STL → 3MF | PASS | 24 triangles; both shells preserved; bounds `22 × 10 × 10 mm` |
| F. STL → 3MF → read/round trip | PASS | Binary, ASCII, disconnected, and 25,462-triangle moderate fixtures preserved triangle counts and bounds |

Every stable result had finite coordinates, zero degenerate triangles, zero open edges, and zero non-manifold edges after reparse. lib3mf reported the produced meshes as manifold and oriented. Units remained millimeters.

## Alpha versus stable geometry

| Fixture | Alpha expectation | Stable result | Comparison |
| --- | --- | --- | --- |
| Simple 3MF | 12 triangles; `10 × 10 × 10 mm` | 12 triangles; `10 × 10 × 10 mm` | Identical |
| Multi-object/transformed 3MF | 24 triangles; `20 × 10 × 10 mm` | 24 triangles; `20 × 10 × 10 mm` | Identical; transform preserved |
| Binary STL round trip | 12 triangles; `10 × 10 × 10 mm` | 12 triangles; `10 × 10 × 10 mm` | Identical |
| ASCII STL round trip | 12 triangles; `10 × 10 × 10 mm` | 12 triangles; `10 × 10 × 10 mm` | Identical via the same fallback |
| Disconnected shells | 24 triangles; `22 × 10 × 10 mm` | 24 triangles; `22 × 10 × 10 mm` | Identical |
| Moderate STL | 25,462 triangles; `80 × 60 × 3 mm` | 25,462 triangles; `80 × 60 × 3 mm` | Identical |

Serialized 3MF sizes changed by only 1–5 bytes on some fixtures, consistent with package/ZIP serialization differences. No geometry, transform, object-count, unit, or topology difference was observed.

## API differences

No application-facing API difference was encountered. The existing initializer, `CWrapper`, model, reader/writer, mesh, iterator, transform, virtual filesystem, and geometry methods worked without source changes. The stable Vite build emitted a slightly smaller WASM asset: approximately 2.23 MB versus 2.35 MB for the alpha.

No compatibility adjustment was made beyond changing the pinned dependency version in `package.json` and `package-lock.json`.

## ASCII STL fallback

The fallback is still required. A direct call to the stable lib3mf STL reader rejected `test-assets/generated/ascii-cube.stl` with:

`Reading from a stream was not possible`

The existing behavior remains appropriate: Three.js parses rejected ASCII STL, then official lib3mf creates and writes the 3MF. No new workaround was added.

## Build and browser verification

- `npm run build`: PASS with no TypeScript or bundle error. The existing universal-package Node import warnings remain unchanged and are behind browser guards.
- `npm run spike`: PASS, including all conversion and round-trip validations.
- Existing Chrome smoke test: PASS under Headless Chrome `154.0.0.0`; 3MF → STL and disconnected STL → 3MF succeeded, the complete suite finished in about 1.85 seconds, and there were no page errors.

## Production recommendation

The npm `latest` package preserves every conversion behavior and geometry guarantee established by the alpha spike, uses the stable lib3mf `2.5.0` core artifact, builds in Vite, and runs successfully in Chrome. Keeping the alpha provides no demonstrated compatibility advantage. Retain the ASCII fallback and exact-version pin.

PRODUCTION RECOMMENDATION — PIN STABLE 2.5.0-fix.2
