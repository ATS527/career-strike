import { useState } from 'react';
import { api, type SourceBoard, type Task } from '../../../api';
import { Button } from '../../../components/ui/button';
import { ago, SOURCE_LABEL } from '../../../format';
import { ExternalLink } from '../../../router';

const HEALTH: Record<SourceBoard['health'], string> = {
  NEVER_RUN: 'Not fetched yet',
  OK: 'Working',
  DEGRADED: 'Last fetch failed',
  NOT_FOUND: 'Board not found',
};

export function BoardRow({
  board,
  task,
  onTask,
  onRemoved,
}: {
  board: SourceBoard;
  task: Task | undefined;
  onTask: (t: Task) => void;
  onRemoved: () => void;
}) {
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
          {running && (
            <>
              Fetching postings…{' '}
              {task.progress?.step === 'saving' ? `saving ${String(task.progress.fetched)} postings` : ''}
            </>
          )}
          {outcome}
          {error}
        </p>
      </div>
      <div className="board__actions">
        {running ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void cancel()}>
            Cancel
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => void fetchNow()}>
            Fetch now
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => void remove()}>
          Stop monitoring
        </Button>
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
