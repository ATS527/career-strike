import { useCallback, useEffect, useState } from 'react';
import { api, type StoredDocument } from '../../../api';
import { Button } from '../../../components/ui/button';
import { formatDate } from '../../../format';
import { uploadDocument } from '../../../helpers/documents';

export function DocumentsSection() {
  const [docs, setDocs] = useState<StoredDocument[] | null>(null);
  const [kind, setKind] = useState<'resume' | 'cover_letter' | 'other'>('resume');
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDocs((await api<{ documents: StoredDocument[] }>('/api/documents').catch(() => ({ documents: [] }))).documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs"
      aria-labelledby="documents-title"
      id="documents"
    >
      <h2 id="documents-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Documents
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Kept in your private vault on this computer. A file is attached to an application only when you approve that
        application.
      </p>
      {docs && docs.length === 0 && <p className="text-sm text-muted-foreground italic py-2">No documents yet.</p>}
      {docs && docs.length > 0 && (
        <ul className="divide-y divide-border/60 text-sm mb-4" data-testid="documents">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <span className="text-foreground">
                {d.filename}{' '}
                <span className="text-muted-foreground text-xs">
                  · {d.kind.replace('_', ' ')} · {Math.ceil(d.sizeBytes / 1024)} KB · added {formatDate(d.createdAt)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <a
                  href={`/api/documents/${d.id}/content`}
                  download
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3"
                >
                  Download<span className="sr-only"> {d.filename}</span>
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api(`/api/documents/${d.id}`, { method: 'DELETE' }).catch(() =>
                      setStatus('Could not remove.'),
                    );
                    void load();
                  }}
                >
                  Remove<span className="sr-only"> {d.filename}</span>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor="doc-kind" className="block text-xs font-medium text-foreground">
            Type
          </label>
          <select
            id="doc-kind"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="resume">Résumé</option>
            <option value="cover_letter">Cover letter</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="doc-file" className="block text-xs font-medium text-foreground">
            File (PDF, .docx or .txt, up to 10 MB)
          </label>
          <input
            id="doc-file"
            type="file"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setStatus(await uploadDocument(file, kind));
              e.target.value = '';
              void load();
            }}
          />
        </div>
      </div>
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
}
