// Dashboard development: the local service plus Vite with hot reload, signed in through a
// one-time link that lands on the Vite origin.
//
//   npm run dev
//
// A service that was already running is reused and left running; one started here is stopped
// on exit.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { appPaths } from '../src/core/paths.js';
import { dashboardUrl, openInBrowser, runningService, startDetached, stopService } from '../src/service/control.js';
import { DEFAULT_PORT } from '../src/service/service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ENTRY = path.join(ROOT, 'src', 'cli', 'index.ts');

async function main(): Promise<void> {
  const paths = appPaths();
  const existing = await runningService(paths);
  const info = existing ?? (await startDetached(paths, CLI_ENTRY, DEFAULT_PORT));
  console.log(
    existing ? `Using the running service on port ${info.port}.` : `Started the service on port ${info.port}.`,
  );

  // Read by vite.config.ts so the proxy targets the service actually running.
  process.env.CS_DEV_SERVICE_ORIGIN = `http://127.0.0.1:${info.port}`;
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.ts') });
  await vite.listen();
  const origin = vite.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? 'http://127.0.0.1:5173';
  vite.printUrls();

  openInBrowser(await dashboardUrl(info, origin));
  console.log('Opened the dashboard. Press Ctrl+C to stop.');

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await vite.close();
    if (!existing) console.log(`Service: ${await stopService(paths)}`);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
