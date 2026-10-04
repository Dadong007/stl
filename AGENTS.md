# IntoSTL permanent project constraints

IntoSTL is a small, focused, browser-local utility. Prefer the smallest implementation that fully satisfies the current requirement.

## Product and scope

- Build only explicitly requested functionality. When a feature's phase is unclear, do not implement it.
- Do not add speculative features, placeholder routes, future-facing infrastructure, or generic abstractions.
- Keep the primary flow: upload, automatic useful result, 3D preview, download.
- Do not refactor validated conversion behavior merely to make the architecture more generic.
- Preserve `spike/`, `test-assets/`, `test-output/`, and the existing validation reports.

## Architecture

- Use Astro for static pages and SEO content.
- Use React only for interactive converter islands.
- Keep geometry and file-conversion algorithms out of UI and Astro pages.
- Keep Relief and Extrude in one image-engine family and STL/3MF logic in one format-engine family.
- Reuse the shared Three.js preview; do not duplicate it.
- Produce static output compatible with Cloudflare Pages. Do not add server rendering or a server adapter.
- Keep `@3mfconsortium/lib3mf` pinned exactly to `2.5.0-fix.2` unless a later explicit task changes it.
- Lazy-load Three.js viewer code and lib3mf WASM after a user selects a file.

## Prohibited additions

Do not add backend APIs, server-side conversion, databases, authentication, accounts, credits, payments, subscriptions, file storage, cloud uploads, GPU processing, AI APIs, paid conversion APIs, state-management libraries, a CMS, an admin panel, Docker, monorepo tooling, or unrequested dependencies.

## Privacy

- Image, STL, and 3MF bytes, filenames, base64 content, and generated meshes must remain in the browser.
- Do not add analytics unless an explicit later phase requests them.

## Quality gates

- Maintain mobile usability, semantic HTML, keyboard access, visible focus, readable contrast, static SEO content, canonical URLs, schema, sitemap, and robots directives.
- Keep `npm run spike` passing.
- Run the production build and available TypeScript checks after production changes.
- Do not create Phase 2 routes unless explicitly requested.
