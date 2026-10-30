import { randomBytes } from 'node:crypto';
import type { Db } from '../store/db.js';
import { assertBoard } from '../sources/adapters.js';
import { type SourceAdapter, SourceError, type SourceId } from '../sources/types.js';
import type { Task, TaskSupervisor } from '../supervisor/tasks.js';
import { type SyncResult, syncBoard } from './jobs.js';

export interface SourceBoard {
  id: string;
  source: SourceId;
  board: string;
  boardUrl: string;
  addedAt: string;
  health: 'NEVER_RUN' | 'OK' | 'DEGRADED' | 'NOT_FOUND';
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastTask: { id: string; state: string; endedAt: string | null } | null;
}

interface BoardRow {
  id: string;
  source: SourceId;
  board: string;
  added_at: string;
  health: SourceBoard['health'];
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

export class DuplicateBoardError extends Error {}

export class Discovery {
  constructor(
    private readonly db: Db,
    private readonly adapters: Readonly<Record<SourceId, SourceAdapter>>,
    private readonly tasks: TaskSupervisor,
  ) {}

  addBoard(source: SourceId, board: string): SourceBoard {
    assertBoard(board);
    const id = `src_${randomBytes(9).toString('base64url')}`;
    try {
      this.db.prepare('INSERT INTO source_boards (id, source, board, added_at) VALUES (?, ?, ?, ?)').run(id, source, board, new Date().toISOString());
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new DuplicateBoardError(`${source}/${board} is already monitored`);
      throw err;
    }
    return this.getBoard(id)!;
  }

  /** Stop monitoring a board. Jobs already found are kept; they simply stop being re-verified. */
  removeBoard(id: string): boolean {
    return this.db.prepare('DELETE FROM source_boards WHERE id = ?').run(id).changes > 0;
  }

  listBoards(): SourceBoard[] {
    const rows = this.db.prepare('SELECT * FROM source_boards ORDER BY added_at').all() as BoardRow[];
    return rows.map((r) => this.toBoard(r));
  }

  getBoard(id: string): SourceBoard | null {
    const row = this.db.prepare('SELECT * FROM source_boards WHERE id = ?').get(id) as BoardRow | undefined;
    return row ? this.toBoard(row) : null;
  }

  private toBoard(r: BoardRow): SourceBoard {
    const last = this.tasks.list(1, `discover:${r.id}`)[0];
    return {
      id: r.id,
      source: r.source,
      board: r.board,
      boardUrl: this.adapters[r.source].boardUrl(r.board),
      addedAt: r.added_at,
      health: r.health,
      lastSuccessAt: r.last_success_at,
      lastError: r.last_error,
      consecutiveFailures: r.consecutive_failures,
      lastTask: last ? { id: last.id, state: last.state, endedAt: last.endedAt } : null,
    };
  }

  /** Fetch one board as a supervised task. A board already being fetched is not fetched twice. */
  discover(boardId: string, trigger: string, client: string): { task: Task; created: boolean } | null {
    const board = this.getBoard(boardId);
    if (!board) return null;
    return this.tasks.start(
      { kind: `discover:${board.id}`, dedupeKey: `discover:${board.id}`, trigger, client, params: { source: board.source, board: board.board } },
      async (ctx) => {
        ctx.progress({ step: 'fetching', source: board.source, board: board.board });
        let result: SyncResult;
        try {
          const postings = await this.adapters[board.source].list(board.board, ctx.signal);
          if (ctx.signal.aborted) throw ctx.signal.reason;
          ctx.progress({ step: 'saving', fetched: postings.length });
          result = syncBoard(this.db, board.source, board.board, postings);
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          // A failed fetch never touches job status or verification times.
          const health = err instanceof SourceError && err.kind === 'not_found' ? 'NOT_FOUND' : 'DEGRADED';
          const message = err instanceof Error ? err.message : String(err);
          this.db
            .prepare('UPDATE source_boards SET health = ?, last_error = ?, consecutive_failures = consecutive_failures + 1 WHERE id = ?')
            .run(health, message, board.id);
          throw err;
        }
        this.db
          .prepare("UPDATE source_boards SET health = 'OK', last_success_at = ?, last_error = NULL, consecutive_failures = 0 WHERE id = ?")
          .run(new Date().toISOString(), board.id);
        return result;
      },
    );
  }

  lastSuccessfulDiscovery(): string | null {
    return (this.db.prepare('SELECT MAX(last_success_at) FROM source_boards').pluck().get() as string | null) ?? null;
  }
}
