import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { type AppPaths, findGitRoot } from '../core/paths.js';
import { VERSION } from '../core/version.js';
import type { SecretStore } from '../vault/secrets.js';
import { CLASSIFICATION } from './classification.js';
import { type Db, inspectDb, latestKnownVersion, openDb, schemaVersion } from './db.js';

// Export, backup, restore and delete of everything Career Strike stores for the candidate.
// None of these talk to the network; all of them write owner-only files.

export class LifecycleError extends Error {}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Secrets are named here so delete can remove them from the keychain or secret files too. */
export const SECRET_NAMES = ['approval-key'] as const;

/** Everything in the data directory that Career Strike creates. Anything else is left alone. */
const OWNED = ['career-strike.db', 'career-strike.db-wal', 'career-strike.db-shm', 'vault', 'logs', 'backups', 'mcp', 'secrets', 'service.json'];

function prepareOutDir(outDir: string): string {
  const dir = path.resolve(outDir);
  const repo = findGitRoot(dir);
  if (repo) throw new LifecycleError(`Refusing to write career data inside the git working tree ${repo}. Choose a folder outside any repository.`);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new LifecycleError(`${dir} is not empty. Choose a new or empty folder.`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  return dir;
}

function writePrivate(file: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, data, { mode: 0o600, flag: 'wx' });
}

function requireDb(paths: AppPaths): void {
  if (inspectDb(paths.db) === null) throw new LifecycleError(`There is no Career Strike data at ${paths.home}.`);
}

interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

// ---- export: a readable archive for the candidate ----

/** Tables left out of exports: login sessions hold nothing but credential hashes and timestamps. */
const NOT_EXPORTED = new Set(['dashboard_sessions']);

export interface ExportResult {
  dir: string;
  tables: Record<string, number>;
  documents: number;
  omitted: string[];
}

/**
 * Write every table (credential columns removed) as JSON and every stored document as a file,
 * with a manifest of hashes. Rows are read in one transaction so the archive is consistent.
 */
export function exportData(paths: AppPaths, outDir: string): ExportResult {
  requireDb(paths);
  const dir = prepareOutDir(outDir);
  const db = openDb(paths.db);
  const files: ManifestFile[] = [];
  const add = (rel: string, data: Buffer): void => {
    writePrivate(path.join(dir, rel), data);
    files.push({ path: rel, bytes: data.length, sha256: sha256(data) });
  };
  try {
    const omitted: string[] = ['Login sessions (dashboard_sessions)'];
    const tables: Record<string, unknown[]> = {};
    let docs: { id: string; filename: string }[] = [];
    db.transaction(() => {
      for (const [table, columns] of Object.entries(CLASSIFICATION)) {
        if (NOT_EXPORTED.has(table)) continue;
        const keep = Object.entries(columns).filter(([, c]) => c.class !== 'SECRET').map(([name]) => name);
        const secret = Object.entries(columns).filter(([, c]) => c.class === 'SECRET').map(([name]) => `${table}.${name}`);
        omitted.push(...secret.map((s) => `Credential column ${s}`));
        tables[table] = db.prepare(`SELECT ${keep.map((k) => `"${k}"`).join(', ')} FROM "${table}"`).all();
      }
      docs = db.prepare('SELECT id, filename FROM documents ORDER BY created_at').all() as { id: string; filename: string }[];
    })();
    for (const d of docs) {
      const file = path.join(paths.vault, 'documents', d.id);
      if (fs.existsSync(file)) add(path.join('documents', `${d.id}-${d.filename}`), fs.readFileSync(file));
    }
    const data = { format: 'career-strike-export', formatVersion: 1, exportedAt: new Date().toISOString(), appVersion: VERSION, schemaVersion: schemaVersion(db), tables };
    add('career-data.json', Buffer.from(JSON.stringify(data, null, 2)));
    add(
      'README.txt',
      Buffer.from(
        'This folder is a complete export of your Career Strike data.\n' +
          'career-data.json holds every record; documents/ holds the files you uploaded.\n' +
          'Login sessions, credential hashes and approval signatures are left out on purpose.\n' +
          'It contains private information: keep it somewhere only you can read.\n',
      ),
    );
    writePrivate(path.join(dir, 'manifest.json'), JSON.stringify({ files, omitted }, null, 2));
    return { dir, tables: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])), documents: docs.length, omitted };
  } finally {
    db.close();
  }
}

// ---- backup and restore: an exact copy for putting things back ----

interface BackupManifest {
  format: 'career-strike-backup';
  formatVersion: 1;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  files: ManifestFile[];
}

