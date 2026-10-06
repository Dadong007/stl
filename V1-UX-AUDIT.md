# IntoSTL V1 UX Audit

Audit date: 2026-10-05

Scope: current production site at `https://intostl.com` and the current local implementation. The audit covered the homepage and all six production tools at 1280 × 800, 1440 × 900, 390 × 844, and 430 × 932. Valid flows used the repository's existing image, STL, and 3MF fixtures. Invalid-extension, corrupt-file, oversized-file, keyboard, loading, and responsive-layout checks were also performed.

## Executive Summary

IntoSTL is close to V1-ready. The product already feels coherent and restrained, the primary upload → result → preview → download flow works across all six tools, and the current browser-local architecture should remain unchanged. The strongest parts are the clear first-time explanations, useful route-specific defaults, consistent converter shell, readable human-facing status messages, strong mobile layout, and genuinely deferred loading of Three.js and lib3mf.

Four unique findings are classified as **NEEDS FIX**: one P1 correctness/clarity issue and three P2 polish/accessibility issues. Three unique findings are classified as **OPTIONAL**. Counts are deduplicated across pages; a shared issue appearing in several page tables counts once.

- **NEEDS FIX: 4**
- **OPTIONAL: 3**
- **P1: 1**
- **P2: 3**
- **Fundamentally broken conversion flows: none**

The biggest remaining weaknesses are:

1. Image parameter fields can display invalid values while the converter silently uses different clamped values.
2. A malformed STL can be reported as a browser-memory problem instead of an invalid file.
3. At 1280 × 800, the ready-state message can be visible while the enabled Download button remains below the viewport.

The validated conversion engines do not need redesign or refactoring for V1.

## Homepage

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| Immediate understanding | PASS | — | The H1 identifies both image and 3D-file conversion, the supporting line explains printable STL and local processing, and “Choose a tool” begins at about 536 px on 1280 × 800 and 415 px on 390 px mobile. | Do not change the hero message or add another CTA. |
| First-screen visual quality | PASS | — | The header, brand, H1, supporting copy, and first tool row form a clear hierarchy at both desktop sizes. The first mobile card and its action are reachable early without an oversized hero. | Preserve the restrained presentation. |
| Tool discovery | OPTIONAL | — | **O-1:** All cards are individually clear, but the order splits the image-tool family: 3MF to STL appears between PNG to STL and Logo/JPG to STL. This is not a blocker because titles and descriptions remain unambiguous. | If the order is ever touched, group Image/PNG/JPG/Logo before the two format-conversion tools. Do not redesign the cards. |
| Card hierarchy | PASS | — | Card title, description, and underlined action have distinct visual weights; the entire card is one link and keyboard reachable. | Do not enlarge or decorate the cards. |
| Trust messaging | PASS | — | Browser-local, no-account, and printable-output messages are concise, non-repetitive, and directly useful to a first-time user. | Keep the current three-item strip. |
| Mobile homepage | PASS | — | At both 390 px and 430 px there is no horizontal overflow, the H1 wraps cleanly, “Choose a tool” appears well before the first viewport ends, and cards remain easy to scan. | No mobile homepage change is required. |

The homepage is V1-ready. The card-order observation is optional and should not delay the freeze.

## Image to STL

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| First-time clarity | PASS | — | The accepted JPG/PNG inputs, Relief/Extrude result, local processing, and next action are explicit before the converter. | Keep the current intro. |
| Upload experience | NEEDS FIX | P2 | **NF-3:** Keyboard traversal lands on both the styled upload label and the visually hidden file input, creating two focus stops for one action; the second stop has no useful visible focus target. | Keep one keyboard-focusable upload control. The smallest likely fix is to remove the hidden input from the tab order while retaining the labeled keyboard-operable surface. |
| Defaults | PASS | — | JPG starts in Relief; transparent PNG initially selects Extrude; opaque PNG starts in Relief; a manual Style choice is preserved. Default 100 mm size and 3 mm depth produce a useful model. | Do not change the engines or defaults. |
| Parameter validity | NEEDS FIX | P1 | **NF-1:** Depth can display `0` and Size can display `999` while both fields are invalid according to their HTML constraints. Conversion still reaches “ready,” and the engine silently uses 0.5 mm and 300 mm respectively. The displayed settings therefore do not match the generated geometry. | Keep the existing limits, but make the visible values and effective values agree. Normalize or reject out-of-range/blank values before regeneration and download; do not silently clamp behind a different displayed value. |
| State flow | PASS | — | Idle, processing, ready, replacement, and error states have clear live text; old geometry and downloads are cleared when a new file begins. | Preserve the current state model. |
| Preview | PASS | — | Relief and extrusion fixtures are visible, centered, and padded on desktop and narrow viewports; resize and new-model fitting work. OrbitControls remain available. | No viewer redesign is needed. |
| Download | NEEDS FIX | P2 | **NF-4:** On 1280 × 800, the ready status ends near 794 px but the Image to STL button begins near 814 px, entirely below the viewport. The interface announces readiness without showing the next action. | Make the enabled CTA visible with the completion state at this supported desktop size using the smallest spacing/positioning adjustment; do not add sticky UI or new controls. |
| Error experience | PASS | — | Unsupported type, corrupt image, oversized image, no-foreground, and dimension-limit messages use normal language and give a next step. | Keep the current wording pattern. |
| Mobile | PASS | — | At 390 px and 430 px there is no overflow; upload target, controls, status, button, and 290 px preview remain usable. | Preserve the single-column flow. |
| Page content | PASS | — | The Relief/Extrude explanation, source-image guidance, limitations, FAQ, and related tools are specific and practical rather than generic SEO filler. | Do not expand the page. |
| Visual polish | PASS | — | Typography, borders, preview contrast, and control alignment are consistent with the rest of the product. | No visual redesign is required. |

