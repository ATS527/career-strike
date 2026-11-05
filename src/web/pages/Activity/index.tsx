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
    <>
      <PageHeader
        eyebrow="Activity"
        title="What Career Strike is doing"
        lede="Only real work appears here. A task shows as running only while the service is actually doing it."
      />

      <section className="settings-group mb-6" aria-labelledby="running-title">
        <h2 id="running-title">Running now</h2>
        {data.running.length === 0 ? (
          <p className="empty">Nothing is running.</p>
        ) : (
          <ul className="job-list space-y-3" data-testid="running">
            {data.running.map((t) => (
              <RunningTaskRow key={t.id} task={t} boards={data.boards} onCancel={handleCancel} />
            ))}
          </ul>
        )}
        {message && (
          <p role="status" aria-live="polite" className="save-status mt-2">
            {message}
          </p>
        )}
      </section>

      <section className="settings-group mb-6" aria-labelledby="sched-title">
        <h2 id="sched-title">Scheduled</h2>
        <ul className="disclosures" data-testid="schedules">
          {data.schedules.map((s) => (
            <li key={s.id}>
              {s.label}:{' '}
              {s.enabled ? (
                <>
                  every {s.intervalHours} hours · next {s.nextRunAt ? formatDateTime(s.nextRunAt) : '—'}
                  {s.lastSlotAt ? ` · last ${ago(s.lastSlotAt)}` : ''}
                </>
              ) : (
                <>
                  off — <Link href="/settings#monitoring.discoveryIntervalHours">turn on in Settings</Link>
                </>
              )}
            </li>
          ))}
          {backoff.map((b) => (
            <li key={b.id}>
              Board “{b.board}” failed {b.consecutiveFailures} time{b.consecutiveFailures === 1 ? '' : 's'}; scheduled
              checks wait until {formatDateTime(b.nextAttemptAt!)}
              {b.lastError ? ` (${b.lastError})` : ''}.
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-group mb-6" aria-labelledby="recent-title">
        <h2 id="recent-title">Recent</h2>
        {data.recent.length === 0 ? (
          <p className="empty">No activity yet.</p>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent activity">
            <table className="compare" data-testid="recent">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Result</th>
                  <th scope="col">When</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {describeTask(t, data.boards)}
                      <br />
                      <span className="muted">
                        {TRIGGER[t.trigger] ?? t.trigger}
                        {t.attempt > 1 ? ` · attempt ${t.attempt}` : ''}
                      </span>
                    </td>
                    <td>{t.live ? 'Running' : (STATE_LABEL[t.state] ?? t.state)}</td>
                    <td>{ago(t.endedAt ?? t.startedAt ?? t.createdAt)}</td>
                    <td>
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
    </>
  );
}

export default Activity;
