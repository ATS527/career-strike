import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, type Prep as PrepData, type PrepTopic } from '../api';
import { ago, formatDateTime } from '../format';
import { Link } from '../router';
import { ErrorPanel, Loading } from './states';

const CONFIDENCE = ['', 'Not ready', 'Shaky', 'Getting there', 'Confident', 'Ready'];

export function Prep({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<PrepData | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<PrepData>(`/api/applications/${encodeURIComponent(applicationId)}/prep`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [applicationId]);
  useEffect(() => void load(), [load]);

  if (error) return <ErrorPanel message="Preparation could not be loaded." onRetry={() => void load()} />;
  if (!data) return <Loading label="Loading preparation" />;
  const fromPosting = data.topics.filter((t) => t.source === 'posting');
  const general = data.topics.filter((t) => t.source === 'inferred');
  const next = data.interviews.find((i) => i.outcome === 'pending');

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          <Link href={`/applications/${data.application.id}`}>{data.application.title}</Link> / Interview preparation
        </p>
        <h1>Get ready for {data.application.employer}</h1>
        <p className="lede">
          {next ? `Next: ${next.stage}, ${formatDateTime(next.scheduledAt)}.` : 'No interview is scheduled yet.'} Topics come from what the posting asks for;
          general ones are Career Strike’s suggestions.
        </p>
      </div>
      <section className="settings-group" aria-labelledby="posting-topics">
        <h2 id="posting-topics">What the posting asks for</h2>
        {fromPosting.length === 0 && <p className="empty">Career Strike found no specific requirements in this posting.</p>}
        <ul className="topic-list">
          {fromPosting.map((t) => (
            <Topic key={t.id} topic={t} applicationId={data.application.id} onLogged={(d) => setData(d)} />
          ))}
        </ul>
      </section>
      <section className="settings-group" aria-labelledby="general-topics">
        <h2 id="general-topics">General preparation</h2>
        <p className="help">Suggested by Career Strike for this kind of role — not stated in the posting.</p>
        <ul className="topic-list">
          {general.map((t) => (
            <Topic key={t.id} topic={t} applicationId={data.application.id} onLogged={(d) => setData(d)} />
          ))}
        </ul>
      </section>
      {data.sessions.length > 0 && (
        <section className="settings-group" aria-labelledby="history-title">
          <h2 id="history-title">Practice history</h2>
          <ul className="disclosures" data-testid="practice-history">
            {data.sessions.map((s) => (
              <li key={s.id}>
                {data.topics.find((t) => t.id === s.topicId)?.title ?? s.topicId} · {CONFIDENCE[s.confidence]} · {ago(s.practicedAt)}
                {s.minutes ? ` · ${s.minutes} min` : ''}
                {s.notes ? ` · ${s.notes}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Topic({ topic, applicationId, onLogged }: { topic: PrepTopic; applicationId: string; onLogged: (d: PrepData) => void }) {
  const [confidence, setConfidence] = useState(3);
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const id = `topic-${topic.id}`;
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      onLogged(
        await api<PrepData>(`/api/applications/${applicationId}/practice`, {
          method: 'POST',
          body: { topicId: topic.id, confidence, minutes: minutes ? Number(minutes) : null, notes: notes.trim() || null },
        }),
      );
      setNotes('');
      setMinutes('');
      setStatus('Logged.');
    } catch {
      setStatus('Could not log practice.');
    }
  };
  return (
    <li className={`topic${topic.gap ? ' topic--gap' : ''}`} data-topic={topic.id}>
      <div className="topic__head">
        <h3 id={id}>{topic.title}</h3>
        {topic.gap && <span className="badge">Gap: not in your profile</span>}
        <span className="muted">
          {topic.sessions === 0 ? 'Not practised yet' : `${topic.sessions} session${topic.sessions === 1 ? '' : 's'} · last: ${CONFIDENCE[topic.lastConfidence ?? 0]}`}
        </span>
      </div>
      {topic.quote && <p className="provenance">Posting: “{topic.quote}”</p>}
      <ul className="disclosures">
        {topic.prompts.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <form className="practice-form" onSubmit={(e) => void submit(e)} aria-labelledby={id}>
        <label htmlFor={`${id}-conf`}>How ready do you feel?</label>
        <select id={`${id}-conf`} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {CONFIDENCE[n]}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-min`}>Minutes (optional)</label>
        <input id={`${id}-min`} type="number" min={1} max={600} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <label htmlFor={`${id}-notes`}>Notes (optional)</label>
        <input id={`${id}-notes`} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="submit" className="quiet">
          Log practice<span className="visually-hidden"> for {topic.title}</span>
        </button>
        <span role="status" className="field-note">
          {status}
        </span>
      </form>
    </li>
  );
}