The general image tool is functionally strong, but NF-1 must be corrected before V1 freeze because it can misrepresent model dimensions.

## PNG to STL

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| First-time clarity | PASS | — | The page clearly explains that PNG can produce relief or extrusion and that the file stays local. | Keep the current route-specific wording. |
| Upload experience | NEEDS FIX | P2 | **NF-3:** The shared uploader exposes duplicate keyboard focus stops. | Correct it once in the shared uploader. |
| Defaults | PASS | — | Opaque PNG starts in Relief and meaningful transparency starts in Extrude. The observed transparent fixture produced the intended extruded preview. | Keep the alpha-only automatic choice. |
| Parameter validity | NEEDS FIX | P1 | **NF-1:** The shared image controls can display invalid Depth/Size values while generating silently clamped geometry. | Fix in the shared image converter only. |
| State flow | PASS | — | Filename, processing, ready status, preview, and enabled download state are clear. | Preserve the existing flow. |
| Preview | PASS | — | The transparent-silhouette fixture is centered and fully visible on desktop and mobile. | Keep the shared preview. |
| Download | NEEDS FIX | P2 | **NF-4:** At 1280 × 800 only the very top edge of the ready Download button is at the viewport boundary after the tested transparent filename wraps the status. | Keep the CTA adjacent to the ready state within the supported viewport. |
| Error experience | PASS | — | PNG-specific extension, read, size, and dimension errors identify the problem and next step. | No new error system is needed. |
| Mobile | PASS | — | Controls remain readable and tap targets are large; no overflow occurs at 390 px or 430 px. | No mobile-specific correction is required. |
| Page content | PASS | — | Alpha-channel behavior, automatic style selection, limitations, and best-source guidance match the actual tool. | Do not add background removal or vector-tracing claims. |
| Visual polish | PASS | — | The route is visually consistent with the shared image converter family. | Preserve the current treatment. |

PNG to STL has the right defaults and content. Its required work is entirely shared with the other image routes and uploader.

## JPG to STL

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| First-time clarity | PASS | — | JPG/JPEG input, Relief output, and local processing are immediately understandable. | Keep the current intro. |
| Upload experience | NEEDS FIX | P2 | **NF-3:** The shared uploader exposes duplicate keyboard focus stops. | Correct the shared uploader once. |
| Defaults | PASS | — | Relief is the correct default for non-transparent JPG and the tested photo produced a usable relief. | Keep the current default. |
| Parameter validity | NEEDS FIX | P1 | **NF-1:** Invalid displayed Depth/Size values can still yield a ready, silently clamped model. | Fix in the shared image converter. |
| State flow | PASS | — | Progress, ready status, replacement, preview, and download enabling are clear. | Preserve the current flow. |
| Preview | PASS | — | The photo relief is legible, fully framed, and has sufficient contrast at all tested widths. | No camera change is needed. |
| Download | NEEDS FIX | P2 | **NF-4:** At 1280 × 800 the button begins around 784 px, leaving only a small sliver visible and not a usable full CTA. | Keep the completed-state action fully visible at the supported desktop size. |
| Error experience | PASS | — | Unsupported, corrupt, oversized, and over-dimension JPG states provide useful next steps. | Keep the current messages. |
| Mobile | PASS | — | H1, controls, status, preview, and enabled download remain usable with no horizontal overflow. | No mobile-specific change is required. |
| Page content | PASS | — | The page accurately explains brightness-based reliefs, source-image suitability, and the limits of JPG. | Do not add advanced image editing. |
| Visual polish | PASS | — | The tool feels like part of the same image-conversion family. | Preserve it. |

