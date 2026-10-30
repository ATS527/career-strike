import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dashboard is served by the Career Strike service under a strict CSP:
// no inline scripts, no data: fonts, nothing loaded from other origins.
export default defineConfig({
  root: 'src/web',
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: true,
  },
});
