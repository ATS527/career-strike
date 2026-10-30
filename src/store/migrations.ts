export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Forward-only. Never edit an applied migration; add a new one.
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'foundation',
    sql: `
      CREATE TABLE settings (
        key            TEXT PRIMARY KEY,
        value_json     TEXT NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN ('PUBLIC', 'PERSONAL', 'SENSITIVE')),
        updated_at     TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        at          TEXT NOT NULL,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        subject     TEXT,
        detail_json TEXT
      );
      CREATE INDEX audit_events_at ON audit_events (at);
    `,
  },
  {
    version: 2,
    name: 'dashboard_sessions',
    sql: `
      -- Session ids are stored hashed; the raw id only exists in the browser's HttpOnly cookie.
      CREATE TABLE dashboard_sessions (
        id_hash      TEXT PRIMARY KEY,
        csrf_token   TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX dashboard_sessions_expires ON dashboard_sessions (expires_at);
    `,
  },
];
