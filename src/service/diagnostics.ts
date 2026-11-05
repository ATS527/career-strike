import fs from 'node:fs';
import path from 'node:path';
import { type AppPaths, findGitRoot } from '../core/paths.js';
import { MIN_NODE_MAJOR } from '../core/version.js';
import { inspectDb, latestKnownVersion } from '../store/db.js';
import { probeHealth, readRuntime } from './runtime.js';
import { WEB_DIR } from './service.js';

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctorChecks(paths: AppPaths, runningPort?: number): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'node', ok: nodeMajor >= MIN_NODE_MAJOR, detail: process.versions.node });

  const repo = findGitRoot(paths.home);
  checks.push({ name: 'data-outside-repo', ok: repo === null, detail: repo ?? paths.home });

  if (process.platform !== 'win32' && fs.existsSync(paths.home)) {
    const mode = fs.statSync(paths.home).mode & 0o777;
    checks.push({ name: 'data-permissions', ok: (mode & 0o077) === 0, detail: mode.toString(8) });
  }

  try {
    const version = inspectDb(paths.db);
    checks.push(
      version === null
        ? { name: 'database', ok: false, detail: 'not initialised; run `career-strike init`' }
        : {
            name: 'database',
            ok: version === latestKnownVersion(),
            detail: `schema v${version} (build supports v${latestKnownVersion()})`,
          },
    );
  } catch (err) {
    checks.push({ name: 'database', ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  const dashboard = fs.existsSync(path.join(WEB_DIR, 'index.html'));
  checks.push({
    name: 'dashboard-files',
    ok: dashboard,
    detail: dashboard ? 'present' : `missing from ${WEB_DIR}; reinstall Career Strike`,
  });

  if (runningPort !== undefined) {
    checks.push({ name: 'service', ok: true, detail: `running on port ${runningPort}` });
  } else {
    const info = readRuntime(paths.runtimeFile);
    const running = info !== null && (await probeHealth(info));
    checks.push({
      name: 'service',
      ok: true,
      detail: running && info ? `running on port ${info.port}` : 'not running',
    });
  }

  return checks;
}
