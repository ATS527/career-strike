import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { latestKnownVersion } from '../../src/store/db.js';
import { AlreadyRunningError, type RunningService, startService } from '../../src/service/service.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function start(paths: AppPaths = appPaths(path.join(tempDir(), 'data'))): Promise<{ s: RunningService; paths: AppPaths }> {
  const s = await startService(paths, { port: 0 });
  running.push(s);
  return { s, paths };
}
const auth = (s: RunningService): Record<string, string> => ({ authorization: `Bearer ${s.info.token}` });

describe('local service', () => {
  it('binds only to 127.0.0.1 and serves health with security headers', async () => {
    const { s } = await start();
    expect((s.app.server.address() as AddressInfo).address).toBe('127.0.0.1');
    const res = await localRequest(s.info.port, '/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'career-strike', schemaVersion: latestKnownVersion(), pid: process.pid });
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects foreign Host headers (DNS rebinding)', async () => {
    const { s } = await start();
    const port = s.info.port;
    for (const host of ['evil.example', `evil.example:${port}`, `127.0.0.1.nip.io:${port}`, `127.0.0.1:${port + 1}`, `0.0.0.0:${port}`]) {
      const res = await localRequest(port, '/api/health', { headers: { host } });
      expect(res.status, host).toBe(421);
    }
  });

  it('rejects cross-origin writes even with a valid token, without changing state', async () => {
    const { s } = await start();
    const res = await localRequest(s.info.port, '/api/settings/search.remotePreference', {
      method: 'PUT',
      headers: { ...auth(s), origin: 'https://evil.example' },
      body: { value: 'onsite_ok' },
    });
    expect(res.status).toBe(403);
    const after = await localRequest(s.info.port, '/api/settings', { headers: auth(s) });
    expect((after.body as { settings: Record<string, unknown> }).settings['search.remotePreference']).toBe('remote_only');
  });

  it('requires the bearer token for private routes', async () => {
    const { s } = await start();
    expect((await localRequest(s.info.port, '/api/settings')).status).toBe(401);
    expect((await localRequest(s.info.port, '/api/settings', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await localRequest(s.info.port, '/api/settings', { headers: auth(s) })).status).toBe(200);
  });

  it('validates input: 404 for unknown settings, 400 for invalid values or bodies', async () => {
    const { s } = await start();
    const put = (key: string, body: unknown) =>
      localRequest(s.info.port, `/api/settings/${key}`, { method: 'PUT', headers: auth(s), body });
    expect((await put('nope', { value: 1 })).status).toBe(404);
    expect((await put('search.remotePreference', { value: 'anywhere' })).status).toBe(400);
    expect((await put('search.remotePreference', 'oops')).status).toBe(400);
  });

  it('persists settings across a service restart', async () => {
    const { s, paths } = await start();
    const put = await localRequest(s.info.port, '/api/settings/candidate.joiningAvailability', {
      method: 'PUT',
      headers: auth(s),
      body: { value: 'immediate' },
    });
    expect(put.status).toBe(200);
    await s.stop();

    const { s: s2 } = await start(paths);
    expect(s2.info.token).not.toBe(s.info.token);
    const res = await localRequest(s2.info.port, '/api/settings', { headers: auth(s2) });
    expect((res.body as { settings: Record<string, unknown> }).settings['candidate.joiningAvailability']).toBe('immediate');
  });

  it.skipIf(process.platform === 'win32')('writes an owner-only runtime file and removes it on stop', async () => {
    const { s, paths } = await start();
    expect(fs.statSync(paths.runtimeFile).mode & 0o777).toBe(0o600);
    await s.stop();
    expect(fs.existsSync(paths.runtimeFile)).toBe(false);
  });

  it('refuses a second instance on the same data directory', async () => {
    const { paths } = await start();
    await expect(startService(paths, { port: 0 })).rejects.toBeInstanceOf(AlreadyRunningError);
  });

  it('serves data export, backup status, and diagnostics', async () => {
    const { s } = await start();

    // Export
    const exp = await localRequest(s.info.port, '/api/data/export', { headers: auth(s) });
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toMatch(/attachment; filename="career-strike-export-.*\.json"/);
    expect(exp.body).toMatchObject({ format: 'career-strike-export', formatVersion: 1 });

    // Backups
    const bkp = await localRequest(s.info.port, '/api/data/backups', { headers: auth(s) });
    expect(bkp.status).toBe(200);
    expect(bkp.body).toMatchObject({ count: 0, latest: null, backups: [] });

    // Diagnostics
    const diag = await localRequest(s.info.port, '/api/diagnostics', { headers: auth(s) });
    expect(diag.status).toBe(200);
    expect((diag.body as { checks: unknown[] }).checks.length).toBeGreaterThan(0);

    // Delete confirmation required
    const badDelete = await localRequest(s.info.port, '/api/data/delete', {
      method: 'POST',
      headers: auth(s),
      body: { confirm: 'wrong' },
    });
    expect(badDelete.status).toBe(400);
    expect(badDelete.body).toMatchObject({ error: 'CONFIRMATION_REQUIRED' });
  });

  it('reports market readiness and target signals without claiming unverified discovery', async () => {
    const { s } = await start();
    const res = await localRequest(s.info.port, '/api/readiness', { headers: auth(s) });
    expect(res.status).toBe(200);
    const body = res.body as {
      markets: { code: string; name: string; configuredStatus: string; discoveryAvailable: boolean; targets: { id: string; monitoringState: string; lastSuccessfulRetrievalAt: string | null }[] }[];
    };
    expect(body.markets).toHaveLength(9);
    const india = body.markets.find((m) => m.code === 'IN')!;
    expect(india).toMatchObject({ name: 'India', configuredStatus: 'CONFIGURED', discoveryAvailable: false });
    expect(india.targets.find((t) => t.id === 'sarvam-india')).toMatchObject({ monitoringState: 'NOT_ADOPTED', lastSuccessfulRetrievalAt: null });
    const uae = body.markets.find((m) => m.code === 'AE')!;
    expect(uae).toMatchObject({ name: 'United Arab Emirates', configuredStatus: 'CONFIGURED', discoveryAvailable: false });
    expect(uae.targets.map((t) => t.id)).toEqual(['bybit-uae', 'deliveroo-uae', 'ziina-uae', 'checkout-uae']);

    // Unauthenticated callers get nothing.
    expect((await localRequest(s.info.port, '/api/readiness')).status).toBe(401);
  });
});