JPG to STL is V1-capable once the shared image-field and completion-action issues are corrected.

## Logo to STL

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| First-time clarity | PASS | — | The page promises a solid printable STL and names PNG/JPG before upload. | Keep the concise wording. |
| Upload experience | NEEDS FIX | P2 | **NF-3:** The shared uploader exposes duplicate keyboard focus stops. | Correct the shared uploader once. |
| Defaults | PASS | — | Extrude is the fixed route default, and the transparent logo fixture produces a useful solid result. | Keep Extrude as the route default. |
| Parameter validity | NEEDS FIX | P1 | **NF-1:** Invalid displayed Depth/Size values can still produce silently clamped output. | Fix in the shared image converter. |
| State flow | PASS | — | The filename, completion message, preview, and enabled download state are unambiguous. | Preserve the current flow. |
| Preview | PASS | — | The silhouette is fully visible, centered, and padded at desktop and mobile aspect ratios. | Keep the shared viewer. |
| Download | NEEDS FIX | P2 | **NF-4:** The ready Download button begins around 799 px at 1280 × 800 after the tested filename wraps. | Make the full CTA visible with the ready state at this supported viewport. |
| Error experience | PASS | — | Image errors are clear and the no-foreground path gives source-image advice. | Keep the existing messages. |
| Mobile | PASS | — | Natural H1 wrapping, 147 px upload target, two-column numeric controls, and 290 px preview are usable without overflow. | No mobile-specific change is required. |
| Page content | PASS | — | Transparent versus solid background guidance, thin-detail limitations, and slicer verification are relevant and honest. | Do not add AI background removal or vector conversion. |
| Visual polish | PASS | — | The page is consistent and does not look like a separate prototype. | Preserve it. |

Logo to STL is appropriately focused; all required changes belong in shared components.

## 3MF to STL

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| First-time clarity | PASS | — | Input, binary STL result, local processing, and metadata loss are stated before download. | Keep the current language. |
| Upload experience | NEEDS FIX | P2 | **NF-3:** The shared uploader exposes duplicate keyboard focus stops. | Correct the shared uploader once. |
| Default result quality | PASS | — | The transformed multi-object fixture converts successfully; both objects and their relative transforms are visible in preview. | Do not alter the validated format engine. |
| State flow | PASS | — | Idle, conversion, ready, preview, replace, and error states are understandable. | Preserve the flow. |
| Preview | PASS | — | The multi-object transformed model is fully framed with useful visual padding on desktop and mobile. | Keep the shared viewer. |
| Download | NEEDS FIX | P2 | **NF-4:** At 1280 × 800 the button begins around 780 px, so only its top portion is visible despite the ready message being visible higher in the control column. | Make the complete CTA visible with the ready state at the tested desktop height. |
| Error experience | PASS | — | Wrong-extension and corrupt-3MF messages correctly identify the source problem and recommend a valid 3MF. | Keep the current mapping. |
| Mobile | PASS | — | Upload, status, limitation note, full Download button, and preview follow a clear vertical order with no overflow. | No mobile-specific change is required. |
| Page content | PASS | — | Transform preservation, geometry merging, metadata loss, and reasons to convert are accurate and useful. | Do not expand into a format encyclopedia. |
| Visual polish | PASS | — | The shorter format control column remains visually aligned with the shared converter shell. | Preserve the current design. |

The 3MF conversion itself is V1-ready. Required work is limited to the shared uploader and desktop completion-action visibility.

## STL to 3MF

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| First-time clarity | PASS | — | The page names binary and ASCII STL, 3MF output, local processing, and millimeter handling. | Keep the current wording. |
| Upload experience | NEEDS FIX | P2 | **NF-3:** The shared uploader exposes duplicate keyboard focus stops. | Correct the shared uploader once. |
| Default result quality | PASS | — | Existing binary, ASCII, and disconnected-shell paths are validated; the tested binary fixture previews and enables download successfully. | Do not alter the validated format engine or fallback. |
| State flow | PASS | — | Valid files move clearly from processing to ready, with preview and download enabled together. | Preserve the state model. |
| Preview | PASS | — | The model is centered and fully visible on desktop and narrow mobile viewports. | Keep the shared preview. |
| Download | NEEDS FIX | P2 | **NF-4:** At 1280 × 800 the ready button starts around 780 px and is only partially visible. | Keep the complete action in view with the ready state at the supported desktop size. |
| Error experience | NEEDS FIX | P2 | **NF-2:** A deliberately malformed `.stl` produced “This file needs more memory…” rather than the valid-file error. The parser raises a `RangeError`, and the shared helper currently treats every `RangeError` as memory exhaustion. This sends the user toward closing tabs instead of choosing a valid STL. | Map malformed STL parse/range failures to the existing “valid binary or ASCII STL” message. Reserve the memory message for errors that explicitly indicate allocation or memory pressure. Do not change parsing behavior. |
| Mobile | PASS | — | The upload target, ready state, unit note, Download 3MF button, and preview are usable with no horizontal overflow. | No mobile-specific change is required. |
| Page content | PASS | — | Binary/ASCII support, disconnected shells, units, and missing metadata are explained accurately without implementation detail. | Do not add advanced 3MF authoring controls. |
| Visual polish | PASS | — | The page matches the 3MF to STL page and the wider site system. | Preserve it. |

