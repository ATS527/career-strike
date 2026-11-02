import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Prep as PrepData, type PrepTopic, type ProfileFact } from '../api';
import { downloadInterviewIcs, findMatchingCareerEvidence } from '../candidateExperience';
import { ago, formatDateTime } from '../format';
import { Link } from '../router';
import { ErrorPanel, Loading } from './states';

const CONFIDENCE = ['', 'Not ready', 'Shaky', 'Getting there', 'Confident', 'Ready'];

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
      <div className="page-head page-head--row">
        <div>
          <p className="eyebrow">
            <Link href={`/applications/${data.application.id}`}>{data.application.title}</Link> / Interview preparation
          </p>
          <h1>Get ready for {data.application.employer}</h1>
          <p className="lede">
            {next ? (
              <>
                Next: <strong>{next.stage}</strong>, {formatDateTime(next.scheduledAt)} ({next.format.replace('_', '-')}).{' '}
                <button
                  type="button"
                  className="button button--small button--quiet"
                  onClick={() =>
                    downloadInterviewIcs({
                      interview: next,
                      employer: data.application.employer,
                      jobTitle: data.application.title,
                    })
                  }
                  title="Add to calendar (.ics)"
                >
                  📅 Add to Calendar (.ics)
                </button>
              </>
            ) : (
              'No interview is scheduled yet. Topics come from what the posting asks for; general ones are Career Strike suggestions.'
            )}
          </p>
        </div>
        <div className="prep-head-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setShowCheatSheet(true)}
            aria-haspopup="dialog"
          >
            📋 1-Page Interview Brief
          </button>
        </div>
      </div>

      <section className="settings-group" aria-labelledby="posting-topics">
        <h2 id="posting-topics">What the posting asks for</h2>
        {fromPosting.length === 0 && <p className="empty">Career Strike found no specific requirements in this posting.</p>}
        <ul className="topic-list">
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

      <section className="settings-group" aria-labelledby="general-topics">
        <h2 id="general-topics">General preparation</h2>
        <p className="help">Suggested by Career Strike for this kind of role — not stated in the posting.</p>
        <ul className="topic-list">
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

      {showCheatSheet && (
        <CheatSheetModal
          data={data}
          facts={facts}
          onClose={() => setShowCheatSheet(false)}
        />
      )}
    </>
  );
}

