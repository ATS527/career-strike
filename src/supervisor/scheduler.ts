import type { Discovery } from '../career/discovery.js';
import type { Logger } from '../core/log.js';
import { nullLogger } from '../core/log.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';

export const DISCOVERY_SCHEDULE = 'discover-boards';
const TICK_MS = 30_000;

/** Bounded exponential backoff for a failing board: 15 min, 30, 60 … capped at 24 h. */
export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(15 * 60_000 * 2 ** (consecutiveFailures - 1), 24 * 3600_000);
}

export interface ScheduleStatus {
  id: string;
  label: string;
  enabled: boolean;
  intervalHours: number;
  lastSlotAt: string | null;
  nextRunAt: string | null;
}

/**
 * Runs explicitly enabled background work from the service process. Each schedule slot is
 * claimed in the database before anything runs, so a slot executes once even if several
 * processes share the data directory.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly discovery: Discovery,
    private readonly logger: Logger = nullLogger,
    private readonly now: () => number = Date.now,
  ) {}

  private intervalMs(): number {
    return Number(getSettings(this.db)['monitoring.discoveryIntervalHours'] ?? '0') * 3600_000;
  }

  /** Claim the current slot and start discovery for boards not in backoff. Returns task ids started. */
  tick(): { claimed: boolean; started: string[]; skipped: string[] } {
    const interval = this.intervalMs();
    if (interval <= 0) return { claimed: false, started: [], skipped: [] };
    const now = this.now();
    const slot = new Date(Math.floor(now / interval) * interval).toISOString();
    const claimed =
      this.db
        .prepare('INSERT OR IGNORE INTO schedule_slots (schedule, slot, claimed_at, claimed_by) VALUES (?, ?, ?, ?)')
        .run(DISCOVERY_SCHEDULE, slot, new Date(now).toISOString(), process.pid).changes === 1;
    if (!claimed) return { claimed: false, started: [], skipped: [] };
    const started: string[] = [];
    const skipped: string[] = [];
    for (const board of this.discovery.listBoards()) {
      const next = this.db.prepare('SELECT next_attempt_at FROM source_boards WHERE id = ?').pluck().get(board.id) as
        | string
        | null;
      if (next && Date.parse(next) > now) {
        skipped.push(board.id);
        continue;
      }
      const run = this.discovery.discover(board.id, 'schedule', 'scheduler');
      if (run?.created) started.push(run.task.id);
    }
    this.db
      .prepare('UPDATE schedule_slots SET result = ? WHERE schedule = ? AND slot = ?')
      .run(JSON.stringify({ started, skipped }), DISCOVERY_SCHEDULE, slot);
    this.logger.info('scheduler.slot', { slot, started: started.length, skipped: skipped.length });
    return { claimed: true, started, skipped };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        this.logger.error('scheduler.tick-failed', { message: err instanceof Error ? err.message : String(err) });
      }
    }, TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): ScheduleStatus[] {
    const interval = this.intervalMs();
    const last = this.db
      .prepare('SELECT MAX(slot) FROM schedule_slots WHERE schedule = ?')
      .pluck()
      .get(DISCOVERY_SCHEDULE) as string | null;
    const now = this.now();
    return [
      {
        id: DISCOVERY_SCHEDULE,
        label: 'Check monitored job boards',
        enabled: interval > 0,
        intervalHours: interval / 3600_000,
        lastSlotAt: last,
        // The service checks every 30 s; the next slot starts at the next interval boundary.
        nextRunAt: interval > 0 ? new Date((Math.floor(now / interval) + 1) * interval).toISOString() : null,
      },
    ];
  }
}
