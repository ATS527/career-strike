import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  type ApplicationView,
  api,
  type PayloadField,
  type PersonalizationView,
  type StoredDocument,
} from '../../api';
import { buildOutreachDraft, type OutreachKind } from '../../candidateExperience';
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { APP_STATE_LABEL, formatDateTime, shortHash } from '../../format';
import { cn } from '../../helpers/cn';
import { uploadDocument } from '../../helpers/documents';
import { ExternalLink, Link, useNavigateTo } from '../../router';
import { FollowUps } from './-components/FollowUps';
import { Interviews } from './-components/Interviews';

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
  const post = (path: string, body?: unknown) =>
    api<{ application: ApplicationView }>(`/api/applications/${view.id}/${path}`, { method: 'POST', body: body ?? {} });

  return (
    <article className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          <Link href="/applications" className="hover:underline">
            Applications
          </Link>{' '}
          /{' '}
          <Link href={`/jobs/${view.jobId}`} className="hover:underline">
            {view.job.title}
          </Link>
        </p>
        <header className="flex flex-col gap-2 pb-4 border-b border-border">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground m-0">{view.job.title}</h1>
            <p className="text-lg font-medium text-foreground mt-0.5">{view.job.employer}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs font-semibold">
                {APP_STATE_LABEL[view.state]}
              </Badge>
              <span className="text-xs text-muted-foreground">Version {view.version}</span>
            </div>
          </div>
        </header>
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs p-3 rounded-md border ${
            message.kind === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-teal-500/30 bg-teal-50 dark:bg-teal-950/20 text-teal-900 dark:text-teal-200'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">
          {editable ? (
            <Editor
              key={`${view.version}`}
              view={view}
              docs={docs}
              busy={busy}
              onSave={(changes, reason) =>
                run('Saved a new version.', () =>
                  api(`/api/applications/${view.id}`, { method: 'PUT', body: { changes, reason } }),
                )
              }
              onUploaded={() => void load()}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">This application can no longer be edited.</p>
          )}
          <PersonalizationPanel application={view} editable={editable} onChanged={() => void load()} />
        </div>
        <aside
          className="bg-card p-5 rounded-lg border border-border shadow-xs space-y-6"
          aria-labelledby="package-title"
        >
          <h2 id="package-title" className="text-lg font-bold text-foreground m-0">
            Exactly what would be sent
          </h2>
          <Package view={view} />
          <Actions view={view} busy={busy} post={post} run={run} />
          <Interviews view={view} onChange={() => void load()} />
          <FollowUps view={view} onChange={() => void load()} />
          <FollowUpStudio view={view} />
          <History view={view} />
        </aside>
      </div>
    </article>
  );
}

