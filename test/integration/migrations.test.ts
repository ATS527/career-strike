import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectDb, MigrationError, openDb, schemaVersion } from '../../src/store/db.js';
import { MIGRATIONS, type Migration } from '../../src/store/migrations.js';
import { setSetting } from '../../src/store/settings.js';
import { tempDir } from '../helpers.js';

const base = MIGRATIONS;
const good: Migration = { version: 100, name: 'add_widgets', sql: 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);' };
const broken: Migration = {
  version: 100,
  name: 'broken',
  sql: 'CREATE TABLE half_done (id INTEGER); THIS IS NOT SQL;',
};

describe('upgrade migrations', () => {
  it('backs up an existing database before applying new migrations', () => {
    const dir = tempDir('cs-mig-');
    const file = path.join(dir, 'career-strike.db');
    const db = openDb(file, base);
    setSetting(db, 'candidate.joiningAvailability', 'immediate', 'test');
    db.close();

    const upgraded = openDb(file, [...base, good]);
    expect(schemaVersion(upgraded)).toBe(100);
    upgraded.close();

    const backups = fs.readdirSync(path.join(dir, 'backups'));
    expect(backups).toHaveLength(1);
    const backup = path.join(dir, 'backups', backups[0]!);
    expect(inspectDb(backup)).toBe(base.at(-1)!.version);
    if (process.platform !== 'win32') expect(fs.statSync(backup).mode & 0o777).toBe(0o600);
  });

  it('does not create a backup for a brand-new database', () => {
    const dir = tempDir('cs-mig-');
    openDb(path.join(dir, 'career-strike.db'), base).close();
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(false);
  });

  it('rolls back a failed migration completely and leaves data intact', () => {
    const dir = tempDir('cs-mig-');
    const file = path.join(dir, 'career-strike.db');
    const db = openDb(file, base);
    setSetting(db, 'search.preferredRoles', ['Synthetic Data Engineer'], 'test');
    db.close();

    let error: unknown;
    try {
      openDb(file, [...base, broken]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).backupFile).toMatch(/backups/);

    const after = openDb(file, base);
    expect(schemaVersion(after)).toBe(base.at(-1)!.version);
    expect(after.prepare("SELECT COUNT(*) FROM sqlite_master WHERE name = 'half_done'").pluck().get()).toBe(0);
    expect(after.prepare("SELECT value_json FROM settings WHERE key = 'search.preferredRoles'").pluck().get()).toBe(
      '["Synthetic Data Engineer"]',
    );
    after.close();
  });
});
