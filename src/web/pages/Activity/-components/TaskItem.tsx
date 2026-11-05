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
    <li className="job-row">
      <div className="job-row__main">
        <h3 className="job-row__title">{describeTask(t, boards)}</h3>
        <p className="job-row__meta">
          <span>{TRIGGER[t.trigger] ?? t.trigger}</span>
          <span>started {ago(t.startedAt ?? t.createdAt)}</span>
          <span>last heartbeat {ago(t.heartbeatAt)}</span>
          {typeof t.progress?.step === 'string' && <span>step: {t.progress.step}</span>}
        </p>
      </div>
      <div className="job-row__actions">
        {t.kind.startsWith('discover:') ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void onCancel(t.id)}>
            Cancel<span className="visually-hidden"> {describeTask(t, boards)}</span>
          </Button>
        ) : (
          <span className="muted">Sending cannot be cancelled safely</span>
        )}
      </div>
    </li>
  );
}