STL to 3MF's valid conversion paths are ready. NF-2 is an error-classification problem only, not an engine failure.

## Cross-Tool Consistency

Only actual inconsistencies are listed here:

- **NF-1 — Image controls accept an inconsistent displayed/effective value.** The four image routes expose editable numeric parameters, but HTML invalidity does not prevent regeneration or download and the engine silently clamps the effective values.
- **NF-2 — Corrupt-file guidance differs by format.** Corrupt images and 3MF files receive valid-file guidance, while one corrupt STL path is misclassified as memory pressure.
- **NF-4 — Completion CTA visibility varies with control height and filename wrapping.** The same shared visual pattern puts a fully enabled action below or almost below the 1280 × 800 viewport, with image routes most affected.

Uploader behavior, status styling, preview behavior, button wording, filename derivation, spacing, typography, and mobile stacking are otherwise coherent across the six tools.

## Mobile Findings

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| Responsive layout | PASS | — | All seven audited pages had `scrollWidth === clientWidth` at both 390 px and 430 px. | Preserve current breakpoints. |
| H1 and intro wrapping | PASS | — | Headings wrap naturally without clipping; body text remains 16 px and readable. | Do not aggressively shrink mobile type. |
| Upload and controls | PASS | — | Upload targets are about 147 px tall; form controls and buttons meet comfortable touch sizes. | Preserve current dimensions. |
| Preview framing | PASS | — | All tested fixtures remain fully visible in the 290 px mobile preview, including the transformed multi-object 3MF. | No camera adjustment is needed. |
| Preview gesture discoverability | OPTIONAL | — | **O-2:** The 3D view supports OrbitControls but gives no short indication that it can be dragged or pinched. The model is still useful without manipulation, so this does not block V1. | If future user evidence shows confusion, add one restrained interaction hint; do not add viewer buttons or a toolbar for V1. |
| Preview touch behavior | PASS | — | The canvas intentionally owns gestures while touched, but users can continue page scrolling outside the 290 px viewer. No full-page scroll trap was observed. | Keep monitoring; no V1 change required. |

There is no mobile-specific V1 blocker.

## Performance / Loading

| Area | Status | Evidence |
| --- | --- | --- |
| Homepage | PASS | No converter, Three.js, MeshPreview, image-engine, STL-engine, lib3mf, or WASM resource was loaded on the homepage. |
| Image routes before selection | PASS | The small React converter island loads, but the image engine, STL exporter, Three.js core, and MeshPreview are absent until a file is selected. |
| Image routes after selection | PASS | Image engine, STL exporter, Three.js, and MeshPreview load only when conversion and preview are required. |
| 3MF route before selection | PASS | The converter island loads, but lib3mf JS/WASM, STL parsing, Three.js, and MeshPreview remain unloaded. |
| 3MF route after selection | PASS | lib3mf JS/WASM, STL parsing, Three.js, and MeshPreview load after file selection as intended. |
| Initial layout stability | PASS | Converter and preview placeholders reserve their footprint; no major visible layout shift was observed during hydration or result rendering. |
| Build | PASS | `npm run build` completed with 0 errors, 0 warnings, and 0 hints from Astro check. Vite emitted the existing lib3mf browser-externalization notices, but the static build completed successfully. |

No performance or loading change is required for V1.

## Accessibility Basics

