import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * A separate build of record.html for tools/record-standalone.mjs,
 * which inlines it into one portable file with the fonts embedded.
 * The production build of record.html goes through vite.config.ts.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'captures/record',
    emptyOutDir: true,
    assetsDir: '.',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { record: resolve(__dirname, '../../record.html') },
      output: {
        entryFileNames: 'record.js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true
      }
    }
  }
});