/** A consistent copy of the database (VACUUM INTO) and all documents, safe while the service runs. */
export function backup(paths: AppPaths, outDir: string): { dir: string; files: number; schemaVersion: number } {
  requireDb(paths);
  const dir = prepareOutDir(outDir);
  const db = openDb(paths.db);
  const files: ManifestFile[] = [];
  let version: number;
  try {
    version = schemaVersion(db);
    const dbCopy = path.join(dir, 'career-strike.db');
    db.prepare('VACUUM INTO ?').run(dbCopy);
    if (process.platform !== 'win32') fs.chmodSync(dbCopy, 0o600);
    const bytes = fs.readFileSync(dbCopy);
    files.push({ path: 'career-strike.db', bytes: bytes.length, sha256: sha256(bytes) });
  } finally {
    db.close();
  }
  const docDir = path.join(paths.vault, 'documents');
  for (const name of fs.existsSync(docDir) ? fs.readdirSync(docDir) : []) {
    const data = fs.readFileSync(path.join(docDir, name));
    writePrivate(path.join(dir, 'documents', name), data);
    files.push({ path: `documents/${name}`, bytes: data.length, sha256: sha256(data) });
  }
  const manifest: BackupManifest = { format: 'career-strike-backup', formatVersion: 1, createdAt: new Date().toISOString(), appVersion: VERSION, schemaVersion: version, files };
  writePrivate(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, files: files.length, schemaVersion: version };
}

function readManifest(dir: string): BackupManifest {
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as BackupManifest;
  } catch {
    throw new LifecycleError(`${dir} is not a Career Strike backup (no readable manifest.json).`);
  }
  if (manifest.format !== 'career-strike-backup' || manifest.formatVersion !== 1) throw new LifecycleError(`${dir} is not a Career Strike backup this version can read.`);
  if (manifest.schemaVersion > latestKnownVersion()) {
    throw new LifecycleError(`This backup is from a newer Career Strike (schema v${manifest.schemaVersion}). Upgrade Career Strike before restoring it.`);
  }
  for (const f of manifest.files) {
    if (f.path !== 'career-strike.db' && !/^documents\/doc_[A-Za-z0-9_-]+$/.test(f.path)) throw new LifecycleError(`The backup manifest names an unexpected file: ${f.path}`);
    const file = path.resolve(dir, f.path);
    if (!file.startsWith(path.resolve(dir) + path.sep)) throw new LifecycleError(`The backup manifest names a file outside the backup: ${f.path}`);
    if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== f.sha256) throw new LifecycleError(`The backup is damaged: ${f.path} is missing or does not match its recorded hash. Nothing was changed.`);
  }
  return manifest;
}

/**
 * Replace the current data with a verified backup. The current data is first moved aside to
 * backups/pre-restore-<time>, so a restore can itself be undone. The service must be stopped.
 */
