import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative base so dist/ can be dropped into any static host subdirectory,
  // including GoDaddy cPanel public_html/<folder>.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    cssCodeSplit: false,
    rollupOptions: {
      // 404.html is a separate entry or Vite never emits it.
      input: {
        main: resolve(__dirname, 'index.html'),
        evidence: resolve(__dirname, 'evidence.html'),
        notFound: resolve(__dirname, '404.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          motion: ['gsap'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
