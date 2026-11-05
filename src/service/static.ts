import fs from 'node:fs';
import path from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticAsset {
  body: Buffer;
  contentType: string;
  immutable: boolean;
}

/**
 * Load the built dashboard into memory. Only files present at startup can ever be served, so
 * request paths are map lookups and path traversal is impossible by construction.
 */
export function loadStaticAssets(dir: string): Map<string, StaticAsset> | null {
  if (!fs.existsSync(path.join(dir, 'index.html'))) return null;
  const assets = new Map<string, StaticAsset>();
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const type = CONTENT_TYPES[path.extname(entry.name)];
        if (!type) continue;
        const urlPath = `/${path.relative(dir, full).split(path.sep).join('/')}`;
        assets.set(urlPath, {
          body: fs.readFileSync(full),
          contentType: type,
          immutable: urlPath.startsWith('/assets/'),
        });
      }
    }
  };
  walk(dir);
  return assets;
}

export const DASHBOARD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
