import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, type SourceBoard, type Task } from '../api';
import { ago, SOURCE_LABEL } from '../format';
import { ExternalLink, Link } from '../router';
import { ErrorPanel, Loading } from './states';

const HEALTH: Record<SourceBoard['health'], string> = {
  NEVER_RUN: 'Not fetched yet',
  OK: 'Working',
  DEGRADED: 'Last fetch failed',
  NOT_FOUND: 'Board not found',
};

export function Sources() {
  const [boards, setBoards] = useState<SourceBoard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tasks, setTasks] = useState<Record<string, Task>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ boards: SourceBoard[] }>('/api/sources');
      setBoards(res.boards);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => void load(), [load]);

  // Poll only tasks this page knows are active, and stop as soon as they finish.
  const active = Object.values(tasks).filter((t) => t.state === 'RUNNING' || t.state === 'QUEUED');
  const activeKey = active.map((t) => t.id).join(',');
  useEffect(() => {
    if (active.length === 0) return;
    const timer = window.setInterval(async () => {
      const updates = await Promise.all(active.map((t) => api<{ task: Task }>(`/api/tasks/${t.id}`).then((r) => r.task).catch(() => t)));
      setTasks((prev) => ({ ...prev, ...Object.fromEntries(updates.map((t) => [t.id, t])) }));
      if (updates.some((t) => t.state !== 'RUNNING' && t.state !== 'QUEUED')) void load();
    }, 1000);
    return () => window.clearInterval(timer);
    // `active` is fully determined by activeKey for this effect's purposes.
  }, [activeKey, load]);

  const track = (task: Task | null): void => {
    if (task) setTasks((prev) => ({ ...prev, [task.id]: task }));
  };

  const taskFor = (board: SourceBoard): Task | undefined => Object.values(tasks).find((t) => t.kind === `discover:${board.id}`);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          <Link href="/opportunities">Opportunities</Link> / Job boards
        </p>
        <h1>Job boards you monitor</h1>
        <p className="lede">
          Career Strike reads public job boards hosted on Greenhouse, Lever and Ashby directly from each company’s official
          listing. Nothing is sent about you.
        </p>
      </div>

      <AddBoardForm
        onAdded={(task) => {
          track(task);
          void load();
        }}
      />

      {loadError && <ErrorPanel message="Job boards could not be loaded." onRetry={() => void load()} />}
      {!boards && !loadError && <Loading label="Loading job boards" />}
      {boards && boards.length === 0 && <p className="empty">No job boards yet. Add one above.</p>}
      {boards && boards.length > 0 && (
        <ul className="board-list" data-testid="board-list">
          {boards.map((b) => (
            <BoardRow key={b.id} board={b} task={taskFor(b)} onTask={track} onRemoved={() => void load()} />
          ))}
        </ul>
      )}
    </>
  );
}

function AddBoardForm({ onAdded }: { onAdded: (task: Task | null) => void }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string } | { kind: 'added'; name: string }>({ kind: 'idle' });

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus({ kind: 'saving' });
    try {
      const res = await api<{ board: SourceBoard; task: Task | null }>('/api/sources', { method: 'POST', body: { url } });
      setUrl('');
      setStatus({ kind: 'added', name: `${SOURCE_LABEL[res.board.source]} · ${res.board.board}` });
      onAdded(res.task);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string } | null) : null;
      setStatus({ kind: 'error', message: body?.message ?? 'The board could not be added.' });
    }
  };

  return (
    <form className="add-board" onSubmit={(e) => void submit(e)}>
      <label htmlFor="board-url" className="field__label">
        Careers page link
      </label>
      <p className="help" id="board-url-help">
        For example <code>https://jobs.lever.co/company</code>, <code>https://job-boards.greenhouse.io/company</code> or{' '}
        <code>https://jobs.ashbyhq.com/company</code>.
      </p>
      <div className="add-board__row">
        <input id="board-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} aria-describedby="board-url-help board-url-status" />
        <button type="submit" disabled={status.kind === 'saving' || url.trim() === ''}>
          {status.kind === 'saving' ? 'Adding…' : 'Monitor this board'}
        </button>
      </div>
      <p id="board-url-status" role="status" aria-live="polite" className={`save-status save-status--${status.kind === 'error' ? 'error' : 'saved'}`}>
        {status.kind === 'error' && status.message}
        {status.kind === 'added' && `Added ${status.name}. Fetching its postings now.`}
      </p>
    </form>
  );
}

function BoardRow({ board, task, onTask, onRemoved }: { board: SourceBoard; task: Task | undefined; onTask: (t: Task) => void; onRemoved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const running = task && (task.state === 'RUNNING' || task.state === 'QUEUED');

  const fetchNow = async (): Promise<void> => {
    setError(null);
    try {
      onTask((await api<{ task: Task }>(`/api/sources/${board.id}/discover`, { method: 'POST' })).task);
    } catch {
      setError('Could not start fetching.');
    }
  };

  const cancel = async (): Promise<void> => {
    if (!task) return;
    await api(`/api/tasks/${task.id}/cancel`, { method: 'POST' }).catch(() => setError('Could not cancel.'));
  };

  const remove = async (): Promise<void> => {
    if (!window.confirm(`Stop monitoring ${board.board}? Jobs already found stay in your list.`)) return;
    try {
      await api(`/api/sources/${board.id}`, { method: 'DELETE' });
      onRemoved();
    } catch {
      setError('Could not remove.');
    }
  };

  const outcome = task && !running ? taskOutcome(task) : null;

  return (
    <li className="board" data-board={board.board}>
      <div>
        <h2 className="board__name">
          <ExternalLink href={board.boardUrl}>{board.board}</ExternalLink>
          <span className="muted"> · {SOURCE_LABEL[board.source]}</span>
        </h2>
        <p>
          <span className={`chip chip--health-${board.health.toLowerCase()}`}>
            <strong>{HEALTH[board.health]}</strong>
          </span>{' '}
          {board.lastSuccessAt && <span className="muted">Last successful fetch {ago(board.lastSuccessAt)}.</span>}
        </p>
        {board.lastError && board.health !== 'OK' && <p className="board__error">{board.lastError}</p>}
        <p role="status" aria-live="polite" className="board__task">
          {running && <>Fetching postings… {task.progress?.step === 'saving' ? `saving ${String(task.progress.fetched)} postings` : ''}</>}
          {outcome}
          {error}
        </p>
      </div>
      <div className="board__actions">
        {running ? (
          <button type="button" className="quiet" onClick={() => void cancel()}>
            Cancel
          </button>
        ) : (
          <button type="button" onClick={() => void fetchNow()}>
            Fetch now
          </button>
        )}
        <button type="button" className="quiet" onClick={() => void remove()}>
          Stop monitoring
        </button>
      </div>
    </li>
  );
}

function taskOutcome(task: Task): string {
  if (task.state === 'SUCCEEDED' && task.result) {
    const r = task.result as { fetched: number; added: number; closed: number };
    return `Done: ${r.fetched} postings found, ${r.added} new, ${r.closed} closed since last time.`;
  }
  if (task.state === 'FAILED') return `Fetch failed: ${task.error ?? 'unknown error'}`;
  if (task.state === 'CANCELLED') return 'Fetch cancelled. Nothing was changed.';
  if (task.state === 'INTERRUPTED') return 'Fetch was interrupted when the service stopped.';
  return '';
}
