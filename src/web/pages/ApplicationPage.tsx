import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ApplicationView, currentCsrfToken, type PayloadField, type StoredDocument } from '../api';
import { APP_STATE_LABEL, formatDateTime, shortHash } from '../format';
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

function Package({ view }: { view: ApplicationView }) {
  const p = view.payload;
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
              <dd>{f.value ?? <span className="muted">Not answered</span>}</dd>
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
          <h3>Cover letter</h3>
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
      {view.state === 'APPROVED' && (
        <div className="banner" role="note">
          <p>
            <strong>{view.approval.valid ? 'Approval is valid' : 'Approval is not valid'}</strong> — {view.approval.reason}
          </p>
          {view.approval.approval && <p className="muted">Approved {formatDateTime(view.approval.approval.issuedAt)}; expires {formatDateTime(view.approval.approval.expiresAt)}.</p>}
          {view.payload.destination.url && (
            <ExternalLink href={view.payload.destination.url} className="button">
              Open the official application
            </ExternalLink>
          )}
        </div>
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

function History({ view }: { view: ApplicationView }) {
  return (
    <details className="history">
      <summary>History ({view.versions.length} versions)</summary>
      <ol className="disclosures">
        {view.events.map((e, i) => (
          <li key={i}>
            {formatDateTime(e.at)} · {e.from ? `${APP_STATE_LABEL[e.from] ?? e.from} → ` : ''}
            {APP_STATE_LABEL[e.to] ?? e.to}
            {e.note ? ` · ${e.note}` : ''} <span className="muted">({e.actor})</span>
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
