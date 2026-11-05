import { randomBytes } from 'node:crypto';
import type { Logger } from '../core/log.js';
import { nullLogger } from '../core/log.js';
import type { Db } from '../store/db.js';

export type TaskState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export interface Task {
  id: string;
  kind: string;
  trigger: string;
  client: string;
  params: unknown;
  state: TaskState;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  heartbeatAt: string | null;
  cancelRequested: boolean;
  attempt: number;
  /** True only while this service process is actually executing the task. */
  live: boolean;
  progress: unknown;
  result: unknown;
  error: string | null;
}

export interface TaskContext {
  signal: AbortSignal;
  progress(update: Record<string, unknown>): void;
}

export class TaskCancelledError extends Error {
  constructor() {
    super('Cancelled by request');
  }
}

const HEARTBEAT_MS = 5_000;

interface TaskRow {
  id: string;
  kind: string;
  trigger: string;
  client: string;
  params_json: string;
  state: TaskState;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  heartbeat_at: string | null;
  cancel_requested: number;
  attempt: number;
  progress_json: string | null;
  result_json: string | null;
  error: string | null;
}

const parseJson = (s: string | null): unknown => (s ? JSON.parse(s) : null);

function toTask(row: TaskRow, live = false): Task {
  return {
    id: row.id,
    kind: row.kind,
    trigger: row.trigger,
    client: row.client,
    params: parseJson(row.params_json),
    state: row.state,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    heartbeatAt: row.heartbeat_at,
    cancelRequested: row.cancel_requested === 1,
    attempt: row.attempt,
    live,
    progress: parseJson(row.progress_json),
    result: parseJson(row.result_json),
    error: row.error,
  };
}

/**
 * Supervised work owned by this service process. State lives in SQLite so the dashboard can show
 * what really happened; a task is only ever RUNNING while this process is executing it.
 */
export class TaskSupervisor {
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly db: Db,
    private readonly logger: Logger = nullLogger,
  ) {}

  /** Tasks left QUEUED/RUNNING by a previous process did not finish; say so instead of pretending. */
  recoverInterrupted(): Task[] {
    const at = new Date().toISOString();
    const rows = this.db
      .prepare("SELECT * FROM tasks WHERE state IN ('QUEUED', 'RUNNING') AND (owner_pid IS NULL OR owner_pid != ?)")
      .all(process.pid) as TaskRow[];
    const mark = this.db.prepare(
      "UPDATE tasks SET state = 'INTERRUPTED', ended_at = ?, error = 'The service stopped before this task finished.' WHERE id = ?",
    );
    this.db.transaction(() => rows.forEach((r) => mark.run(at, r.id)))();
    return rows.map((r) => toTask({ ...r, state: 'INTERRUPTED' }));
  }

  /**
   * Start a task unless one with the same dedupe key is already queued or running, in which case
   * that task is returned. The work runs in the background; the returned task is its record.
   */
  start(
    spec: { kind: string; dedupeKey: string; trigger: string; client: string; params: unknown; attempt?: number },
    work: (ctx: TaskContext) => Promise<unknown>,
  ): { task: Task; created: boolean } {
    const id = `task_${randomBytes(9).toString('base64url')}`;
    const at = new Date().toISOString();
    try {
      this.db
        .prepare(
          `INSERT INTO tasks (id, kind, dedupe_key, trigger, client, params_json, state, created_at, owner_pid, attempt)
           VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)`,
        )
        .run(
          id,
          spec.kind,
          spec.dedupeKey,
          spec.trigger,
          spec.client,
          JSON.stringify(spec.params),
          at,
          process.pid,
          spec.attempt ?? 1,
        );
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const existing = this.db
          .prepare("SELECT * FROM tasks WHERE dedupe_key = ? AND state IN ('QUEUED', 'RUNNING')")
          .get(spec.dedupeKey) as TaskRow | undefined;
        if (existing) return { task: toTask(existing, this.running.has(existing.id)), created: false };
      }
      throw err;
    }
    const controller = new AbortController();
    this.running.set(id, controller);
    void this.execute(id, controller, work);
    return { task: this.get(id)!, created: true };
  }

  private async execute(
    id: string,
    controller: AbortController,
    work: (ctx: TaskContext) => Promise<unknown>,
  ): Promise<void> {
    const now = (): string => new Date().toISOString();
    this.db
      .prepare("UPDATE tasks SET state = 'RUNNING', started_at = ?, heartbeat_at = ? WHERE id = ?")
      .run(now(), now(), id);
    const heartbeat = setInterval(() => {
      this.db.prepare("UPDATE tasks SET heartbeat_at = ? WHERE id = ? AND state = 'RUNNING'").run(now(), id);
    }, HEARTBEAT_MS);
    heartbeat.unref();
    try {
      const result = await work({
        signal: controller.signal,
        progress: (update) => {
          this.db
            .prepare('UPDATE tasks SET progress_json = ?, heartbeat_at = ? WHERE id = ?')
            .run(JSON.stringify(update), now(), id);
        },
      });
      if (controller.signal.aborted) throw new TaskCancelledError();
      this.finish(id, 'SUCCEEDED', { result });
    } catch (err) {
      if (controller.signal.aborted || err instanceof TaskCancelledError)
        this.finish(id, 'CANCELLED', { error: 'Cancelled by request' });
      else {
        const message = err instanceof Error ? err.message : String(err);
        this.finish(id, 'FAILED', { error: message });
        this.logger.warn('task.failed', { id, message });
      }
    } finally {
      clearInterval(heartbeat);
      this.running.delete(id);
    }
  }

  private finish(id: string, state: TaskState, outcome: { result?: unknown; error?: string }): void {
    this.db
      .prepare('UPDATE tasks SET state = ?, ended_at = ?, result_json = ?, error = ? WHERE id = ?')
      .run(
        state,
        new Date().toISOString(),
        outcome.result === undefined ? null : JSON.stringify(outcome.result),
        outcome.error ?? null,
        id,
      );
  }

  /** Request cancellation. Returns false if the task is not active in this process. */
  cancel(id: string): boolean {
    const controller = this.running.get(id);
    if (!controller) return false;
    this.db.prepare('UPDATE tasks SET cancel_requested = 1 WHERE id = ?').run(id);
    controller.abort(new TaskCancelledError());
    return true;
  }

  get(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? toTask(row, this.running.has(row.id)) : null;
  }

  list(limit = 50, kind?: string): Task[] {
    const rows = (
      kind
        ? this.db.prepare('SELECT * FROM tasks WHERE kind = ? ORDER BY created_at DESC LIMIT ?').all(kind, limit)
        : this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?').all(limit)
    ) as TaskRow[];
    return rows.map((r) => toTask(r, this.running.has(r.id)));
  }

  /** Wait for in-flight tasks to settle (used on shutdown and in tests). */
  async idle(timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.running.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  }

  /** Cancel everything this process is running, e.g. before shutdown. */
  async cancelAll(): Promise<void> {
    for (const id of [...this.running.keys()]) this.cancel(id);
    await this.idle(5_000);
  }
}
