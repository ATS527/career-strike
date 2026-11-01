import fs from 'node:fs';
import path from 'node:path';
import type { AppPaths } from '../core/paths.js';

// Update bookkeeping lives in <data home>/updates: the result of the last check, the last update
// (so it can be undone and announced once), and the packages kept for undo.

export interface CheckState {
  checkedAt: string;
  latest: { version: string; name: string; url: string; notes: string; publishedAt: string | null } | null;
  error: string | null;
}

export interface UpdateRecord {
  from: string;
  to: string;
  at: string;
  /** The program that was replaced, packed so `update --undo` can reinstall it offline. */
  previousPackage: string | null;
  /** A full backup of the data taken just before the update. */
  backupDir: string | null;
  schemaBefore: number | null;
}

export interface History {
  last: UpdateRecord | null;
  /** The version whose "what's new" note the candidate has dismissed. */
  acknowledged: string | null;
}

export const updatesDir = (paths: AppPaths): string => path.join(paths.home, 'updates');
const checkFile = (paths: AppPaths): string => path.join(updatesDir(paths), 'check.json');
const historyFile = (paths: AppPaths): string => path.join(updatesDir(paths), 'history.json');

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export const readCheck = (paths: AppPaths): CheckState | null => readJson<CheckState>(checkFile(paths));
export const writeCheck = (paths: AppPaths, state: CheckState): void => writeJson(checkFile(paths), state);

export function readHistory(paths: AppPaths): History {
  return readJson<History>(historyFile(paths)) ?? { last: null, acknowledged: null };
}

export const writeHistory = (paths: AppPaths, history: History): void => writeJson(historyFile(paths), history);
