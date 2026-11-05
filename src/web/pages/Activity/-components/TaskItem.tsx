import type { Task } from '../../../api';
import { Button } from '../../../components/ui/button';
import { ago, SOURCE_LABEL } from '../../../format';

export interface ActivityBoard {
  id: string;
  source: string;
  board: string;
  health: string;
  consecutiveFailures: number;
  nextAttemptAt: string | null;
  lastError: string | null;
}

export const TRIGGER: Record<string, string> = {
  manual: 'started by you',
  'board-added': 'board added',
  schedule: 'scheduled',
  recovery: 'retried after a restart',
  'approved-submission': 'after your approval',
};

export function describeTask(t: Task, boards: ActivityBoard[]): string {
  if (t.kind.startsWith('discover:')) {
    const b = boards.find((x) => x.id === t.kind.slice(9));
    return b ? `Fetch ${SOURCE_LABEL[b.source] ?? b.source} board “${b.board}”` : 'Fetch a job board (since removed)';
  }
  if (t.kind.startsWith('submit:')) return 'Submit an approved application to the practice endpoint';
  return t.kind;
}

export function RunningTaskRow({
  task: t,
  boards,
  onCancel,
}: {
  task: Task;
  boards: ActivityBoard[];
  onCancel: (id: string) => Promise<void>;
}) {
  return (
    <li className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card shadow-xs">
      <div className="space-y-1 flex-1 min-w-0">
        <h3 className="text-base font-semibold text-foreground m-0 truncate">{describeTask(t, boards)}</h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground m-0">
          <span>{TRIGGER[t.trigger] ?? t.trigger}</span>
          <span>•</span>
          <span>started {ago(t.startedAt ?? t.createdAt)}</span>
          <span>•</span>
          <span>last heartbeat {ago(t.heartbeatAt)}</span>
          {typeof t.progress?.step === 'string' && (
            <>
              <span>•</span>
              <span>step: {t.progress.step}</span>
            </>
          )}
        </p>
      </div>
      <div className="shrink-0">
        {t.kind.startsWith('discover:') ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void onCancel(t.id)}>
            Cancel<span className="sr-only"> {describeTask(t, boards)}</span>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Sending cannot be cancelled safely</span>
        )}
      </div>
    </li>
  );
}
