import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../store/db.js';

/**
 * What an AI assistant may do. Public job data and saving dispositions are granted on connect;
 * anything derived from the candidate's profile or applications needs an explicit grant.
 */
export const SCOPES = {
  'public:read': 'Search and read public job postings',
  'public:write': 'Add jobs and job boards',
  'dispositions:write': 'Shortlist or exclude jobs',
  'personal:read': 'See your shortlist, monitored boards and application statuses',
  'sensitive:read': 'See how jobs fit your profile (skills, experience, salary, availability)',
} as const;

export type Scope = keyof typeof SCOPES;
export const DEFAULT_SCOPES: readonly Scope[] = ['public:read', 'public:write', 'dispositions:write'];
export const KNOWN_CLIENTS = ['codex', 'claude-code', 'opencode'] as const;

/** An assistant counts as connected if it made a request within this window. */
export const CONNECTED_WITHIN_MS = 15 * 60 * 1000;

export interface McpClient {
  id: string;
  name: string;
  scopes: Scope[];
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

interface Row {
  id: string;
  name: string;
  token_hash: string;
  scopes_json: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
const toClient = (r: Row): McpClient => ({
  id: r.id,
  name: r.name,
  scopes: JSON.parse(r.scopes_json) as Scope[],
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  revokedAt: r.revoked_at,
});

export class McpClientStore {
  constructor(private readonly db: Db) {}

  /** Create a client for an assistant, revoking any earlier one with the same name. */
  create(name: string, actor: string): { client: McpClient; token: string } {
    const id = `mcp_${randomBytes(9).toString('base64url')}`;
    const token = `csm_${randomBytes(32).toString('base64url')}`;
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare('UPDATE mcp_clients SET revoked_at = ? WHERE name = ? AND revoked_at IS NULL').run(at, name);
      this.db
        .prepare('INSERT INTO mcp_clients (id, name, token_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, name, sha256(token), JSON.stringify(DEFAULT_SCOPES), at);
      this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'mcp.client.created', `${name}:${id}`);
    })();
    return { client: this.get(id)!, token };
  }

  /** Resolve a bearer token to an active client, noting when it was last used. */
  authenticate(token: string): McpClient | null {
    if (!token.startsWith('csm_')) return null;
    const row = this.db.prepare('SELECT * FROM mcp_clients WHERE token_hash = ? AND revoked_at IS NULL').get(sha256(token)) as Row | undefined;
    if (!row) return null;
    const now = Date.now();
    if (!row.last_seen_at || now - Date.parse(row.last_seen_at) > 30_000) {
      this.db.prepare('UPDATE mcp_clients SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), row.id);
    }
    return toClient(row);
  }

  get(id: string): McpClient | null {
    const row = this.db.prepare('SELECT * FROM mcp_clients WHERE id = ?').get(id) as Row | undefined;
    return row ? toClient(row) : null;
  }

  list(): McpClient[] {
    return (this.db.prepare('SELECT * FROM mcp_clients WHERE revoked_at IS NULL ORDER BY created_at').all() as Row[]).map(toClient);
  }

  setScopes(id: string, scopes: Scope[], actor: string): McpClient | null {
    const unique = [...new Set<Scope>([...DEFAULT_SCOPES, ...scopes])];
    const at = new Date().toISOString();
    const changed = this.db.prepare('UPDATE mcp_clients SET scopes_json = ? WHERE id = ? AND revoked_at IS NULL').run(JSON.stringify(unique), id).changes;
    if (!changed) return null;
    this.db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)').run(at, actor, 'mcp.client.scopes', id, JSON.stringify({ scopes: unique }));
    return this.get(id);
  }

  revoke(id: string, actor: string): boolean {
    const at = new Date().toISOString();
    const changed = this.db.prepare('UPDATE mcp_clients SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id).changes;
    if (changed) this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'mcp.client.revoked', id);
    return changed === 1;
  }

  revokeByName(name: string, actor: string): number {
    const ids = (this.db.prepare('SELECT id FROM mcp_clients WHERE name = ? AND revoked_at IS NULL').pluck().all(name) as string[]);
    for (const id of ids) this.revoke(id, actor);
    return ids.length;
  }

  connected(now = Date.now()): McpClient[] {
    return this.list().filter((c) => c.lastSeenAt && now - Date.parse(c.lastSeenAt) <= CONNECTED_WITHIN_MS);
  }
}
