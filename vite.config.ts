import { defineConfig } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Dev only. The tuning panel lives in the browser's localStorage, so a frame
// Jacob tuned by hand cannot be reproduced anywhere else. This mirrors the
// panel to captures/field/settings.json on every change, which is what the
// real-GPU capture script reads back.
function fieldSettingsMirror() {
  return {
    name: 'field-settings-mirror',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        if (req.url !== '/__field-settings' || req.method !== 'POST') return next();
        let body = '';
        req.on('data', (c: unknown) => (body += c));
        req.on('end', () => {
          try {
            mkdirSync(resolve(__dirname, 'captures/field'), { recursive: true });
            writeFileSync(resolve(__dirname, 'captures/field/settings.json'), body);
          } catch { /* dev convenience only */ }
          res.statusCode = 204;
          res.end();
        });
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [fieldSettingsMirror()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        grain: resolve(__dirname, 'grain.html'),
        field: resolve(__dirname, 'field.html'),
        terms: resolve(__dirname, 'terms.html')
      },
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  },
  server: {
    port: 5180
  }
});
