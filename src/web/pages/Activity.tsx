import { useCallback, useEffect, useState } from 'react';
import { api, type Task } from '../api';
import { ago, formatDateTime, SOURCE_LABEL } from '../format';
import { Link } from '../router';
import { ErrorPanel, Loading } from './states';

interface Activity {
  running: Task[];
  recent: (Task & { attempt: number; live: boolean })[];
  schedules: { id: string; label: string; enabled: boolean; intervalHours: number; lastSlotAt: string | null; nextRunAt: string | null }[];
  boards: { id: string; source: string; board: string; health: string; consecutiveFailures: number; nextAttemptAt: string | null; lastError: string | null }[];
}

const STATE_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  INTERRUPTED: 'Interrupted',
};

function describe(t: Task, boards: Activity['boards']): string {
  if (t.kind.startsWith('discover:')) {
    const b = boards.find((x) => x.id === t.kind.slice(9));
    return b ? `Fetch ${SOURCE_LABEL[b.source] ?? b.source} board “${b.board}”` : 'Fetch a job board (since removed)';
  }
  if (t.kind.startsWith('submit:')) return 'Submit an approved application to the practice endpoint';
  return t.kind;
}

const TRIGGER: Record<string, string> = {
  manual: 'started by you',
  'board-added': 'board added',
  schedule: 'scheduled',
  recovery: 'retried after a restart',
  'approved-submission': 'after your approval',
};

/** Only work the service is really doing, or really did. Nothing here is simulated. */
export function Activity() {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Activity>('/api/activity'));
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

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Activity</p>
        <h1>What Career Strike is doing</h1>
        <p className="lede">Only real work appears here. A task shows as running only while the service is actually doing it.</p>
      </div>

      <section className="settings-group" aria-labelledby="running-title">
        <h2 id="running-title">Running now</h2>
        {data.running.length === 0 ? (
          <p className="empty">Nothing is running.</p>
        ) : (
          <ul className="job-list" data-testid="running">
            {data.running.map((t) => (
              <li key={t.id} className="job-row">
                <div className="job-row__main">
                  <h3 className="job-row__title">{describe(t, data.boards)}</h3>
                  <p className="job-row__meta">
                    <span>{TRIGGER[t.trigger] ?? t.trigger}</span>
                    <span>started {ago(t.startedAt ?? t.createdAt)}</span>
                    <span>last heartbeat {ago(t.heartbeatAt)}</span>
                    {typeof t.progress?.step === 'string' && <span>step: {t.progress.step}</span>}
                  </p>
                </div>
                <div className="job-row__actions">
                  {t.kind.startsWith('discover:') ? (
                    <button
                      type="button"
                      className="quiet"
                      onClick={async () => {
                        await api(`/api/tasks/${t.id}/cancel`, { method: 'POST' }).catch(() => setMessage('Could not cancel; it may have just finished.'));
                        void load();
                      }}
                    >
                      Cancel<span className="visually-hidden"> {describe(t, data.boards)}</span>
                    </button>
                  ) : (
                    <span className="muted">Sending cannot be cancelled safely</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p role="status" aria-live="polite" className="save-status">
          {message}
        </p>
      </section>

      <section className="settings-group" aria-labelledby="sched-title">
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
              Board “{b.board}” failed {b.consecutiveFailures} time{b.consecutiveFailures === 1 ? '' : 's'}; scheduled checks wait until {formatDateTime(b.nextAttemptAt!)}
              {b.lastError ? ` (${b.lastError})` : ''}.
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-group" aria-labelledby="recent-title">
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
                      {describe(t, data.boards)}
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
