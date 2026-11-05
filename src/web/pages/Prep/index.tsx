import { useCallback, useEffect, useState } from 'react';
import { api, type Prep as PrepData, type ProfileFact } from '../../api';
import { downloadInterviewIcs } from '../../candidateExperience';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { ago, formatDateTime } from '../../format';
import { Link } from '../../router';
import { ErrorPanel, Loading } from '../states';
import { CheatSheetModal } from './-components/CheatSheetModal';
import { CONFIDENCE, Topic } from './-components/Topic';

export function Prep({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<PrepData | null>(null);
  const [facts, setFacts] = useState<ProfileFact[]>([]);
  const [error, setError] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const load = useCallback(async () => {
    try {
      const [prepRes, profileRes] = await Promise.all([
        api<PrepData>(`/api/applications/${encodeURIComponent(applicationId)}/prep`),
        api<{ facts: ProfileFact[] }>('/api/profile').catch(() => ({ facts: [] })),
      ]);
      setData(prepRes);
      setFacts(profileRes.facts ?? []);
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
      <PageHeader
        eyebrow={
          <span>
            <Link href={`/applications/${data.application.id}`}>{data.application.title}</Link> / Interview preparation
          </span>
        }
        title={`Get ready for ${data.application.employer}`}
        lede={
          next ? (
            <span>
              Next: <strong>{next.stage}</strong>, {formatDateTime(next.scheduledAt)} ({next.format.replace('_', '-')}).
            </span>
          ) : (
            'No interview is scheduled yet. Topics come from what the posting asks for; general ones are Career Strike suggestions.'
          )
        }
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCheatSheet(true)}>
              📋 1-Page Interview Brief
            </Button>
            {next && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadInterviewIcs({
                    interview: next,
                    employer: data.application.employer,
                    jobTitle: data.application.title,
                  })
                }
              >
                📅 .ics
              </Button>
            )}
          </div>
        }
      />

      <section className="settings-group mb-6" aria-labelledby="posting-topics">
        <h2 id="posting-topics">What the posting asks for</h2>
        {fromPosting.length === 0 && (
          <p className="empty">Career Strike found no specific requirements in this posting.</p>
        )}
        <ul className="topic-list space-y-4">
          {fromPosting.map((t) => (
            <Topic
              key={t.id}
              topic={t}
              applicationId={data.application.id}
              facts={facts}
              onLogged={(d) => setData(d)}
            />
          ))}
        </ul>
      </section>

      <section className="settings-group mb-6" aria-labelledby="general-topics">
        <h2 id="general-topics">General preparation</h2>
        <p className="help">Suggested by Career Strike for this kind of role — not stated in the posting.</p>
        <ul className="topic-list space-y-4">
          {general.map((t) => (
            <Topic
              key={t.id}
              topic={t}
              applicationId={data.application.id}
              facts={facts}
              onLogged={(d) => setData(d)}
            />
          ))}
        </ul>
      </section>

      {data.sessions.length > 0 && (
        <section className="settings-group mb-6" aria-labelledby="history-title">
          <h2 id="history-title">Practice history</h2>
          <ul className="disclosures">
            {data.sessions.map((s) => {
              const topic = data.topics.find((t) => t.id === s.topicId);
              return (
                <li key={s.id}>
                  <strong>{topic?.title ?? 'Topic'}</strong> · {CONFIDENCE[s.confidence]}
                  {s.minutes ? ` · ${s.minutes} min` : ''} · {ago(s.practicedAt)}
                  {s.notes && <p className="help mt-1">{s.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showCheatSheet && <CheatSheetModal data={data} facts={facts} onClose={() => setShowCheatSheet(false)} />}
    </>
  );
}

export default Prep;
