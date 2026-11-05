import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations.js';

export type Db = Database.Database;

export class SchemaTooNewError extends Error {}

export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    readonly backupFile: string | null,
    cause: unknown,
  ) {
    super(
      `Migration v${migration.version} (${migration.name}) failed and was rolled back` +
        (backupFile ? `; a pre-migration backup is at ${backupFile}` : '') +
        `: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

export function latestKnownVersion(migrations: readonly Migration[] = MIGRATIONS): number {
  return migrations.reduce((max, m) => Math.max(max, m.version), 0);
}

export function openDb(file: string, migrations: readonly Migration[] = MIGRATIONS): Db {
  const db = new Database(file);
  try {
    if (file !== ':memory:' && process.platform !== 'win32') fs.chmodSync(file, 0o600);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // better-sqlite3 waits synchronously, so keep the wait short: a busy database becomes a clear 503.
    db.pragma('busy_timeout = 2000');
    migrate(db, migrations, file === ':memory:' ? null : path.join(path.dirname(file), 'backups'));
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

/**
 * Apply pending migrations, each in its own IMMEDIATE transaction. When an existing database
 * (schema > 0) is about to change, a consistent copy is written to backupDir first.
 */
export function migrate(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS,
  backupDir: string | null = null,
): number {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const current = schemaVersion(db);
  const latest = latestKnownVersion(migrations);
  if (current > latest) {
    throw new SchemaTooNewError(
      `Database schema v${current} is newer than this build supports (v${latest}). Upgrade Career Strike instead of downgrading.`,
    );
  }
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  if (pending.length === 0) return current;

  let backupFile: string | null = null;
  if (backupDir && current > 0) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    backupFile = path.join(backupDir, `career-strike-v${current}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.prepare('VACUUM INTO ?').run(backupFile);
    if (process.platform !== 'win32') fs.chmodSync(backupFile, 0o600);
  }

  const insert = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  for (const m of pending) {
    try {
      db.transaction(() => {
        // Re-check inside the write lock: another process may have migrated concurrently.
        if (schemaVersion(db) >= m.version) return;
        db.exec(m.sql);
        insert.run(m.version, m.name, new Date().toISOString());
      }).immediate();
    } catch (err) {
      throw new MigrationError(m, backupFile, err);
    }
  }
  return schemaVersion(db);
}