export function restore(paths: AppPaths, fromDir: string): { previous: string | null; schemaVersion: number } {
  const dir = path.resolve(fromDir);
  const manifest = readManifest(dir);
  // The copy must open as a database before anything is touched.
  const probe = new Database(path.join(dir, 'career-strike.db'), { readonly: true, fileMustExist: true });
  probe.prepare('SELECT COUNT(*) FROM schema_migrations').get();
  probe.close();

  let previous: string | null = null;
  if (fs.existsSync(paths.db)) {
    previous = path.join(paths.home, 'backups', `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(previous, { recursive: true, mode: 0o700 });
    for (const name of ['career-strike.db', 'career-strike.db-wal', 'career-strike.db-shm']) {
      const file = path.join(paths.home, name);
      if (fs.existsSync(file)) fs.renameSync(file, path.join(previous, name));
    }
    const docs = path.join(paths.vault, 'documents');
    if (fs.existsSync(docs)) fs.renameSync(docs, path.join(previous, 'documents'));
  }
  fs.mkdirSync(path.join(paths.vault, 'documents'), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(dir, 'career-strike.db'), paths.db);
  fs.chmodSync(paths.db, 0o600);
  for (const f of manifest.files.filter((x) => x.path.startsWith('documents/'))) {
    const target = path.join(paths.vault, f.path);
    fs.copyFileSync(path.join(dir, f.path), target);
    fs.chmodSync(target, 0o600);
  }
  // Opening applies any newer migrations to an older backup.
  const db = openDb(paths.db);
  const version = schemaVersion(db);
  db.close();
  return { previous, schemaVersion: version };
}

// ---- delete ----

export interface DeleteResult {
  removed: string[];
  /** Files in the data directory that Career Strike did not create, left untouched. */
  leftInPlace: string[];
  secretsRemoved: string[];
}

/** Remove all career data and Career Strike's secrets, then check that none of it remains. */
export async function deleteAllData(paths: AppPaths, secrets: SecretStore): Promise<DeleteResult> {
  const removed: string[] = [];
  for (const name of OWNED) {
    const target = path.join(paths.home, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(name);
    }
  }
  const secretsRemoved: string[] = [];
  for (const name of SECRET_NAMES) {
    await secrets.delete(name);
    secretsRemoved.push(name);
  }
  const still = OWNED.filter((n) => fs.existsSync(path.join(paths.home, n)));
  if (still.length > 0) throw new LifecycleError(`Could not remove: ${still.join(', ')}`);
  const leftInPlace = fs.existsSync(paths.home) ? fs.readdirSync(paths.home) : [];
  if (fs.existsSync(paths.home) && leftInPlace.length === 0) fs.rmdirSync(paths.home);
  return { removed, leftInPlace, secretsRemoved };
}

// ---- rollback and backup queries ----

export interface BackupItem {
  name: string;
  kind: 'pre-upgrade' | 'pre-restore' | 'pre-rollback' | 'manual';
  createdAt: string;
  bytes: number;
  schemaVersion?: number;
}

export function listBackups(paths: AppPaths): { count: number; latest: BackupItem | null; backups: BackupItem[] } {
  const dir = path.join(paths.home, 'backups');
  if (!fs.existsSync(dir)) return { count: 0, latest: null, backups: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const backups: BackupItem[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      const stat = fs.statSync(full);
      const isDir = entry.isDirectory();
      if (isDir) {
        if (entry.name.startsWith('pre-restore-')) {
          backups.push({ name: entry.name, kind: 'pre-restore', createdAt: stat.mtime.toISOString(), bytes: stat.size });
        } else if (entry.name.startsWith('pre-rollback-')) {
          backups.push({ name: entry.name, kind: 'pre-rollback', createdAt: stat.mtime.toISOString(), bytes: stat.size });
        } else {
          backups.push({ name: entry.name, kind: 'manual', createdAt: stat.mtime.toISOString(), bytes: stat.size });
        }
      } else if (entry.isFile()) {
        const m = /^career-strike-v(\d+)-.*\.db$/.exec(entry.name);
        if (m) {
          backups.push({
            name: entry.name,
            kind: 'pre-upgrade',
            createdAt: stat.mtime.toISOString(),
            bytes: stat.size,
            schemaVersion: Number(m[1]),
          });
        } else {
          backups.push({ name: entry.name, kind: 'manual', createdAt: stat.mtime.toISOString(), bytes: stat.size });
        }
      }
    } catch {
      // Ignore unreadable entries
    }
  }
  backups.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { count: backups.length, latest: backups[0] ?? null, backups };
}

export function rollback(paths: AppPaths, options: { targetFile?: string } = {}): { restoredFrom: string; schemaVersion: number; previous: string | null } {
  const backupsDir = path.join(paths.home, 'backups');
  let backupFile: string;
  if (options.targetFile) {
    backupFile = path.resolve(options.targetFile);
    if (!fs.existsSync(backupFile)) throw new LifecycleError(`Backup file not found: ${backupFile}`);
  } else {
    if (!fs.existsSync(backupsDir)) throw new LifecycleError(`No pre-upgrade backup found in ${backupsDir}.`);
    const preUpgrades = listBackups(paths).backups.filter((b) => b.kind === 'pre-upgrade');
    if (preUpgrades.length === 0) throw new LifecycleError(`No pre-upgrade backup found in ${backupsDir}.`);
    backupFile = path.join(backupsDir, preUpgrades[0]!.name);
  }

  const probe = new Database(backupFile, { readonly: true, fileMustExist: true });
  let version: number;
  try {
    version = schemaVersion(probe);
  } finally {
    probe.close();
  }

  let previous: string | null = null;
  if (fs.existsSync(paths.db)) {
    previous = path.join(paths.home, 'backups', `pre-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(previous, { recursive: true, mode: 0o700 });
    for (const name of ['career-strike.db', 'career-strike.db-wal', 'career-strike.db-shm']) {
      const file = path.join(paths.home, name);
      if (fs.existsSync(file)) fs.renameSync(file, path.join(previous, name));
    }
  }

  fs.copyFileSync(backupFile, paths.db);
  if (process.platform !== 'win32') fs.chmodSync(paths.db, 0o600);
  return { restoredFrom: backupFile, schemaVersion: version, previous };
}

export function buildExportPayload(db: Db, paths: AppPaths): Record<string, unknown> {
  const omitted: string[] = ['Login sessions (dashboard_sessions)'];
  const tables: Record<string, unknown[]> = {};
  let docs: { id: string; filename: string; mime?: string; size_bytes?: number }[] = [];
  db.transaction(() => {
    for (const [table, columns] of Object.entries(CLASSIFICATION)) {
      if (NOT_EXPORTED.has(table)) continue;
      const keep = Object.entries(columns).filter(([, c]) => c.class !== 'SECRET').map(([name]) => name);
      const secret = Object.entries(columns).filter(([, c]) => c.class === 'SECRET').map(([name]) => `${table}.${name}`);
      omitted.push(...secret.map((s) => `Credential column ${s}`));
      tables[table] = db.prepare(`SELECT ${keep.map((k) => `"${k}"`).join(', ')} FROM "${table}"`).all();
    }
    docs = db.prepare('SELECT id, filename, mime, size_bytes FROM documents ORDER BY created_at').all() as {
      id: string;
      filename: string;
      mime?: string;
      size_bytes?: number;
    }[];
  })();

  const documents = docs.map((d) => {
    const file = path.join(paths.vault, 'documents', d.id);
    const exists = fs.existsSync(file);
    return {
      id: d.id,
      filename: d.filename,
      mime: d.mime ?? 'application/octet-stream',
      sizeBytes: d.size_bytes ?? 0,
      dataBase64: exists ? fs.readFileSync(file).toString('base64') : null,
    };
  });

  return {
    format: 'career-strike-export',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: VERSION,
    schemaVersion: schemaVersion(db),
    tables,
    documents,
    omitted,
  };
}
