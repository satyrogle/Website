import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * A SEPARATE BUILD FOR THE LAB, so the site's vite.config.ts is not
 * touched. The production build ships index.html, privacy.html and
 * terms.html and must keep shipping exactly those; the lab is an
 * instrument, not a page of the site.
 *
 * Run from the repo root:
 *   node node_modules/vite/bin/vite.js build --config tools/lab/vite.lab.config.ts
 *
 * Output lands in captures/ (gitignored). tools/lab-standalone.mjs
 * wraps this and inlines the result into one portable file.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'captures/lab',
    emptyOutDir: true,
    assetsDir: '.',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { lab: resolve(__dirname, '../../lab.html') },
      output: { entryFileNames: 'lab.js', inlineDynamicImports: true }
    }
  }
});
