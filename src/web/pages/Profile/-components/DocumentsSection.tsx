import { useCallback, useEffect, useState } from 'react';
import { api, type StoredDocument } from '../../../api';
import { Button } from '../../../components/ui/button';
import { formatDate } from '../../../format';
import { uploadDocument } from '../../ApplicationPage';

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
    <section className="settings-group" aria-labelledby="documents-title" id="documents">
      <h2 id="documents-title">Documents</h2>
      <p className="help">
        Kept in your private vault on this computer. A file is attached to an application only when you approve that
        application.
      </p>
      {docs && docs.length === 0 && <p className="empty">No documents yet.</p>}
      {docs && docs.length > 0 && (
        <ul className="fact-list" data-testid="documents">
          {docs.map((d) => (
            <li key={d.id}>
              <span>
                {d.filename}{' '}
                <span className="muted">
                  · {d.kind.replace('_', ' ')} · {Math.ceil(d.sizeBytes / 1024)} KB · added {formatDate(d.createdAt)}
                </span>
              </span>
              <span className="doc-actions">
                <a href={`/api/documents/${d.id}/content`} download className="button button--quiet text-xs mr-2">
                  Download<span className="visually-hidden"> {d.filename}</span>
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
                  Remove<span className="visually-hidden"> {d.filename}</span>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="fact-form">
        <div className="record__part">
          <label htmlFor="doc-kind">Type</label>
          <select id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="resume">Résumé</option>
            <option value="cover_letter">Cover letter</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="record__part">
          <label htmlFor="doc-file">File (PDF, .docx or .txt, up to 10 MB)</label>
          <input
            id="doc-file"
            type="file"
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
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