| Area | Status | Priority | Evidence / Issue | Recommended Direction |
| --- | --- | --- | --- | --- |
| Skip link | PASS | — | It is hidden normally, becomes visible on keyboard focus, and is first in the tab order. | Preserve it. |
| Visible focus | PASS | — | Links, cards, form controls, and the styled uploader receive the shared visible focus outline. | Preserve the current focus treatment. |
| Upload keyboard order | NEEDS FIX | P2 | **NF-3:** Each uploader creates two consecutive focus stops for one file action: the keyboard-enabled label and the clipped native input. | Reduce this to one visible, operable focus target in the shared component. |
| Form labels and semantics | PASS | — | Style, Depth, and Size have programmatic labels; status/error regions use live roles; Download controls are real buttons with disabled states. | Keep the current semantics. |
| Error communication | NEEDS FIX | P2 | **NF-2:** The corrupt-STL memory message is meaningful in isolation but inaccurate for the observed failure. | Correct the classification, not the visual error system. |
| Contrast | PASS | — | Primary text, muted text, controls, focus outline, ready state, and error state remain readable in the tested presentation. | No color-system change is required. |
| 3D interaction by keyboard | OPTIONAL | — | **O-3:** OrbitControls manipulation is pointer/touch oriented. The preview is supplementary verification and the conversion/download path remains keyboard operable, so this is not a V1 blocker. | If later accessibility testing requires it, consider a minimal keyboard-operable viewer treatment; do not add a broad viewer toolbar in this V1 batch. |

## V1 Must-Fix List

1. **Keep image parameter values truthful (P1)**
   - **Page(s):** `/image-to-stl/`, `/png-to-stl/`, `/jpg-to-stl/`, `/logo-to-stl/`
   - **Exact problem:** Depth and Size can display invalid values such as 0 and 999 while the converter silently generates with 0.5 mm and 300 mm. The form is invalid, but the status still becomes ready and Download remains enabled.
   - **Why it matters:** A user can download geometry whose actual dimensions do not match the settings shown in the UI. This directly harms reliability and trust in the core conversion flow.
   - **Smallest reasonable fix:** In the shared image converter, normalize or reject blank/out-of-range numeric values before regeneration and download so displayed and effective values always match. Preserve the existing 0.5–50 mm and 10–300 mm limits and do not change the mesh engines.
   - **Estimated scope:** Small

2. **Correct the malformed-STL error classification (P2)**
   - **Page(s):** `/stl-to-3mf/`
   - **Exact problem:** A malformed `.stl` can throw a parser `RangeError`, which the shared error helper presents as insufficient browser memory.
   - **Why it matters:** The message identifies the wrong problem and tells the user to close tabs or choose a smaller file instead of selecting a valid STL.
   - **Smallest reasonable fix:** Treat explicit memory/allocation failures as memory errors, but map malformed STL parse/range failures to the existing valid binary/ASCII STL guidance. Do not add a parsing workaround.
   - **Estimated scope:** Tiny

3. **Remove the duplicate uploader focus stop (P2)**
   - **Page(s):** all six tool pages
   - **Exact problem:** The styled upload label and its visually hidden native file input are both in the keyboard tab order for the same action.
   - **Why it matters:** Keyboard users encounter a redundant second stop with no useful visible focus location, making the core first action feel unfinished.
   - **Smallest reasonable fix:** Keep one visible, keyboard-operable upload target in the shared `UploadField`; remove only the redundant hidden-input tab stop and preserve native file selection and labeling.
   - **Estimated scope:** Tiny

4. **Keep the ready Download action visible at 1280 × 800 (P2)**
   - **Page(s):** all six tool pages, most visibly the four image routes
   - **Exact problem:** After conversion at 1280 × 800, the ready message is visible but the enabled Download button begins between roughly 780 px and 814 px, leaving it partial or entirely below the viewport.
   - **Why it matters:** The state says the file is ready while the primary next action is not visibly available, adding unnecessary uncertainty and scrolling to the core flow.
   - **Smallest reasonable fix:** Make a small desktop-only spacing or completion-block adjustment so the full enabled CTA is visible with the ready status at 1280 × 800. Do not add sticky buttons, viewer controls, or a new layout.
   - **Estimated scope:** Small

## Explicitly Not Doing in V1

- No new tools, including STL Viewer or SVG to STL.
- No AI classification, background removal, vector tracing, or generated artwork.
- No advanced mesh controls, repair tools, editing workspace, or slicer features.
- No engine rewrite or generic conversion abstraction.
- No cloud conversion, server-side file handling, file storage, galleries, or sharing.
- No accounts, authentication, subscriptions, credits, or payments.
- No database, CMS, admin panel, or speculative infrastructure.
- No viewer toolbar, Reset Camera button, Fit View button, zoom buttons, or complex interaction system.
- No animation pass or decorative homepage redesign.
- No broad SEO expansion or long-form content increase.
- No implementation of optional O-1, O-2, or O-3 in the V1 must-fix batch.

## Final Recommendation

**FIX THE LISTED ITEMS, THEN FREEZE V1**
