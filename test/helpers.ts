import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localRequest } from '../src/service/http-client.js';

export function tempDir(prefix = 'cs-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Sign in as the dashboard would: mint a launch token with the CLI bearer, redeem it, read the CSRF token. */
export async function dashboardSession(
  port: number,
  bearer: string,
): Promise<{ cookie: string; csrf: string; headers: Record<string, string> }> {
  const minted = await localRequest(port, '/api/session/launch-token', {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}` },
  });
  const launch = await localRequest(port, `/auth/launch?t=${(minted.body as { token: string }).token}`);
  const cookie = launch.headers['set-cookie']![0]!.split(';', 1)[0]!;
  const session = await localRequest(port, '/api/session', { headers: { cookie } });
  const csrf = (session.body as { csrf: string }).csrf;
  return { cookie, csrf, headers: { cookie, 'x-cs-csrf': csrf } };
}
