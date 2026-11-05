import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { type LocalResponse, localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

function fakeWebDir(): string {
  const dir = tempDir('cs-web-');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>CS</title><div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  return dir;
}

async function start(paths: AppPaths = appPaths(path.join(tempDir(), 'data')), webDir = fakeWebDir()) {
  const s = await startService(paths, { port: 0, webDir });
  running.push(s);
  return { s, paths, webDir };
}

const bearer = (s: RunningService) => ({ authorization: `Bearer ${s.info.token}` });

async function launchToken(s: RunningService): Promise<string> {
  const res = await localRequest(s.info.port, '/api/session/launch-token', { method: 'POST', headers: bearer(s) });
  expect(res.status).toBe(200);
  return (res.body as { token: string }).token;
}

function cookieFrom(res: LocalResponse): string {
  const header = res.headers['set-cookie']?.[0];
  expect(header).toBeDefined();
  return header!.split(';', 1)[0]!;
}

async function login(s: RunningService): Promise<{ cookie: string; csrf: string }> {
  const res = await localRequest(s.info.port, `/auth/launch?t=${await launchToken(s)}`);
  expect(res.status).toBe(303);
  const cookie = cookieFrom(res);
  const session = await localRequest(s.info.port, '/api/session', { headers: { cookie } });
  return { cookie, csrf: (session.body as { csrf: string }).csrf };
}

describe('dashboard sessions', () => {
  it('redeems a launch token once into an HttpOnly SameSite=Strict cookie and redirects away from the token', async () => {
    const { s } = await start();
    const token = await launchToken(s);
    const first = await localRequest(s.info.port, `/auth/launch?t=${token}`);
    expect(first.status).toBe(303);
    expect(first.headers.location).toBe('/');
    const setCookie = first.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toMatch(/^cs_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/);

    const replay = await localRequest(s.info.port, `/auth/launch?t=${token}`);
    expect(replay.status).toBe(401);
    expect(replay.headers['set-cookie']).toBeUndefined();
    expect(String(replay.body)).toContain('expired');
  });

  it('rejects forged launch tokens', async () => {
    const { s } = await start();
    expect((await localRequest(s.info.port, `/auth/launch?t=${'A'.repeat(43)}`)).status).toBe(401);
    expect((await localRequest(s.info.port, '/auth/launch')).status).toBe(401);
  });

  it('allows reads with the cookie but requires the CSRF header for writes', async () => {
    const { s } = await start();
    const { cookie, csrf } = await login(s);
    expect((await localRequest(s.info.port, '/api/settings', { headers: { cookie } })).status).toBe(200);

    const put = (headers: Record<string, string>) =>
      localRequest(s.info.port, '/api/settings/search.remotePreference', {
        method: 'PUT',
        headers: { cookie, ...headers },
        body: { value: 'hybrid_ok' },
      });
    expect((await put({})).status).toBe(403);
    expect((await put({ 'x-cs-csrf': 'wrong' })).status).toBe(403);
    expect((await put({ 'x-cs-csrf': csrf })).status).toBe(200);
  });

  it('rejects requests the browser marks as cross-site or same-site (other localhost ports)', async () => {
    const { s } = await start();
    const { cookie, csrf } = await login(s);
    for (const site of ['cross-site', 'same-site']) {
      const res = await localRequest(s.info.port, '/api/settings', {
        headers: { cookie, 'x-cs-csrf': csrf, 'sec-fetch-site': site },
      });
      expect(res.status, site).toBe(403);
    }
    const sameOrigin = await localRequest(s.info.port, '/api/settings', {
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
    });
    expect(sameOrigin.status).toBe(200);
  });

  it('does not let a dashboard session mint launch tokens', async () => {
    const { s } = await start();
    const { cookie, csrf } = await login(s);
    const res = await localRequest(s.info.port, '/api/session/launch-token', {
      method: 'POST',
      headers: { cookie, 'x-cs-csrf': csrf },
    });
    expect(res.status).toBe(403);
  });

  it('keeps the session across a service restart and revokes it on logout', async () => {
    const { s, paths, webDir } = await start();
    const { cookie } = await login(s);
    await s.stop();

    const { s: s2 } = await start(paths, webDir);
    const session = await localRequest(s2.info.port, '/api/session', { headers: { cookie } });
    expect(session.status).toBe(200);
    const csrf = (session.body as { csrf: string }).csrf;

    const out = await localRequest(s2.info.port, '/api/session/logout', {
      method: 'POST',
      headers: { cookie, 'x-cs-csrf': csrf },
    });
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect((await localRequest(s2.info.port, '/api/session', { headers: { cookie } })).status).toBe(401);
  });

  it('stores only a hash of the session id', async () => {
    const { s, paths } = await start();
    const { cookie } = await login(s);
    const id = cookie.split('=')[1]!;
    const db = fs.readFileSync(paths.db);
    expect(db.includes(Buffer.from(id))).toBe(false);
  });
});

describe('dashboard assets', () => {
  it('serves the app shell with a strict CSP and SPA fallback, and hashed assets as immutable', async () => {
    const { s } = await start();
    const shell = await localRequest(s.info.port, '/settings');
    expect(shell.status).toBe(200);
    expect(shell.headers['content-type']).toContain('text/html');
    expect(shell.headers['content-security-policy']).toContain("script-src 'self'");
    expect(shell.headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(shell.headers['cache-control']).toBe('no-store');

    const js = await localRequest(s.info.port, '/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers['cache-control']).toContain('immutable');
  });

  it('never serves files outside the built dashboard', async () => {
    const { s } = await start();
    for (const p of [
      '/../package.json',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/../../career-strike.db',
      '/service.json',
      '/missing.js',
    ]) {
      const res = await localRequest(s.info.port, p);
      expect(res.status, p).not.toBe(200);
      expect(String(JSON.stringify(res.body))).not.toContain('token');
    }
  });

  it('reports an unbuilt dashboard truthfully', async () => {
    const { s } = await start(undefined, tempDir('cs-empty-web-'));
    const res = await localRequest(s.info.port, '/');
    expect(res.status).toBe(503);
    expect(String(res.body)).toContain('not been built');
  });

  it('returns JSON 404 for unknown API routes rather than the app shell', async () => {
    const { s } = await start();
    const res = await localRequest(s.info.port, '/api/nope', { headers: bearer(s) });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });
});
