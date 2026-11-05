import { useState } from 'react';
import { api, type SourceBoard, type Task } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ago, SOURCE_LABEL } from '../../../format';
import { ExternalLink } from '../../../router';

const HEALTH: Record<SourceBoard['health'], string> = {
  NEVER_RUN: 'Not fetched yet',
  OK: 'Working',
  DEGRADED: 'Last fetch failed',
  NOT_FOUND: 'Board not found',
};

const HEALTH_VARIANT: Record<SourceBoard['health'], 'teal' | 'warning' | 'destructive' | 'secondary'> = {
  OK: 'teal',
  DEGRADED: 'warning',
  NOT_FOUND: 'destructive',
  NEVER_RUN: 'secondary',
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
    <li
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-xs transition-colors hover:border-foreground/20"
      data-board={board.board}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
          <ExternalLink href={board.boardUrl}>{board.board}</ExternalLink>
          <span className="text-muted-foreground font-normal text-xs">· {SOURCE_LABEL[board.source]}</span>
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant={HEALTH_VARIANT[board.health]}>{HEALTH[board.health]}</Badge>
          {board.lastSuccessAt && (
            <span className="text-muted-foreground">Last successful fetch {ago(board.lastSuccessAt)}.</span>
          )}
        </div>
        {board.lastError && board.health !== 'OK' && <p className="text-xs text-destructive">{board.lastError}</p>}
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
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
      <div className="flex items-center gap-2 shrink-0">
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
