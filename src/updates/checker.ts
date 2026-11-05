import type { Logger } from '../core/log.js';
import { nullLogger } from '../core/log.js';
import type { AppPaths } from '../core/paths.js';
import { VERSION } from '../core/version.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import { notesFor } from './changelog.js';
import { latestRelease, type ReleaseSourceOptions, UpdateError } from './releases.js';
import { type CheckState, readCheck, readHistory, writeCheck, writeHistory } from './state.js';
import { compareVersions } from './version.js';

export const UPDATE_CHECK_SETTING = 'monitoring.updateChecks';
const WEEK_MS = 7 * 24 * 3600_000;
const TICK_MS = 3600_000;
const FIRST_TICK_MS = 60_000;

export interface UpdateStatus {
  current: string;
  checks: 'off' | 'weekly';
  checkedAt: string | null;
  latest: CheckState['latest'];
  updateAvailable: boolean;
  error: string | null;
  /** Set once after `career-strike update`, until the candidate dismisses it. */
  whatsNew: { from: string; to: string; notes: string | null } | null;
}

/**
 * Looks for new releases from the service, but only when the candidate has turned checks on:
 * one request to GitHub's public release list, at most once a week, carrying no personal data.
 */
export class UpdateChecker {
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  private running: Promise<UpdateStatus> | null = null;

  constructor(
    private readonly db: Db,
    private readonly paths: AppPaths,
    private readonly logger: Logger = nullLogger,
    private readonly source: ReleaseSourceOptions = {},
    private readonly now: () => number = Date.now,
  ) {}

  private enabled(): boolean {
    return getSettings(this.db)[UPDATE_CHECK_SETTING] === 'weekly';
  }

  status(): UpdateStatus {
    const check = readCheck(this.paths);
    const history = readHistory(this.paths);
    const latest = check?.latest ?? null;
    const last = history.last;
    return {
      current: VERSION,
      checks: this.enabled() ? 'weekly' : 'off',
      checkedAt: check?.checkedAt ?? null,
      latest,
      updateAvailable: latest !== null && compareVersions(latest.version, VERSION) > 0,
      error: check?.error ?? null,
      whatsNew:
        last && last.to === VERSION && history.acknowledged !== VERSION
          ? { from: last.from, to: last.to, notes: notesFor(VERSION) }
          : null,
    };
  }

  /** Ask GitHub now. Concurrent callers share one request. */
  check(): Promise<UpdateStatus> {
    this.running ??= this.fetchLatest().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async fetchLatest(): Promise<UpdateStatus> {
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const r = await latestRelease(this.source);
      const latest = r
        ? { version: r.version, name: r.name, url: r.url, notes: r.notes, publishedAt: r.publishedAt }
        : null;
      writeCheck(this.paths, { checkedAt, latest, error: null });
      this.logger.info('updates.checked', { latest: latest?.version ?? null });
    } catch (err) {
      const message = err instanceof UpdateError ? err.message : 'The update check failed.';
      // Keep the last good answer; record when and why this check failed.
      writeCheck(this.paths, { checkedAt, latest: readCheck(this.paths)?.latest ?? null, error: message });
      this.logger.warn('updates.check-failed', { message });
    }
    return this.status();
  }

  acknowledge(): UpdateStatus {
    writeHistory(this.paths, { ...readHistory(this.paths), acknowledged: VERSION });
    return this.status();
  }

  /** Run a check if checks are on and the last one is over a week old. */
  async tick(): Promise<boolean> {
    if (!this.enabled()) return false;
    const last = Date.parse(readCheck(this.paths)?.checkedAt ?? '');
    if (Number.isFinite(last) && this.now() - last < WEEK_MS) return false;
    await this.check();
    return true;
  }

  start(): void {
    if (this.timer) return;
    const run = (): void => void this.tick().catch(() => undefined);
    this.first = setTimeout(run, FIRST_TICK_MS);
    this.first.unref();
    this.timer = setInterval(run, TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = null;
    this.timer = null;
  }
}
