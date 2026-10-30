import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ApplicationView, currentCsrfToken, type FollowUp, type PayloadField, type StoredDocument } from '../api';
import { APP_STATE_LABEL, formatDate, formatDateTime, shortHash } from '../format';
import { ExternalLink, Link, navigate } from '../router';
import { ErrorPanel, Loading } from './states';

const SOURCE_NOTE: Record<PayloadField['source'], string> = {
  identity: 'from your contact details',
  document: 'from your documents',
  draft: 'drafted from your approved profile',
  candidate: 'written by you',
  empty: 'not answered',
};

export function ApplicationPage({ id }: { id: string }) {
  const [view, setView] = useState<ApplicationView | null>(null);
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([
        api<{ application: ApplicationView }>(`/api/applications/${encodeURIComponent(id)}`),
        api<{ documents: StoredDocument[] }>('/api/documents'),
      ]);
      setView(a.application);
      setDocs(d.documents);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [id]);
  useEffect(() => void load(), [load]);
  // While an automated submission is being sent, follow it until it settles.
  useEffect(() => {
    if (view?.state !== 'SUBMISSION_IN_PROGRESS') return;
    const timer = window.setInterval(() => void load(), 700);
    return () => window.clearInterval(timer);
  }, [view?.state, load]);

  const run = async (label: string, request: () => Promise<{ application: ApplicationView }>): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await request();
      setView(res.application);
      setMessage({ kind: 'ok', text: label });
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string } | null) : null;
      setMessage({ kind: 'error', text: body?.message ?? 'That did not work. Check that the service is running.' });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorPanel message="This application could not be loaded." onRetry={() => void load()} />;
  if (!view) return <Loading label="Loading application" />;

  const editable = ['DRAFTED', 'NEEDS_INFORMATION', 'READY_FOR_REVIEW', 'APPROVED', 'BLOCKED'].includes(view.state);
  const post = (path: string, body?: unknown) => api<{ application: ApplicationView }>(`/api/applications/${view.id}/${path}`, { method: 'POST', body: body ?? {} });

  return (
    <article className="application">
      <p className="eyebrow">
        <Link href="/applications">Applications</Link> / <Link href={`/jobs/${view.jobId}`}>{view.job.title}</Link>
      </p>
      <header className="job__head">
        <div>
          <h1>{view.job.title}</h1>
          <p className="job__employer">{view.job.employer}</p>
          <p>
            <span className={`chip chip--app chip--app-${view.state.toLowerCase()}`}>
              <strong>{APP_STATE_LABEL[view.state]}</strong>
            </span>{' '}
            <span className="muted">Version {view.version}</span>
          </p>
        </div>
      </header>

      <p role="status" aria-live="polite" className={`save-status save-status--${message?.kind === 'error' ? 'error' : 'saved'} app-message`}>
        {message?.text}
      </p>

      <div className="job__grid app-grid">
        <div className="job__main">
          {editable ? (
            <Editor key={`${view.version}`} view={view} docs={docs} busy={busy} onSave={(changes, reason) => run('Saved a new version.', () => api(`/api/applications/${view.id}`, { method: 'PUT', body: { changes, reason } }))} onUploaded={() => void load()} />
          ) : (
            <p className="muted">This application can no longer be edited.</p>
          )}
        </div>
        <aside className="package" aria-labelledby="package-title">
          <h2 id="package-title">Exactly what would be sent</h2>
          <Package view={view} />
          <Actions view={view} busy={busy} post={post} run={run} />
          <FollowUps view={view} onChange={() => void load()} />
          <History view={view} />
        </aside>
      </div>
    </article>
  );
}

