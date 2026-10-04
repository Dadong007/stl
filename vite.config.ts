import { defineConfig } from 'vite';

export default defineConfig({
  root: 'spike',
  publicDir: '../test-assets',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
