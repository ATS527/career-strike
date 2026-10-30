import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLASSIFICATION, classOf, type DataClass, DATA_CLASSES, derivationViolations, strictest } from '../../src/store/classification.js';
import { openDb } from '../../src/store/db.js';
import { SETTING_DEFS } from '../../src/store/settings.js';
import { tempDir } from '../helpers.js';

function liveSchema(): Record<string, string[]> {
  const db = openDb(path.join(tempDir(), 'schema.db'));
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
    return Object.fromEntries(tables.map((t) => [t, (db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map((c) => c.name).sort()]));
  } finally {
    db.close();
  }
}

describe('data classification', () => {
  it('classifies every table and column in the migrated schema, and nothing that does not exist', () => {
    const schema = liveSchema();
    expect(Object.keys(CLASSIFICATION).sort()).toEqual(Object.keys(schema).sort());
    for (const [table, columns] of Object.entries(schema)) expect(Object.keys(CLASSIFICATION[table]!).sort(), table).toEqual(columns);
  });

  it('derived records are at least as strict as everything they are derived from', () => {
    expect(derivationViolations()).toEqual([]);
    expect(classOf('application_versions', 'payload_json')).toBe('SENSITIVE');
    expect(classOf('strategy_snapshots', 'metrics_json')).toBe('SENSITIVE');
    expect(strictest(['PUBLIC', 'PERSONAL', 'INTERNAL'])).toBe('PERSONAL');
    expect(strictest([])).toBe('PUBLIC');
  });

  it('credentials are SECRET and the settings column covers its strictest setting', () => {
    for (const col of ['dashboard_sessions.id_hash', 'dashboard_sessions.csrf_token', 'mcp_clients.token_hash', 'approvals.mac']) {
      const [table, column] = col.split('.') as [string, string];
      expect(classOf(table, column), col).toBe('SECRET');
    }
    const rank = (c: DataClass) => DATA_CLASSES.indexOf(c);
    const strictestSetting = strictest(Object.values(SETTING_DEFS).map((d) => d.classification));
    expect(rank(classOf('settings', 'value_json')!)).toBeGreaterThanOrEqual(rank(strictestSetting));
    expect(classOf('profile_facts', 'value_json')).toBe('SENSITIVE');
    expect(classOf('documents', 'filename')).toBe('SENSITIVE');
  });
});