function Editor({
  view,
  docs,
  busy,
  onSave,
  onUploaded,
}: {
  view: ApplicationView;
  docs: StoredDocument[];
  busy: boolean;
  onSave: (changes: Record<string, unknown>, reason: string) => Promise<void>;
  onUploaded: () => void;
}) {
  const initial = Object.fromEntries(view.payload.fields.filter((f) => f.kind !== 'file').map((f) => [f.key, f.value ?? '']));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const resumeNow = view.payload.attachments.find((a) => a.kind === 'resume')?.documentId ?? '';
  const [resume, setResume] = useState(resumeNow);
  const [reason, setReason] = useState('');

  const changedFields = view.payload.fields.filter((f) => f.kind !== 'file' && (values[f.key] ?? '') !== (f.value ?? ''));
  const dirty = changedFields.length > 0 || resume !== resumeNow;

  const save = (): void => {
    const changes: Record<string, unknown> = {};
    if (changedFields.length) changes.fields = changedFields.map((f) => ({ key: f.key, value: values[f.key] ?? '' }));
    if (resume !== resumeNow) changes.resumeDocumentId = resume || null;
    void onSave(changes, reason.trim() || 'Edited by you');
  };

  return (
    <section aria-labelledby="answers-title">
      <h2 id="answers-title">Answers and documents</h2>
      {view.state === 'APPROVED' && <p className="banner banner--attention">Changing anything creates a new version and cancels your approval.</p>}
      {view.missingRequired.length > 0 && (
        <p className="banner banner--attention" role="note">
          Still needed: {view.missingRequired.join(', ')}.
        </p>
      )}
      {view.warnings.length > 0 && (
        <div className="banner banner--attention" role="note">
          <p>
            <strong>Check these statements.</strong> They are not supported by your approved profile:
          </p>
          <ul>
            {view.warnings.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {view.payload.fields.map((f) => {
          const id = `field-${f.key}`;
          const label = (
            <label htmlFor={id} className="field__label">
              {f.label}
              {f.required ? <span className="req"> (required)</span> : <span className="muted"> (optional)</span>}
            </label>
          );
          if (f.kind === 'file' && !/resume|cv/i.test(`${f.key} ${f.label}`)) {
            return (
              <div className="field" key={f.key}>
                <p className="field__label">{f.label}</p>
                <p className="help">Career Strike attaches only your résumé. Attach this file yourself on the employer’s site.</p>
              </div>
            );
          }
          if (f.kind === 'file') {
            return (
              <div className="field" key={f.key}>
                {label}
                <select id={id} value={resume} onChange={(e) => setResume(e.target.value)}>
                  <option value="">No file</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename} ({d.kind.replace('_', ' ')})
                    </option>
                  ))}
                </select>
                <p className="help">
                  Files come from your <Link href="/profile#documents">documents</Link>.
                </p>
                <UploadInline onUploaded={onUploaded} />
              </div>
            );
          }
          return (
            <div className="field" key={f.key}>
              {label}
              {f.kind === 'long_text' ? (
                <textarea id={id} rows={f.key === 'cover_letter_text' ? 12 : 4} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              ) : f.kind === 'choice' && f.options.length > 0 ? (
                <select id={id} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={id} type="text" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              )}
              <p className="help">{SOURCE_NOTE[f.source]}</p>
            </div>
          );
        })}
        <div className="field">
          <label htmlFor="change-reason" className="field__label">
            What changed? <span className="muted">(optional, kept in the history)</span>
          </label>
          <input id="change-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="field__actions">
          <button type="submit" disabled={!dirty || busy}>
            Save as a new version
          </button>
        </div>
      </form>
    </section>
  );
}

function UploadInline({ onUploaded }: { onUploaded: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="upload-inline">
      <label htmlFor="upload-resume" className="muted">
        Or upload a new résumé
      </label>
      <input
        id="upload-resume"
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setStatus(await uploadDocument(file, 'resume'));
          onUploaded();
        }}
      />
      {status && (
        <span role="status" className="field-note">
          {status}
        </span>
      )}
    </div>
  );
}

/** Upload a document as raw bytes. Returns a message for the candidate. */
export async function uploadDocument(file: File, kind: 'resume' | 'cover_letter' | 'other'): Promise<string> {
  try {
    const csrf = currentCsrfToken();
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': file.type || 'application/octet-stream', 'x-cs-filename': encodeURIComponent(file.name), 'x-cs-document-kind': kind, 'x-cs-csrf': csrf },
      body: file,
    });
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return res.ok ? `Uploaded ${file.name}.` : (body?.message ?? 'Upload failed.');
  } catch {
    return 'Upload failed. Check that the service is running.';
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="quiet copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
      <span className="visually-hidden"> {label}</span>
    </button>
  );
}

