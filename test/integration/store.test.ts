import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestKnownVersion, migrate, openDb, SchemaTooNewError, schemaVersion } from '../../src/store/db.js';
import { MIGRATIONS } from '../../src/store/migrations.js';
import { getSettings, SettingError, setSetting } from '../../src/store/settings.js';
import { tempDir } from '../helpers.js';

const dbFile = (): string => path.join(tempDir('cs-db-'), 'test.db');

describe('database', () => {
  it('applies migrations once and is idempotent', () => {
    const db = openDb(dbFile());
    expect(schemaVersion(db)).toBe(latestKnownVersion());
    expect(migrate(db)).toBe(latestKnownVersion());
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(MIGRATIONS.length);
    db.close();
  });

  it('refuses a database written by a newer build', () => {
    const file = dbFile();
    const db = openDb(file);
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (999, 'future', 'x')").run();
    db.close();
    expect(() => openDb(file)).toThrow(SchemaTooNewError);
  });

  it.skipIf(process.platform === 'win32')('creates the database file owner-only', () => {
    const file = dbFile();
    openDb(file).close();
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe('settings', () => {
  it('returns defaults, then persists values across reopen', () => {
    const file = dbFile();
    let db = openDb(file);
    expect(getSettings(db)['candidate.joiningAvailability']).toBe('unspecified');
    setSetting(db, 'candidate.joiningAvailability', 'immediate', 'test');
    setSetting(db, 'search.preferredRoles', ['Synthetic Platform Engineer'], 'test');
    db.close();
    db = openDb(file);
    expect(getSettings(db)).toMatchObject({
      'candidate.joiningAvailability': 'immediate',
      'search.preferredRoles': ['Synthetic Platform Engineer'],
    });
    db.close();
  });

  it('rejects unknown keys and invalid values without writing', () => {
    const db = openDb(dbFile());
    expect(() => setSetting(db, 'nope', 1, 'test')).toThrow(SettingError);
    expect(() => setSetting(db, '__proto__', 1, 'test')).toThrow(SettingError);
    expect(() => setSetting(db, 'search.remotePreference', 'anywhere', 'test')).toThrow(SettingError);
    expect(db.prepare('SELECT COUNT(*) FROM settings').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM audit_events').pluck().get()).toBe(0);
    db.close();
  });

  it('audits the key without recording the personal value', () => {
    const db = openDb(dbFile());
    setSetting(db, 'search.preferredRoles', ['SYNTHETIC-CANARY-ROLE'], 'test');
    const rows = db.prepare('SELECT * FROM audit_events').all();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('SYNTHETIC-CANARY-ROLE');
    expect(rows[0]).toMatchObject({ action: 'setting.updated', subject: 'search.preferredRoles', actor: 'test' });
    db.close();
  });
});
