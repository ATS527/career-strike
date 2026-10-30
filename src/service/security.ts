import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokensEqual(a: string, b: string): boolean {
  // Hash first so lengths match and comparison time does not depend on the secret.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/** DNS-rebinding defence: only exact loopback authorities for the bound port are accepted. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host || port <= 0) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Requests without Origin (CLI, MCP) are allowed; browser requests must be same-origin. */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  return origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'no-store',
};
