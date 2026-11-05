import { useState } from 'react';
import { api, type LinkedInImportResult } from '../../../api';

export function LinkedInImportSection({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    setStatus('Reading export file...');
    try {
      let body: unknown;
      if (file.name.endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        body = { zipBase64: btoa(binary) };
      } else {
        const text = await file.text();
        body = { csvText: text, filename: file.name };
      }
      const res = await api<{ ok: boolean; result: LinkedInImportResult }>('/api/profile/import/linkedin', {
        method: 'POST',
        body,
      });
      const { imported, total, skipped } = res.result;
      if (total === 0) {
        setStatus(
          skipped > 0
            ? `All items in ${file.name} were already in your profile.`
            : `No profile items found in ${file.name}.`,
        );
      } else {
        const parts = [
          imported.roles ? `${imported.roles} role${imported.roles > 1 ? 's' : ''}` : null,
          imported.skills ? `${imported.skills} skill${imported.skills > 1 ? 's' : ''}` : null,
          imported.education ? `${imported.education} education` : null,
          imported.certifications ? `${imported.certifications} cert${imported.certifications > 1 ? 's' : ''}` : null,
          imported.languages ? `${imported.languages} language${imported.languages > 1 ? 's' : ''}` : null,
          imported.projects ? `${imported.projects} project${imported.projects > 1 ? 's' : ''}` : null,
        ].filter(Boolean);
        setStatus(`Imported ${parts.join(', ')} for your review below. Nothing is used until you approve it.`);
      }
      onChange();
    } catch {
      setStatus('Could not process the file. Check that it is a valid LinkedIn archive or CSV.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs"
      aria-labelledby="linkedin-import-title"
      id="linkedin-import"
    >
      <h2 id="linkedin-import-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Import from LinkedIn export
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Upload your LinkedIn data export archive (.zip) or individual CSV file (e.g. <code>Positions.csv</code>,{' '}
        <code>Skills.csv</code>, <code>Education.csv</code>, <code>Projects.csv</code>). Career Strike extracts facts
        locally on this computer; each item is suggested for your review below and is never used until you approve it.
      </p>
      <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor="linkedin-export-file" className="block text-xs font-medium text-foreground">
            LinkedIn export file (.zip or .csv)
          </label>
          <input
            id="linkedin-export-file"
            type="file"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            accept=".zip,.csv,application/zip,text/csv"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleFile(file);
                e.target.value = '';
              }
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
