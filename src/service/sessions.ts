import { createHash } from 'node:crypto';
import type { Db } from '../store/db.js';
import { newToken } from './security.js';

export const SESSION_COOKIE = 'cs_session';
const LAUNCH_TOKEN_TTL_MS = 60_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface Session {
  csrf: string;
}

/**
 * Dashboard sessions. A session can only be created by redeeming a single-use launch token,
 * and launch tokens can only be minted by a bearer-authenticated local client (the CLI).
 */
export class SessionStore {
  // Launch tokens are short-lived and single-use; memory is the right lifetime for them.
  private readonly launchTokens = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  mintLaunchToken(): { token: string; expiresAt: string } {
    const nowMs = this.now();
    for (const [hash, exp] of this.launchTokens) if (exp <= nowMs) this.launchTokens.delete(hash);
    const token = newToken();
    const expiresAt = nowMs + LAUNCH_TOKEN_TTL_MS;
    this.launchTokens.set(sha256(token), expiresAt);
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** Returns a new session id, or null if the token is unknown, expired or already used. */
  redeemLaunchToken(token: string): { id: string; session: Session } | null {
    const hash = sha256(token);
    const exp = this.launchTokens.get(hash);
    this.launchTokens.delete(hash);
    if (exp === undefined || exp <= this.now()) return null;
    return this.create();
  }

  private create(): { id: string; session: Session } {
    const id = newToken();
    const csrf = newToken();
    const nowIso = new Date(this.now()).toISOString();
    this.db
      .prepare('INSERT INTO dashboard_sessions (id_hash, csrf_token, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .run(sha256(id), csrf, nowIso, new Date(this.now() + SESSION_TTL_MS).toISOString(), nowIso);
    this.db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(nowIso);
    return { id, session: { csrf } };
  }

  lookup(id: string): Session | null {
    const row = this.db
      .prepare('SELECT csrf_token FROM dashboard_sessions WHERE id_hash = ? AND expires_at > ?')
      .get(sha256(id), new Date(this.now()).toISOString()) as { csrf_token: string } | undefined;
    return row ? { csrf: row.csrf_token } : null;
  }

  revoke(id: string): void {
    this.db.prepare('DELETE FROM dashboard_sessions WHERE id_hash = ?').run(sha256(id));
  }
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

export function sessionCookie(id: string): string {
  // No Secure flag: the dashboard is plain HTTP on loopback. SameSite=Strict plus the Host,
  // Origin, Sec-Fetch-Site and CSRF-header checks provide the cross-site protection.
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
