# Third-party software used by IntoSTL

No third-party application source code was copied into this repository. IntoSTL and its retained technology spike call the following installed packages through their public APIs:

- `@3mfconsortium/lib3mf` — BSD-2-Clause. Copyright the 3MF Consortium contributors. <https://github.com/3MFConsortium/lib3mf_wasm>
- `astro` — MIT. Copyright Astro contributors. Used for the production static site. <https://github.com/withastro/astro>
- `@astrojs/react` — MIT. Copyright Astro contributors. Used to mount the two interactive React converter islands. <https://github.com/withastro/astro>
- `@astrojs/sitemap` — MIT. Copyright Astro contributors. Used to generate the production XML sitemap. <https://github.com/withastro/astro>
- `react` and `react-dom` — MIT. Copyright Meta Platforms, Inc. and affiliates. Used only inside the production converter islands. <https://github.com/facebook/react>
- `three` — MIT. Copyright Three.js authors. <https://github.com/mrdoob/three.js>
- `earcut` — ISC. Copyright Mapbox. <https://github.com/mapbox/earcut>
- `sharp` — Apache-2.0. Copyright Lovell Fuller and contributors. Used only by the Node-side repeatable benchmark runner. <https://github.com/lovell/sharp>
- `vite` — MIT. Copyright Evan You and Vite contributors. <https://github.com/vitejs/vite>
- `typescript` — Apache-2.0. Copyright Microsoft Corporation. <https://github.com/microsoft/TypeScript>
- `tsx` — MIT. Copyright Privatenumber. <https://github.com/privatenumber/tsx>
- `@astrojs/check` — MIT. Copyright Astro contributors. Used only for production type and content checks. <https://github.com/withastro/language-tools>

The complete license texts for installed packages are available in their respective directories under `node_modules/` after `npm install`.
