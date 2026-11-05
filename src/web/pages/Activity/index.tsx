import { useCallback, useEffect, useState } from 'react';
import { api, type Task } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ago, formatDateTime } from '../../format';
import { Link } from '../../router';
import { ErrorPanel, Loading } from '../states';
import { type ActivityBoard, describeTask, RunningTaskRow, TRIGGER } from './-components/TaskItem';

interface ActivityData {
  running: Task[];
  recent: (Task & { attempt: number; live: boolean })[];
  schedules: {
    id: string;
    label: string;
    enabled: boolean;
    intervalHours: number;
    lastSlotAt: string | null;
    nextRunAt: string | null;
  }[];
  boards: ActivityBoard[];
}

const STATE_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  INTERRUPTED: 'Interrupted',
};

export function Activity() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<ActivityData>('/api/activity'));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => void load(), [load]);
  const busy = (data?.running.length ?? 0) > 0;
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  if (error) return <ErrorPanel message="Activity could not be loaded." onRetry={() => void load()} />;
  if (!data) return <Loading label="Loading activity" />;
  const backoff = data.boards.filter((b) => b.nextAttemptAt && Date.parse(b.nextAttemptAt) > Date.now());

  const handleCancel = async (id: string): Promise<void> => {
    await api(`/api/tasks/${id}/cancel`, { method: 'POST' }).catch(() =>
      setMessage('Could not cancel; it may have just finished.'),
    );
    void load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="What Career Strike is doing"
        lede="Only real work appears here. A task shows as running only while the service is actually doing it."
      />

      <section className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs" aria-labelledby="running-title">
        <h2 id="running-title" className="text-lg font-bold text-foreground mb-4">
          Running now
        </h2>
        {data.running.length === 0 ? (
          <p className="text-sm text-muted-foreground italic my-2">Nothing is running.</p>
        ) : (
          <ul className="space-y-3 p-0 m-0 list-none" data-testid="running">
            {data.running.map((t) => (
              <RunningTaskRow key={t.id} task={t} boards={data.boards} onCancel={handleCancel} />
            ))}
          </ul>
        )}
        {message && (
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
            {message}
          </p>
        )}
      </section>

      <section className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs" aria-labelledby="sched-title">
        <h2 id="sched-title" className="text-lg font-bold text-foreground mb-4">
          Scheduled
        </h2>
        <ul className="space-y-2.5 p-0 m-0 list-none text-sm text-muted-foreground" data-testid="schedules">
          {data.schedules.map((s) => (
            <li key={s.id} className="p-2.5 rounded bg-muted/40 border border-border/60">
              <strong className="text-foreground">{s.label}</strong>:{' '}
              {s.enabled ? (
                <span>
                  every {s.intervalHours} hours · next {s.nextRunAt ? formatDateTime(s.nextRunAt) : '—'}
                  {s.lastSlotAt ? ` · last ${ago(s.lastSlotAt)}` : ''}
                </span>
              ) : (
                <span>
                  off —{' '}
                  <Link href="/settings#monitoring.discoveryIntervalHours" className="text-primary hover:underline">
                    turn on in Settings
                  </Link>
                </span>
              )}
            </li>
          ))}
          {backoff.map((b) => (
            <li
              key={b.id}
              className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200"
            >
              Board “{b.board}” failed {b.consecutiveFailures} time{b.consecutiveFailures === 1 ? '' : 's'}; scheduled
              checks wait until {formatDateTime(b.nextAttemptAt!)}
              {b.lastError ? ` (${b.lastError})` : ''}.
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs" aria-labelledby="recent-title">
        <h2 id="recent-title" className="text-lg font-bold text-foreground mb-4">
          Recent
        </h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground italic my-2">No activity yet.</p>
        ) : (
          <div
            className="overflow-x-auto rounded-md border border-border"
            tabIndex={0}
            role="region"
            aria-label="Recent activity"
          >
            <table className="w-full text-left text-sm border-collapse" data-testid="recent">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th scope="col" className="p-3">
                    Task
                  </th>
                  <th scope="col" className="p-3">
                    Result
                  </th>
                  <th scope="col" className="p-3">
                    When
                  </th>
                  <th scope="col" className="p-3">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recent.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <span className="font-medium text-foreground">{describeTask(t, data.boards)}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {TRIGGER[t.trigger] ?? t.trigger}
                        {t.attempt > 1 ? ` · attempt ${t.attempt}` : ''}
                      </span>
                    </td>
                    <td className="p-3 text-sm">{t.live ? 'Running' : (STATE_LABEL[t.state] ?? t.state)}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {ago(t.endedAt ?? t.startedAt ?? t.createdAt)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {t.error ??
                        (t.result && typeof (t.result as { fetched?: unknown }).fetched === 'number'
                          ? `${String((t.result as { fetched: number }).fetched)} postings, ${String((t.result as { added: number }).added)} new, ${String((t.result as { closed: number }).closed)} closed`
                          : t.result && typeof (t.result as { outcome?: unknown }).outcome === 'string'
                            ? `Outcome: ${String((t.result as { outcome: string }).outcome).toLowerCase()}`
                            : '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default Activity;