function Package({ view }: { view: ApplicationView }) {
  const p = view.payload;
  // While the candidate fills in the employer's form, every approved answer can be copied exactly.
  const copyable = view.state === 'APPROVED' || view.state === 'NEEDS_MANUAL_ACTION';
  return (
    <div className="package__body" data-testid="package">
      <dl className="facts">
        <div>
          <dt>Destination</dt>
          <dd>
            {p.destination.method === 'manual' ? 'You submit it on the employer’s site' : p.destination.method === 'assisted' ? 'You submit it with Career Strike’s help' : 'Owned test endpoint'}
            <br />
            {p.destination.url ? <ExternalLink href={p.destination.url}>{new URL(p.destination.url).host}</ExternalLink> : <span className="muted">No link</span>}
          </dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>
            {view.version} · <code title={view.payloadHash}>{shortHash(view.payloadHash)}</code>
          </dd>
        </div>
      </dl>
      <h3>You would disclose</h3>
      <ul className="disclosures">
        {view.disclosures.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h3>Answers</h3>
      <dl className="facts">
        {p.fields
          .filter((f) => f.key !== 'cover_letter_text')
          .map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>
                {f.value ?? <span className="muted">Not answered</span>}
                {copyable && f.value && f.kind !== 'file' && <CopyButton text={f.value} label={f.label} />}
              </dd>
            </div>
          ))}
      </dl>
      {p.attachments.length > 0 && (
        <>
          <h3>Files</h3>
          <ul className="disclosures">
            {p.attachments.map((a) => (
              <li key={a.documentId}>
                {a.filename} <code title={a.sha256}>sha256 {shortHash(a.sha256)}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.coverLetter && (
        <>
          <h3>
            Cover letter {copyable && <CopyButton text={p.coverLetter} label="cover letter" />}
          </h3>
          <pre className="letter">{p.coverLetter}</pre>
        </>
      )}
      {p.notAnswered.length > 0 && (
        <>
          <h3>Not answered by Career Strike</h3>
          <p className="help">Voluntary questions on the employer’s form. Answer them yourself on their site if you wish.</p>
          <ul className="disclosures">
            {p.notAnswered.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Actions({
  view,
  busy,
  post,
  run,
}: {
  view: ApplicationView;
  busy: boolean;
  post: (path: string, body?: unknown) => Promise<{ application: ApplicationView }>;
  run: (label: string, request: () => Promise<{ application: ApplicationView }>) => Promise<void>;
}) {
  const [ack, setAck] = useState(false);
  const can = (s: string): boolean => view.allowedTransitions.includes(s as ApplicationView['state']);
  const reject = (): void => {
    const note = window.prompt('Why are you rejecting this application? (optional)');
    if (note === null) return;
    void run('Rejected. Nothing was sent.', () => post('reject', { note: note.trim() || null }));
  };

  return (
    <div className="app-actions">
      {view.state === 'DRAFTED' && (
        <button type="button" disabled={busy || view.missingRequired.length > 0} onClick={() => void run('Marked ready for review.', () => post('ready'))}>
          Mark ready for review
        </button>
      )}
      {view.state === 'READY_FOR_REVIEW' && (
        <>
          {view.warnings.length > 0 && (
            <label className="filter--check ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I confirm the flagged statements are accurate.</span>
            </label>
          )}
          <button
            type="button"
            disabled={busy || (view.warnings.length > 0 && !ack)}
            onClick={() =>
              void run('Approved. This exact version may now be submitted.', () =>
                post('approve', { version: view.version, payloadHash: view.payloadHash, acknowledgeWarnings: ack }),
              )
            }
          >
            Approve this exact application
          </button>
          <button type="button" className="quiet" disabled={busy} onClick={() => void run('Saved for later.', () => post('save-for-later'))}>
            Save for later
          </button>
        </>
      )}
      {view.duplicateRisk.length > 0 && (
        <div className="banner banner--attention" role="note" data-testid="duplicate-risk">
          <strong>Possible duplicate.</strong> You have {view.duplicateRisk.length === 1 ? 'another application' : `${view.duplicateRisk.length} other applications`} for
          this same role:{' '}
          {view.duplicateRisk.map((d, i) => (
            <span key={d.applicationId}>
              {i > 0 && ', '}
              <Link href={`/applications/${d.applicationId}`}>{APP_STATE_LABEL[d.state]}</Link>
            </span>
          ))}
          . Career Strike will not submit the same role twice.
        </div>
      )}
      {view.state === 'APPROVED' && view.payload.destination.method === 'test-ats' && (
        <div className="banner" role="note">
          <p>
            <strong>{view.approval.valid ? 'Approval is valid' : 'Approval is not valid'}</strong> — {view.approval.reason}
          </p>
          <p className="help">This goes to the practice endpoint on this computer, not to an employer. It is sent once, with a receipt.</p>
          <button type="button" disabled={busy || !view.approval.valid} onClick={() => void run('Sending to the practice endpoint…', () => post('submit'))}>
            Submit to the practice endpoint
          </button>
        </div>
      )}
      {view.state === 'SUBMISSION_IN_PROGRESS' && (
        <p className="banner" role="status" aria-live="polite">
          Sending… Career Strike is waiting for a receipt.
        </p>
      )}
      {view.state === 'SUBMISSION_UNCONFIRMED' && view.mode === 'automated' && (
        <div className="banner banner--attention" role="note">
          <p>
            <strong>Career Strike does not know whether it arrived.</strong> It will not resend it. Ask the endpoint whether it has a record of this submission.
          </p>
          <button type="button" disabled={busy} onClick={() => void run('Checked with the endpoint.', () => post('reconcile'))}>
            Check whether it arrived
          </button>
        </div>
      )}
      {view.state === 'SUBMISSION_FAILED' && (
        <div className="banner banner--attention" role="note">
          <p>
            <strong>It was not submitted.</strong> To try again, prepare it again and approve the new version.
          </p>
          <button type="button" disabled={busy} onClick={() => void run('Back to drafts. Review and approve it again.', () => post('redraft'))}>
            Prepare it again
          </button>
        </div>
      )}
      {view.state === 'APPROVED' && view.payload.destination.method !== 'test-ats' && (
        <div className="banner" role="note">
          <p>
            <strong>{view.approval.valid ? 'Approval is valid' : 'Approval is not valid'}</strong> — {view.approval.reason}
          </p>
          {view.approval.approval && <p className="muted">Approved {formatDateTime(view.approval.approval.issuedAt)}; expires {formatDateTime(view.approval.approval.expiresAt)}.</p>}
          <p className="help">When you start, the approval is used up. Then submit on the employer’s site, using the copy buttons for each answer.</p>
          <button
            type="button"
            disabled={busy || !view.approval.valid}
            onClick={() => {
              if (view.payload.destination.url) window.open(view.payload.destination.url, '_blank', 'noopener,noreferrer');
              void run('Started. Submit on the employer’s site, then tell Career Strike what happened.', () => post('start-submission'));
            }}
          >
            Start submitting on the employer’s site
          </button>
          {view.payload.destination.url && (
            <ExternalLink href={view.payload.destination.url} className="button button--quiet">
              Open the official application
            </ExternalLink>
          )}
        </div>
      )}
      {(view.state === 'NEEDS_MANUAL_ACTION' || (view.state === 'SUBMISSION_UNCONFIRMED' && view.mode !== 'automated')) && (
        <ConfirmSubmission view={view} busy={busy} post={post} run={run} />
      )}
      {OUTCOMES.some((o) => can(o)) && view.state !== 'NEEDS_MANUAL_ACTION' && (
        <RecordOutcome key={`${view.state}:${view.events.length}`} view={view} busy={busy} post={post} run={run} can={can} />
      )}
      {can('CANCELLED') && (
        <button type="button" className="quiet" disabled={busy} onClick={reject}>
          Reject
        </button>
      )}
      {view.state === 'CANCELLED' && (
        <button type="button" className="quiet" onClick={() => navigate(`/jobs/${view.jobId}`)}>
          Back to the job
        </button>
      )}
    </div>
  );
}

const OUTCOMES = ['RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'] as const;
const OUTCOME_LABEL: Record<(typeof OUTCOMES)[number], string> = {
  RESPONSE_RECEIVED: 'The employer responded',
  INTERVIEW: 'An interview was arranged',
  OFFER: 'I received an offer',
  REJECTED: 'The employer said no',
  WITHDRAWN: 'I withdrew',
  CLOSED: 'Close this application',
};

type Post = (path: string, body?: unknown) => Promise<{ application: ApplicationView }>;
type Run = (label: string, request: () => Promise<{ application: ApplicationView }>) => Promise<void>;
const today = (): string => new Date().toISOString().slice(0, 10);

function ConfirmSubmission({ view, busy, post, run }: { view: ApplicationView; busy: boolean; post: Post; run: Run }) {
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  return (
    <form
      className="banner outcome-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run('Recorded as submitted.', () => post('confirm-submitted', { submittedAt: date, reference: reference.trim() || null, note: note.trim() || null }));
      }}
    >
      <p>
        <strong>Did you submit it?</strong> Career Strike only counts it as submitted when you confirm.
      </p>
      <label htmlFor="submitted-at">Date submitted</label>
      <input id="submitted-at" type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      <label htmlFor="reference">Confirmation number or reference (optional)</label>
      <input id="reference" type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
      <label htmlFor="confirm-note">What did you see? (optional)</label>
      <input id="confirm-note" type="text" placeholder="e.g. confirmation email received" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="submit" disabled={busy}>
        Yes, I submitted it
      </button>
      {view.state === 'NEEDS_MANUAL_ACTION' && (
        <button type="button" className="quiet" disabled={busy} onClick={() => void run('Marked as not confirmed.', () => post('mark-unconfirmed', { note: null }))}>
          I’m not sure it went through
        </button>
      )}
    </form>
  );
}

function RecordOutcome({ view, busy, post, run, can }: { view: ApplicationView; busy: boolean; post: Post; run: Run; can: (s: string) => boolean }) {
  const options = OUTCOMES.filter((o) => can(o));
  const [chosen, setOutcome] = useState<string>(options[0] ?? '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  // After a transition the available outcomes change; fall back to the first valid one.
  const outcome = options.includes(chosen as (typeof OUTCOMES)[number]) ? chosen : (options[0] ?? '');
  return (
    <form
      className="banner outcome-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run('Recorded.', () => post('outcome', { outcome, occurredAt: date, note: note.trim() || null }));
      }}
    >
      <p>
        <strong>Record what happened</strong>
      </p>
      <label htmlFor="outcome">What happened?</label>
      <select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {OUTCOME_LABEL[o]}
          </option>
        ))}
      </select>
      <label htmlFor="outcome-date">When?</label>
      <input id="outcome-date" type="date" required value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      <label htmlFor="outcome-note">Details (optional)</label>
      <input id="outcome-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="submit" disabled={busy || !outcome}>
        Record
      </button>
      <span className="muted">{view.state === 'OFFER' ? 'Congratulations.' : ''}</span>
    </form>
  );
}

function FollowUps({ view, onChange }: { view: ApplicationView; onChange: () => void }) {
  const inAWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [due, setDue] = useState(inAWeek);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = view.followUps.filter((f) => f.status === 'OPEN');
  const close = async (f: FollowUp, how: 'done' | 'dismiss'): Promise<void> => {
    await api(`/api/follow-ups/${f.id}/${how}`, { method: 'POST' }).catch(() => setError('Could not update.'));
    onChange();
  };
  return (
    <section className="follow-ups" aria-labelledby="fu-title">
      <h3 id="fu-title">Follow-ups</h3>
      {open.length === 0 ? (
        <p className="muted">No reminders set.</p>
      ) : (
        <ul className="disclosures" data-testid="follow-ups">
          {open.map((f) => (
            <li key={f.id}>
              {formatDate(f.dueAt)} · {f.note}{' '}
              <button type="button" className="quiet copy" onClick={() => void close(f, 'done')}>
                Done<span className="visually-hidden"> {f.note}</span>
              </button>{' '}
              <button type="button" className="quiet copy" onClick={() => void close(f, 'dismiss')}>
                Dismiss<span className="visually-hidden"> {f.note}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="fu-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api(`/api/applications/${view.id}/follow-ups`, { method: 'POST', body: { dueAt: due, note: note.trim() } });
            setNote('');
            onChange();
          } catch (err) {
            setError(err instanceof ApiError ? 'Add a date and a short note.' : 'Could not save.');
          }
        }}
      >
        <label htmlFor="fu-note">Remind me to</label>
        <input id="fu-note" type="text" value={note} placeholder="e.g. email the recruiter" onChange={(e) => setNote(e.target.value)} />
        <label htmlFor="fu-due">Due date</label>
        <input id="fu-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="submit" className="quiet">
          Add reminder
        </button>
        {error && (
          <span role="alert" className="save-status--error">
            {error}
          </span>
        )}
      </form>
    </section>
  );
}

function History({ view }: { view: ApplicationView }) {
  return (
    <details className="history">
      <summary>History ({view.versions.length} versions)</summary>
      <ol className="disclosures">
        {view.events.map((e, i) => (
          <li key={i}>
            {formatDateTime(e.at)} · {e.from ? `${APP_STATE_LABEL[e.from] ?? e.from} → ` : ''}
            {APP_STATE_LABEL[e.to] ?? e.to}
            {e.note ? ` · ${e.note}` : ''}
            {e.evidence && typeof e.evidence.reference === 'string' ? ` · ref ${e.evidence.reference}` : ''}
            {e.evidence && typeof (e.evidence.receipt as { receiptId?: unknown } | undefined)?.receiptId === 'string'
              ? ` · receipt ${(e.evidence.receipt as { receiptId: string }).receiptId}`
              : ''}{' '}
            <span className="muted">({e.actor})</span>
          </li>
        ))}
      </ol>
      <h3>Versions</h3>
      <ol className="disclosures">
        {view.versions.map((v) => (
          <li key={v.version}>
            v{v.version} · {v.reason} · {formatDateTime(v.createdAt)} <code>{shortHash(v.payloadHash)}</code>
          </li>
        ))}
      </ol>
    </details>
  );
}