function Topic({
  topic,
  applicationId,
  facts,
  onLogged,
}: {
  topic: PrepTopic;
  applicationId: string;
  facts: ProfileFact[];
  onLogged: (d: PrepData) => void;
}) {
  const [confidence, setConfidence] = useState(3);
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [showStarGuide, setShowStarGuide] = useState(false);

  const matchedEvidence = useMemo(() => {
    return findMatchingCareerEvidence(topic.title, facts);
  }, [topic.title, facts]);

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

  const insertStarTemplate = () => {
    const template = 'S: [Situation & Context] | T: [Specific Objective] | A: [Key Technical Actions & Tradeoffs] | R: [Measurable Outcome]';
    setNotes((prev) => (prev ? `${prev}\n${template}` : template));
    setShowStarGuide(true);
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

      {(matchedEvidence.skills.length > 0 || matchedEvidence.roles.length > 0) && (
        <div className="topic-evidence">
          <span className="topic-evidence__label">Your Anchors:</span>
          {matchedEvidence.skills.map((s) => (
            <span key={s} className="evidence-chip evidence-chip--skill">
              ⚡ {s}
            </span>
          ))}
          {matchedEvidence.roles.map((r) => (
            <span key={r} className="evidence-chip evidence-chip--role">
              💼 {r}
            </span>
          ))}
        </div>
      )}

      <ul className="disclosures">
        {topic.prompts.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <div className="star-assistant-toggle">
        <button
          type="button"
          className="button button--small button--quiet"
          onClick={() => setShowStarGuide(!showStarGuide)}
          aria-expanded={showStarGuide}
        >
          {showStarGuide ? '▾ Hide STAR Story Assistant' : '▸ ⭐ Use STAR Story Framework'}
        </button>
      </div>

      {showStarGuide && (
        <div className="star-guide">
          <p className="star-guide__intro">
            Structure your behavioral & technical answers with <strong>STAR</strong>:
          </p>
          <div className="star-guide__steps">
            <div><strong>S</strong>: Set the scene (architecture, constraints, scale)</div>
            <div><strong>T</strong>: The challenge or milestone you owned</div>
            <div><strong>A</strong>: Decisions, code, tools & how you tackled friction</div>
            <div><strong>R</strong>: Measurable impact, performance gains, team growth</div>
          </div>
          <button type="button" className="button button--small button--secondary" onClick={insertStarTemplate}>
            ✍️ Insert STAR Outline into Notes
          </button>
        </div>
      )}

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

function CheatSheetModal({
  data,
  facts,
  onClose,
}: {
  data: PrepData;
  facts: ProfileFact[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const next = data.interviews.find((i) => i.outcome === 'pending');
  const postingTopics = data.topics.filter((t) => t.source === 'posting');
  const gaps = data.topics.filter((t) => t.gap);

  const plainTextBrief = useMemo(() => {
    const lines = [
      `INTERVIEW CHEAT SHEET: ${data.application.title} at ${data.application.employer}`,
      `Generated by Career Strike on ${new Date().toLocaleDateString()}`,
      `------------------------------------------------------------`,
      next ? `Scheduled: ${next.stage} on ${formatDateTime(next.scheduledAt)} (${next.format})` : `Status: Preparing`,
      '',
      `KEY REQUIREMENTS & POSTING TOPICS:`,
      ...postingTopics.map((t) => `• ${t.title}${t.quote ? ` (Posting: "${t.quote}")` : ''}`),
      '',
      `IDENTIFIED GAPS & DEFENSE STRATEGY:`,
      gaps.length > 0
        ? gaps.map((g) => `• ${g.title}: Acknowledge honestly; anchor on adjacent concepts and fast ramp-up ability.`).join('\n')
        : '• No direct gaps detected against your verified profile facts.',
      '',
      `YOUR ANCHORED STRENGTHS:`,
      ...facts
        .filter((f) => f.approved)
        .slice(0, 8)
        .map((f) => {
          const name = typeof f.value.name === 'string' ? f.value.name : '';
          const role = typeof f.value.title === 'string' && typeof f.value.company === 'string' ? `${f.value.title} at ${f.value.company}` : '';
          return `• [${f.kind.toUpperCase()}] ${name || role || JSON.stringify(f.value)}`;
        }),
      '',
      `STAR METHOD CHECKLIST:`,
      `• Situation: State context, scale, and constraints succinctly.`,
      `• Task: Define the explicit objective and your personal responsibility.`,
      `• Action: Detail the engineering architecture, tools, tradeoffs, and code.`,
      `• Result: Highlight concrete metrics (latency, reliability, cost, adoption).`,
    ];
    return lines.join('\n');
  }, [data, facts, next, postingTopics, gaps]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainTextBrief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card cheat-sheet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cheat-sheet-header">
          <div>
            <p className="eyebrow">1-Page Interview Brief</p>
            <h2 id="cs-title">
              {data.application.title} · {data.application.employer}
            </h2>
            {next && (
              <p className="cheat-sheet-sub">
                Upcoming: <strong>{next.stage}</strong> · {formatDateTime(next.scheduledAt)} ({next.format.replace('_', '-')})
              </p>
            )}
          </div>
          <div className="cheat-sheet-actions">
            <button type="button" className="button button--small button--secondary" onClick={handleCopy}>
              {copied ? '✓ Copied' : '📋 Copy Brief'}
            </button>
            <button type="button" className="button button--small button--quiet" onClick={() => window.print()}>
              🖨️ Print
            </button>
            <button type="button" className="button button--small" onClick={onClose} aria-label="Close brief">
              ✕
            </button>
          </div>
        </div>

        <div
          className="cheat-sheet-content"
          tabIndex={0}
          role="region"
          aria-label="Interview brief details"
        >
          <div className="cheat-sheet-section">
            <h3>Posting Requirements & Prompts</h3>
            <ul>
              {postingTopics.map((t) => (
                <li key={t.id}>
                  <strong>{t.title}</strong>
                  {t.quote && <span className="cheat-sheet-quote"> — “{t.quote}”</span>}
                  {t.prompts.length > 0 && <p className="cheat-sheet-prompt">Q: {t.prompts[0]}</p>}
                </li>
              ))}
            </ul>
          </div>

          {gaps.length > 0 && (
            <div className="cheat-sheet-section cheat-sheet-section--gaps">
              <h3>Identified Skill Gaps & Talking Points</h3>
              <ul>
                {gaps.map((g) => (
                  <li key={g.id}>
                    <strong>{g.title}</strong>: Frame with adjacent strengths, demonstrate quick learning agility, and cite relevant foundational experience.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="cheat-sheet-section">
            <h3>⭐ STAR Response Quick Guide</h3>
            <div className="star-grid">
              <div className="star-col">
                <strong>S — Situation</strong>
                <p>Team, scale, system constraints, business context.</p>
              </div>
              <div className="star-col">
                <strong>T — Task</strong>
                <p>Specific goal, target deliverable, your ownership.</p>
              </div>
              <div className="star-col">
                <strong>A — Action</strong>
                <p>Architecture, tradeoffs, technical choices, implementation.</p>
              </div>
              <div className="star-col">
                <strong>R — Result</strong>
                <p>Latency, throughput, business impact, post-mortem learnings.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
