import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Development only (`npm run dev`): Vite serves the UI and proxies the API to the local service.
const DEV_PORT = 5173;
const DEV_ORIGINS = new Set([`http://127.0.0.1:${DEV_PORT}`, `http://localhost:${DEV_PORT}`]);
const serviceOrigin = process.env.CS_DEV_SERVICE_ORIGIN ?? 'http://127.0.0.1:47615';

// The proxy presents requests to the service as same-origin, so it must first refuse anything
// the service itself would refuse: requests from another origin, including other localhost ports.
function devOriginGuard(): Plugin {
  return {
    name: 'career-strike-dev-origin-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/') && !req.url?.startsWith('/auth/')) return next();
        const origin = req.headers.origin;
        const site = req.headers['sec-fetch-site'];
        if ((origin !== undefined && !DEV_ORIGINS.has(origin)) || site === 'cross-site' || site === 'same-site') {
          res.statusCode = 403;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'ORIGIN_REJECTED' }));
          return;
        }
        next();
      });
    },
  };
}

// The dashboard is served by the Career Strike service under a strict CSP:
// no inline scripts, no data: fonts, nothing loaded from other origins.
export default defineConfig({
  root: 'src/web',
  base: '/',
  plugins: [react(), devOriginGuard()],
  server: {
    host: '127.0.0.1',
    port: DEV_PORT,
    strictPort: true,
    // No CORS: other localhost pages must not be able to read anything through the dev server.
    cors: false,
    proxy: {
      '/api/': { target: serviceOrigin, changeOrigin: true, headers: { origin: serviceOrigin } },
      '/auth/': { target: serviceOrigin, changeOrigin: true, headers: { origin: serviceOrigin } },
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
