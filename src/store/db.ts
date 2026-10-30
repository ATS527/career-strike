import fs from 'node:fs';
import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations.js';

export type Db = Database.Database;

export class SchemaTooNewError extends Error {}

export function latestKnownVersion(): number {
  return MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
}

export function openDb(file: string): Db {
  const db = new Database(file);
  try {
    if (file !== ':memory:' && process.platform !== 'win32') fs.chmodSync(file, 0o600);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

/** Read the schema version without migrating or writing. Returns null if the file is absent. */
export function inspectDb(file: string): number | null {
  if (!fs.existsSync(file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return schemaVersion(db);
  } finally {
    db.close();
  }
}

export function schemaVersion(db: Db): number {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!exists) return 0;
  return db.prepare('SELECT COALESCE(MAX(version), 0) FROM schema_migrations').pluck().get() as number;
}

export function migrate(db: Db): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const current = schemaVersion(db);
  if (current > latestKnownVersion()) {
    throw new SchemaTooNewError(
      `Database schema v${current} is newer than this build supports (v${latestKnownVersion()}). Upgrade Career Strike instead of downgrading.`,
    );
  }
  const insert = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      // Re-check inside the write lock: another process may have migrated concurrently.
      if (schemaVersion(db) >= m.version) return;
      db.exec(m.sql);
      insert.run(m.version, m.name, new Date().toISOString());
    }).immediate();
  }
  return schemaVersion(db);
}
