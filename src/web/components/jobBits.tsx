import { useState } from 'react';
import { api, type Disposition, type EffectiveStatus, type JobDetail } from '../api';
import { statusText } from '../format';
import { Button } from './ui/button';

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  closed: 'border-border bg-muted/60 text-muted-foreground',
  unverified: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
};

export function StatusChip({ status, lastVerifiedAt }: { status: EffectiveStatus; lastVerifiedAt: string | null }) {
  const { label, detail } = statusText(status, lastVerifiedAt);
  const style = STATUS_STYLES[status.toLowerCase()] ?? 'border-border bg-muted text-foreground';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style}`}>
      <strong>{label}</strong>
      <span className="opacity-80"> · {detail}</span>
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
      const res = await api<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(jobId)}/disposition`, {
        method: 'PUT',
        body: { disposition: next },
      });
      onChange(res.job.disposition);
    } catch {
      setError('Not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label={`Decision for ${title}`}>
      <Button
        type="button"
        size="sm"
        variant={disposition === 'shortlisted' ? 'default' : 'outline'}
        aria-pressed={disposition === 'shortlisted'}
        disabled={busy}
        onClick={() => void set(disposition === 'shortlisted' ? 'none' : 'shortlisted')}
      >
        {disposition === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={disposition === 'excluded' ? 'secondary' : 'ghost'}
        aria-pressed={disposition === 'excluded'}
        disabled={busy}
        onClick={() => void set(disposition === 'excluded' ? 'none' : 'excluded')}
      >
        {disposition === 'excluded' ? 'Excluded' : 'Not for me'}
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="status">
          {error}
        </span>
      )}
    </div>
  );
}