function PersonalizationPanel({
  application,
  editable,
  onChanged,
}: {
  application: ApplicationView;
  editable: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<PersonalizationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ personalization: PersonalizationView }>(
        `/api/applications/${application.id}/personalization`,
      );
      setData(result.personalization);
      setError(null);
    } catch {
      setError('Could not load tailored documents.');
    }
  }, [application.id]);

  useEffect(() => void load(), [load, application.version]);

  const generate = async (): Promise<void> => {
    setBusy(true);
    try {
      await api(`/api/applications/${application.id}/personalize`, { method: 'POST' });
      await load();
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'Could not prepare documents.')
          : 'Could not prepare documents.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
      aria-labelledby="tailored-documents-title"
    >
      <h2 id="tailored-documents-title" className="text-lg font-bold text-foreground m-0">
        Tailored documents
      </h2>
      <p className="text-xs text-muted-foreground m-0">
        Generated locally from confirmed profile facts and this job’s saved description. Review every claim before
        approval.
      </p>
      {error && (
        <p className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs">
          {error}
        </p>
      )}
      {data?.warnings.map((warning) => (
        <p
          className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs"
          key={warning}
        >
          {warning}
        </p>
      ))}
      {editable && (
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void generate()}>
          {data?.variants.length ? 'Regenerate tailored documents' : 'Prepare tailored documents'}
        </Button>
      )}
      {data?.requirements.length ? (
        <details className="text-xs space-y-2">
          <summary className="font-semibold cursor-pointer text-foreground">Job requirements and evidence</summary>
          <ul className="space-y-1.5 p-0 m-0 list-none text-muted-foreground pt-2">
            {data.requirements.map((item) => (
              <li key={item.requirement} className="p-2 rounded bg-muted/40 border border-border/60">
                <strong className="text-foreground">{item.requirement}</strong> —{' '}
                {item.classification.replaceAll('_', ' ').toLowerCase()}: {item.explanation}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {data?.variants.map((variant) => (
        <DocumentVariantEditor
          key={variant.id}
          applicationId={application.id}
          variant={variant}
          editable={editable}
          onChanged={async () => {
            await load();
            onChanged();
          }}
        />
      ))}
    </section>
  );
}

function DocumentVariantEditor({
  applicationId,
  variant,
  editable,
  onChanged,
}: {
  applicationId: string;
  variant: PersonalizationView['variants'][number];
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [content, setContent] = useState(variant.content);
  const [busy, setBusy] = useState(false);
  const changed = content !== variant.content;

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await api(`/api/applications/${applicationId}/personalization/${variant.id}`, {
        method: 'PUT',
        body: { content },
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <label className="text-sm font-semibold text-foreground block" htmlFor={`variant-${variant.id}`}>
        {variant.kind === 'resume' ? 'Tailored résumé source' : 'Tailored cover letter'}{' '}
        <span className="text-xs font-normal text-muted-foreground">
          ({variant.status.replaceAll('_', ' ').toLowerCase()})
        </span>
      </label>
      <Textarea
        id={`variant-${variant.id}`}
        rows={variant.kind === 'resume' ? 18 : 12}
        value={content}
        readOnly={!editable}
        onChange={(event) => setContent(event.target.value)}
        className="font-mono text-xs"
      />
      {variant.evidence.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Evidence:{' '}
          {variant.evidence
            .map((item) => `${item.requirement} (${item.classification.replaceAll('_', ' ').toLowerCase()})`)
            .join(', ')}
          .
        </p>
      )}
      {editable && changed && (
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void save()}>
          Save document edit
        </Button>
      )}
    </div>
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
  const initial = Object.fromEntries(
    view.payload.fields.filter((f) => f.kind !== 'file').map((f) => [f.key, f.value ?? '']),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const resumeNow = view.payload.attachments.find((a) => a.kind === 'resume')?.documentId ?? '';
  const [resume, setResume] = useState(resumeNow);
  const [reason, setReason] = useState('');

  const changedFields = view.payload.fields.filter(
    (f) => f.kind !== 'file' && (values[f.key] ?? '') !== (f.value ?? ''),
  );
  const dirty = changedFields.length > 0 || resume !== resumeNow;

  const save = (): void => {
    const changes: Record<string, unknown> = {};
    if (changedFields.length) changes.fields = changedFields.map((f) => ({ key: f.key, value: values[f.key] ?? '' }));
    if (resume !== resumeNow) changes.resumeDocumentId = resume || null;
    void onSave(changes, reason.trim() || 'Edited by you');
  };

  return (
    <section
      aria-labelledby="answers-title"
      className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
    >
      <h2 id="answers-title" className="text-lg font-bold text-foreground m-0">
        Answers and documents
      </h2>
      {view.state === 'APPROVED' && (
        <p className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs">
          Changing anything creates a new version and cancels your approval.
        </p>
      )}
      {view.missingRequired.length > 0 && (
        <p
          className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs"
          role="note"
        >
          Still needed: {view.missingRequired.join(', ')}.
        </p>
      )}
      {view.warnings.length > 0 && (
        <div
          className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs space-y-1"
          role="note"
        >
          <p className="font-semibold text-foreground m-0">
            Check these statements. They are not supported by your approved profile:
          </p>
          <ul className="list-disc list-inside space-y-0.5 m-0 pl-1">
            {view.warnings.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="space-y-4 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {view.payload.fields.map((f) => {
          const id = `field-${f.key}`;
          const label = (
            <label htmlFor={id} className="text-sm font-medium text-foreground block mb-1">
              {f.label}
              {f.required ? (
                <span className="text-destructive text-xs"> (required)</span>
              ) : (
                <span className="text-muted-foreground text-xs"> (optional)</span>
              )}
            </label>
          );
          if (f.kind === 'file' && !/resume|cv/i.test(`${f.key} ${f.label}`)) {
            return (
              <div className="space-y-1" key={f.key}>
                <p className="text-sm font-medium text-foreground m-0">{f.label}</p>
                <p className="text-xs text-muted-foreground m-0">
                  Career Strike attaches only your résumé. Attach this file yourself on the employer’s site.
                </p>
              </div>
            );
          }
          if (f.kind === 'file') {
            return (
              <div className="space-y-1.5" key={f.key}>
                {label}
                <select
                  id={id}
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">No file</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename} ({d.kind.replace('_', ' ')})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground m-0">
                  Files come from your{' '}
                  <Link href="/profile#documents" className="text-primary hover:underline">
                    documents
                  </Link>
                  .
                </p>
                <UploadInline onUploaded={onUploaded} />
              </div>
            );
          }
          return (
            <div className="space-y-1.5" key={f.key}>
              {label}
              {f.kind === 'long_text' ? (
                <Textarea
                  id={id}
                  rows={f.key === 'cover_letter_text' ? 12 : 4}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              ) : f.kind === 'choice' && f.options.length > 0 ? (
                <select
                  id={id}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={id}
                  type="text"
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
              <p className="text-xs text-muted-foreground m-0">{SOURCE_NOTE[f.source]}</p>
            </div>
          );
        })}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label htmlFor="change-reason" className="text-sm font-medium text-foreground block">
            What changed?{' '}
            <span className="text-xs text-muted-foreground font-normal">(optional, kept in the history)</span>
          </label>
          <Input id="change-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={!dirty || busy}>
            Save as a new version
          </Button>
        </div>
      </form>
    </section>
  );
}

function UploadInline({ onUploaded }: { onUploaded: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="pt-1 space-y-1">
      <label htmlFor="upload-resume" className="text-xs text-muted-foreground block">
        Or upload a new résumé
      </label>
      <Input
        id="upload-resume"
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setStatus(await uploadDocument(file, 'resume'));
          onUploaded();
        }}
        className="text-xs h-8 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-muted"
      />
      {status && (
        <span role="status" className="text-xs text-muted-foreground block">
          {status}
        </span>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs ml-2"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
      <span className="sr-only"> {label}</span>
    </Button>
  );
}

function Package({ view }: { view: ApplicationView }) {
  const p = view.payload;
  const copyable = view.state === 'APPROVED' || view.state === 'NEEDS_MANUAL_ACTION';

  return (
    <div className="space-y-4" data-testid="package">
      <dl className="grid grid-cols-1 gap-2 p-3 rounded-lg bg-muted/30 border border-border text-xs">
        <div>
          <dt className="text-muted-foreground font-semibold">Destination</dt>
          <dd className="text-foreground mt-0.5">
            {p.destination.method === 'manual'
              ? 'You submit it on the employer’s site'
              : p.destination.method === 'assisted'
                ? 'You submit it with Career Strike’s help'
                : 'Owned test endpoint'}
            <br />
            {p.destination.url ? (
              <ExternalLink href={p.destination.url} className="text-primary hover:underline">
                {new URL(p.destination.url).host}
              </ExternalLink>
            ) : (
              <span className="text-muted-foreground">No link</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground font-semibold">Version</dt>
          <dd className="text-foreground mt-0.5">
            {view.version} · <code title={view.payloadHash}>{shortHash(view.payloadHash)}</code>
          </dd>
        </div>
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1.5">You would disclose</h3>
        <ul className="space-y-1 p-0 m-0 list-none text-xs text-muted-foreground">
          {view.disclosures.map((d) => (
            <li key={d} className="p-1.5 rounded bg-muted/20 border border-border/50">
              {d}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1.5">Answers</h3>
        <dl className="space-y-2 text-xs">
          {p.fields
            .filter((f) => f.key !== 'cover_letter_text')
            .map((f) => (
              <div key={f.key} className="p-2 rounded bg-muted/20 border border-border/40">
                <dt className="font-semibold text-foreground">{f.label}</dt>
                <dd className="text-muted-foreground mt-0.5 flex items-center justify-between">
                  <span>{f.value ?? <span className="italic">Not answered</span>}</span>
                  {copyable && f.value && f.kind !== 'file' && <CopyButton text={f.value} label={f.label} />}
                </dd>
              </div>
            ))}
        </dl>
      </div>

      {p.attachments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1.5">Files</h3>
          <ul className="space-y-1 p-0 m-0 list-none text-xs text-muted-foreground">
            {p.attachments.map((a) => (
              <li key={a.documentId} className="p-1.5 rounded bg-muted/20 border border-border/50">
                {a.filename} <code title={a.sha256}>sha256 {shortHash(a.sha256)}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.coverLetter && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-sm font-semibold text-foreground m-0">Cover letter</h3>
            {copyable && <CopyButton text={p.coverLetter} label="cover letter" />}
          </div>
          <pre className="p-3 rounded-md bg-muted/40 border border-border text-xs whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
            {p.coverLetter}
          </pre>
        </div>
      )}

      {p.notAnswered.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Not answered by Career Strike</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Voluntary questions on the employer’s form. Answer them yourself on their site if you wish.
          </p>
          <ul className="space-y-1 p-0 m-0 list-none text-xs text-muted-foreground">
            {p.notAnswered.map((q) => (
              <li key={q} className="p-1.5 rounded bg-muted/20 border border-border/40">
                {q}
              </li>
            ))}
          </ul>
        </div>
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
  const navigate = useNavigateTo();
  const [ack, setAck] = useState(false);
  const can = (s: string): boolean => view.allowedTransitions.includes(s as ApplicationView['state']);
  const reject = (): void => {
    const note = window.prompt('Why are you rejecting this application? (optional)');
    if (note === null) return;
    void run('Rejected. Nothing was sent.', () => post('reject', { note: note.trim() || null }));
  };

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {view.state === 'DRAFTED' && (
        <Button
          type="button"
          disabled={busy || view.missingRequired.length > 0}
          onClick={() => void run('Marked ready for review.', () => post('ready'))}
          className="w-full"
        >
          Mark ready for review
        </Button>
      )}
      {view.state === 'READY_FOR_REVIEW' && (
        <div className="space-y-3">
          {view.warnings.length > 0 && (
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>I confirm the flagged statements are accurate.</span>
            </label>
          )}
          <Button
            type="button"
            disabled={busy || (view.warnings.length > 0 && !ack)}
            onClick={() =>
              void run('Approved. This exact version may now be submitted.', () =>
                post('approve', { version: view.version, payloadHash: view.payloadHash, acknowledgeWarnings: ack }),
              )
            }
            className="w-full"
          >
            Approve this exact application
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void run('Saved for later.', () => post('save-for-later'))}
            className="w-full text-xs"
          >
            Save for later
          </Button>
        </div>
      )}
      {view.duplicateRisk.length > 0 && (
        <div
          className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs"
          role="note"
          data-testid="duplicate-risk"
        >
          <strong>Possible duplicate.</strong> You have{' '}
          {view.duplicateRisk.length === 1 ? 'another application' : `${view.duplicateRisk.length} other applications`}{' '}
          for this same role:{' '}
          {view.duplicateRisk.map((d, i) => (
            <span key={d.applicationId}>
              {i > 0 && ', '}
              <Link href={`/applications/${d.applicationId}`} className="text-primary hover:underline">
                {APP_STATE_LABEL[d.state]}
              </Link>
            </span>
          ))}
          . Career Strike will not submit the same role twice.
        </div>
      )}
      {view.state === 'APPROVED' && view.payload.destination.method === 'test-ats' && (
        <div className="p-3 rounded-md bg-muted/40 border border-border text-xs space-y-2" role="note">
          <p className="m-0">
            <strong className="text-foreground">
              {view.approval.valid ? 'Approval is valid' : 'Approval is not valid'}
            </strong>{' '}
            — {view.approval.reason}
          </p>
          <p className="text-muted-foreground m-0">
            This goes to the practice endpoint on this computer, not to an employer. It is sent once, with a receipt.
          </p>
          <Button
            type="button"
            disabled={busy || !view.approval.valid}
            onClick={() => void run('Sending to the practice endpoint…', () => post('submit'))}
            className="w-full"
          >
            Submit to the practice endpoint
          </Button>
        </div>
      )}
      {view.state === 'SUBMISSION_IN_PROGRESS' && (
        <p
          className="p-3 rounded-md bg-muted/40 border border-border text-xs text-muted-foreground m-0"
          role="status"
          aria-live="polite"
        >
          Sending… Career Strike is waiting for a receipt.
        </p>
      )}
      {view.state === 'SUBMISSION_UNCONFIRMED' && view.mode === 'automated' && (
        <div
          className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs space-y-2"
          role="note"
        >
          <p className="m-0">
            <strong>Career Strike does not know whether it arrived.</strong> It will not resend it. Ask the endpoint
            whether it has a record of this submission.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run('Checked with the endpoint.', () => post('reconcile'))}
            className="w-full"
          >
            Check whether it arrived
          </Button>
        </div>
      )}
      {view.state === 'SUBMISSION_FAILED' && (
        <div
          className="p-3 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs space-y-2"
          role="note"
        >
          <p className="m-0">
            <strong>It was not submitted.</strong> To try again, prepare it again and approve the new version.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run('Back to drafts. Review and approve it again.', () => post('redraft'))}
            className="w-full"
          >
            Prepare it again
          </Button>
        </div>
      )}
      {view.state === 'APPROVED' && view.payload.destination.method !== 'test-ats' && (
        <div className="p-3 rounded-md bg-muted/40 border border-border text-xs space-y-2" role="note">
          <p className="m-0">
            <strong className="text-foreground">
              {view.approval.valid ? 'Approval is valid' : 'Approval is not valid'}
            </strong>{' '}
            — {view.approval.reason}
          </p>
          {view.approval.approval && (
            <p className="text-muted-foreground m-0">
              Approved {formatDateTime(view.approval.approval.issuedAt)}; expires{' '}
              {formatDateTime(view.approval.approval.expiresAt)}.
            </p>
          )}
          <p className="text-muted-foreground m-0">
            When you start, the approval is used up. Then submit on the employer’s site, using the copy buttons for each
            answer.
          </p>
          <Button
            type="button"
            disabled={busy || !view.approval.valid}
            onClick={() => {
              if (view.payload.destination.url)
                window.open(view.payload.destination.url, '_blank', 'noopener,noreferrer');
              void run('Started. Submit on the employer’s site, then tell Career Strike what happened.', () =>
                post('start-submission'),
              );
            }}
            className="w-full"
          >
            Start submitting on the employer’s site
          </Button>
          {view.payload.destination.url && (
            <ExternalLink
              href={view.payload.destination.url}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full text-center text-xs')}
            >
              Open the official application
            </ExternalLink>
          )}
        </div>
      )}
      {(view.state === 'NEEDS_MANUAL_ACTION' ||
        (view.state === 'SUBMISSION_UNCONFIRMED' && view.mode !== 'automated')) && (
        <ConfirmSubmission view={view} busy={busy} post={post} run={run} />
      )}
      {OUTCOMES.some((o) => can(o)) && view.state !== 'NEEDS_MANUAL_ACTION' && (
        <RecordOutcome
          key={`${view.state}:${view.events.length}`}
          view={view}
          busy={busy}
          post={post}
          run={run}
          can={can}
        />
      )}
      {can('CANCELLED') && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={reject}
          className="w-full text-xs text-muted-foreground"
        >
          Reject
        </Button>
      )}
      {view.state === 'CANCELLED' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/jobs/${view.jobId}`)}
          className="w-full text-xs"
        >
          Back to the job
        </Button>
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
      className="p-3.5 rounded-lg border border-border bg-card space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void run('Recorded as submitted.', () =>
          post('confirm-submitted', {
            submittedAt: date,
            reference: reference.trim() || null,
            note: note.trim() || null,
          }),
        );
      }}
    >
      <p className="font-semibold text-foreground m-0">
        Did you submit it? Career Strike only counts it as submitted when you confirm.
      </p>
      <div className="space-y-1">
        <label htmlFor="submitted-at" className="text-muted-foreground font-medium block">
          Date submitted
        </label>
        <Input
          id="submitted-at"
          type="date"
          required
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="reference" className="text-muted-foreground font-medium block">
          Confirmation number or reference (optional)
        </label>
        <Input
          id="reference"
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm-note" className="text-muted-foreground font-medium block">
          What did you see? (optional)
        </label>
        <Input
          id="confirm-note"
          type="text"
          placeholder="e.g. confirmation email received"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full h-8 text-xs">
        Yes, I submitted it
      </Button>
      {view.state === 'NEEDS_MANUAL_ACTION' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void run('Marked as not confirmed.', () => post('mark-unconfirmed', { note: null }))}
          className="w-full h-8 text-xs text-muted-foreground"
        >
          I’m not sure it went through
        </Button>
      )}
    </form>
  );
}

function RecordOutcome({
  view,
  busy,
  post,
  run,
  can,
}: {
  view: ApplicationView;
  busy: boolean;
  post: Post;
  run: Run;
  can: (s: string) => boolean;
}) {
  const options = OUTCOMES.filter((o) => can(o));
  const [chosen, setOutcome] = useState<string>(options[0] ?? '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const outcome = options.includes(chosen as (typeof OUTCOMES)[number]) ? chosen : (options[0] ?? '');

  return (
    <form
      className="p-3.5 rounded-lg border border-border bg-card space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void run('Recorded.', () => post('outcome', { outcome, occurredAt: date, note: note.trim() || null }));
      }}
    >
      <p className="font-semibold text-foreground m-0">Record what happened</p>
      <div className="space-y-1">
        <label htmlFor="outcome" className="text-muted-foreground font-medium block">
          What happened?
        </label>
        <select
          id="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABEL[o]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="outcome-date" className="text-muted-foreground font-medium block">
          When?
        </label>
        <Input
          id="outcome-date"
          type="date"
          required
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="outcome-note" className="text-muted-foreground font-medium block">
          Details (optional)
        </label>
        <Input
          id="outcome-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <Button type="submit" disabled={busy || !outcome} className="w-full h-8 text-xs">
        Record
      </Button>
      {view.state === 'OFFER' && (
        <span className="text-xs text-teal-600 dark:text-teal-400 font-semibold block text-center">
          Congratulations.
        </span>
      )}
    </form>
  );
}

function FollowUpStudio({ view }: { view: ApplicationView }) {
  const [kind, setKind] = useState<OutreachKind>(
    view.state === 'INTERVIEW'
      ? 'post_interview_thanks'
      : view.state === 'OFFER'
        ? 'offer_next_steps'
        : 'status_inquiry',
  );
  const [contactName, setContactName] = useState('');
  const [highlight, setHighlight] = useState('');
  const [copied, setCopied] = useState(false);

  const candidateName = useMemo(() => {
    const f = view.payload.fields.find((field) =>
      ['full_name', 'name', 'candidate_name'].includes(field.key.toLowerCase()),
    );
    return typeof f?.value === 'string' && f.value.trim() ? f.value.trim() : 'Candidate';
  }, [view.payload.fields]);

  const draft = useMemo(() => {
    return buildOutreachDraft({
      kind,
      employer: view.job.employer,
      title: view.job.title,
      candidateName,
      contactName,
      discussionHighlight: highlight,
    });
  }, [kind, view.job.employer, view.job.title, candidateName, contactName, highlight]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="outreach-title">
      <h3 id="outreach-title" className="text-base font-semibold text-foreground m-0">
        ✉️ Professional Follow-Up Studio
      </h3>
      <p className="text-xs text-muted-foreground m-0">
        Draft thoughtful, stage-appropriate correspondence with one-click copy.
      </p>

      <div
        className="flex gap-1 p-1 bg-muted/60 rounded-lg border border-border"
        role="tablist"
        aria-label="Follow-up draft types"
      >
        <Button
          type="button"
          variant={kind === 'status_inquiry' ? 'default' : 'ghost'}
          size="sm"
          role="tab"
          aria-selected={kind === 'status_inquiry'}
          className="text-xs h-7 flex-1"
          onClick={() => setKind('status_inquiry')}
        >
          Check-in
        </Button>
        <Button
          type="button"
          variant={kind === 'post_interview_thanks' ? 'default' : 'ghost'}
          size="sm"
          role="tab"
          aria-selected={kind === 'post_interview_thanks'}
          className="text-xs h-7 flex-1"
          onClick={() => setKind('post_interview_thanks')}
        >
          Thank You
        </Button>
        <Button
          type="button"
          variant={kind === 'offer_next_steps' ? 'default' : 'ghost'}
          size="sm"
          role="tab"
          aria-selected={kind === 'offer_next_steps'}
          className="text-xs h-7 flex-1"
          onClick={() => setKind('offer_next_steps')}
        >
          Offer
        </Button>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <label htmlFor="outreach-contact" className="text-xs text-muted-foreground font-medium block">
            Contact or recruiter name (optional)
          </label>
          <Input
            id="outreach-contact"
            type="text"
            placeholder="e.g. Sarah Miller"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        {kind === 'post_interview_thanks' && (
          <div className="space-y-1">
            <label htmlFor="outreach-highlight" className="text-xs text-muted-foreground font-medium block">
              Discussion highlight (optional)
            </label>
            <Input
              id="outreach-highlight"
              type="text"
              placeholder="e.g. system reliability during peak traffic"
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        )}
      </div>

      <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-2 text-xs">
        <div className="text-foreground">
          <strong>Subject:</strong> {draft.subject}
        </div>
        <pre
          className="p-2.5 rounded bg-card border border-border text-xs whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-label="Email draft preview"
        >
          {draft.body}
        </pre>
        <div>
          <Button type="button" variant="secondary" size="sm" className="w-full text-xs h-7" onClick={handleCopy}>
            {copied ? '✓ Copied to Clipboard!' : '📋 Copy Outreach Draft'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function History({ view }: { view: ApplicationView }) {
  return (
    <details className="text-xs space-y-2 pt-2 border-t border-border">
      <summary className="font-semibold cursor-pointer text-foreground">
        History ({view.versions.length} versions)
      </summary>
      <ol className="space-y-1 p-0 m-0 list-none text-muted-foreground pt-2">
        {view.events.map((e, i) => (
          <li key={i} className="p-1.5 rounded bg-muted/20 border border-border/40">
            {formatDateTime(e.at)} · {e.from ? `${APP_STATE_LABEL[e.from] ?? e.from} → ` : ''}
            {APP_STATE_LABEL[e.to] ?? e.to}
            {e.note ? ` · ${e.note}` : ''}
            {e.evidence && typeof e.evidence.reference === 'string' ? ` · ref ${e.evidence.reference}` : ''}
            {e.evidence && typeof (e.evidence.receipt as { receiptId?: unknown } | undefined)?.receiptId === 'string'
              ? ` · receipt ${(e.evidence.receipt as { receiptId: string }).receiptId}`
              : ''}{' '}
            <span className="text-muted-foreground">({e.actor})</span>
          </li>
        ))}
      </ol>
      <h3 className="text-xs font-semibold text-foreground pt-2">Versions</h3>
      <ol className="space-y-1 p-0 m-0 list-none text-muted-foreground">
        {view.versions.map((v) => (
          <li key={v.version} className="p-1.5 rounded bg-muted/20 border border-border/40">
            v{v.version} · {v.reason} · {formatDateTime(v.createdAt)} <code>{shortHash(v.payloadHash)}</code>
          </li>
        ))}
      </ol>
    </details>
  );
}

export default ApplicationPage;
