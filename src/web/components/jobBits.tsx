import { useState } from 'react';
import { api, type Disposition, type EffectiveStatus, type JobDetail } from '../api';
import { statusText } from '../format';

export function StatusChip({ status, lastVerifiedAt }: { status: EffectiveStatus; lastVerifiedAt: string | null }) {
  const { label, detail } = statusText(status, lastVerifiedAt);
  return (
    <span className={`chip chip--${status.toLowerCase()}`}>
      <strong>{label}</strong>
      <span className="chip__detail"> · {detail}</span>
    </span>
  );
}

/** Shortlist / exclude toggles. Each click is saved immediately and reflected only after the server confirms. */
export function DispositionControls({
  jobId,
  title,
  disposition,
  onChange,
}: {
  jobId: string;
  title: string;
  disposition: Disposition;
  onChange: (d: Disposition) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = async (next: Disposition): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(jobId)}/disposition`, { method: 'PUT', body: { disposition: next } });
      onChange(res.job.disposition);
    } catch {
      setError('Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="disposition" role="group" aria-label={`Decision for ${title}`}>
      <button
        type="button"
        className="toggle"
        aria-pressed={disposition === 'shortlisted'}
        disabled={busy}
        onClick={() => void set(disposition === 'shortlisted' ? 'none' : 'shortlisted')}
      >
        {disposition === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
      </button>
      <button
        type="button"
        className="toggle toggle--quiet"
        aria-pressed={disposition === 'excluded'}
        disabled={busy}
        onClick={() => void set(disposition === 'excluded' ? 'none' : 'excluded')}
      >
        {disposition === 'excluded' ? 'Excluded' : 'Not for me'}
      </button>
      {error && (
        <span className="save-status save-status--error" role="status">
          {error}
        </span>
      )}
    </div>
  );
}
