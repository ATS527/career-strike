import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serviceOrigin = process.env.CS_DEV_SERVICE_ORIGIN ?? 'http://127.0.0.1:47615';

// The dashboard is served by the Career Strike service under a strict CSP:
// no inline scripts, no data: fonts, nothing loaded from other origins.
export default defineConfig({
  root: 'src/web',
  base: '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/': { target: serviceOrigin, changeOrigin: true, headers: { origin: serviceOrigin } },
      '/auth': { target: serviceOrigin, changeOrigin: true, headers: { origin: serviceOrigin } },
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: true,
  },
});
