import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type UpdateStatus } from '../api';
import { formatDate, formatDateTime } from '../format';
import { Link } from '../router';
import { apiKey, useResource } from '../useResource';
import { Button } from './ui/button';

const PATH = '/api/updates';

function useUpdateActions(): {
  busy: boolean;
  failed: boolean;
  post: (action: 'check' | 'acknowledge') => Promise<void>;
} {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const post = async (action: 'check' | 'acknowledge'): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      queryClient.setQueryData(apiKey(PATH), await api<UpdateStatus>(`${PATH}/${action}`, { method: 'POST' }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return { busy, failed, post };
}

/** Release notes are plain text (never rendered as HTML); long notes scroll, so keyboards can reach them. */
function ReleaseNotes({ version, text }: { version: string; text: string }) {
  return (
    <div
      className="font-mono text-xs leading-relaxed bg-background border border-border rounded-lg p-4 whitespace-pre-wrap max-h-60 overflow-y-auto"
      role="region"
      aria-label={`Release notes for ${version}`}
      tabIndex={0}
    >
      {text}
    </div>
  );
}

/** One quiet line above every page: a new release (only if checks are on), or what just changed. */
export function UpdateBanner() {
  const res = useResource<UpdateStatus>(PATH);
  const { busy, post } = useUpdateActions();
  if (res.state !== 'ready') return null;
  const { whatsNew, updateAvailable, latest } = res.data;

  if (whatsNew) {
    return (
      <div
        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200 text-xs mb-4"
        role="status"
        data-testid="whats-new-banner"
      >
        <p>
          <strong>Career Strike is now {whatsNew.to}</strong> (was {whatsNew.from}).{' '}
          <Link href="/settings#updates" className="underline font-medium">
            See what’s new
          </Link>
        </p>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void post('acknowledge')}>
          Dismiss
        </Button>
      </div>
    );
  }
  if (updateAvailable && latest) {
    return (
      <div
        className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs mb-4"
        role="status"
        data-testid="update-banner"
      >
        <p>
          <strong>Career Strike {latest.version} is available.</strong> Run <code>career-strike update</code> in a
          terminal — your data is backed up first.{' '}
          <Link href="/settings#updates" className="underline font-medium">
            Details
          </Link>
        </p>
      </div>
    );
  }
  return null;
}

/** Settings → Updates: the installed version, the last check, and how to update or go back. */
export function UpdatesPanel() {
  const res = useResource<UpdateStatus>(PATH);
  const { busy, failed, post } = useUpdateActions();
  if (res.state !== 'ready') return null;
  const s = res.data;

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6"
      aria-labelledby="updates-title"
      id="updates"
      tabIndex={-1}
    >
      <h2 id="updates-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Updates
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        You have Career Strike{' '}
        <strong data-testid="installed-version" className="text-foreground">
          {s.current}
        </strong>
        .{' '}
        {s.checks === 'weekly'
          ? 'It looks for new versions once a week.'
          : 'It does not look for new versions on its own.'}{' '}
        <Link href="/settings#monitoring.updateChecks" className="text-primary hover:underline">
          Change
        </Link>
      </p>

      {s.whatsNew && (
        <div className="space-y-2 py-4 border-b border-border/60">
          <h3 className="text-sm font-semibold text-foreground">What’s new in {s.whatsNew.to}</h3>
          {s.whatsNew.notes ? (
            <ReleaseNotes version={s.whatsNew.to} text={s.whatsNew.notes} />
          ) : (
            <p className="text-xs text-muted-foreground">This version has no release notes.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Not working for you? <code>career-strike update --undo</code> returns to {s.whatsNew.from}.
          </p>
        </div>
      )}

      {s.updateAvailable && s.latest && (
        <div className="space-y-2 py-4 border-b border-border/60" data-testid="update-available">
          <h3 className="text-sm font-semibold text-foreground">
            {s.latest.name}
            {s.latest.publishedAt ? ` · released ${formatDate(s.latest.publishedAt)}` : ''}
          </h3>
          {s.latest.notes && <ReleaseNotes version={s.latest.version} text={s.latest.notes} />}
          <p className="text-xs text-muted-foreground">
            Run this in a terminal. Your data is backed up first, and the update can be undone.
          </p>
          <pre className="font-mono text-xs bg-muted/60 text-foreground p-2.5 rounded-md border border-border inline-block">
            career-strike update
          </pre>
          <p className="text-xs text-muted-foreground">
            <a
              href={s.latest.url}
              target="_blank"
              rel="noopener noreferrer external"
              className="text-primary hover:underline"
            >
              Full release notes on GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
      )}

      <div className="space-y-2 py-4">
        <h3 className="text-sm font-semibold text-foreground">Check for a new version</h3>
        <p className="text-xs text-muted-foreground" data-testid="update-check-status">
          {s.checkedAt ? `Last checked ${formatDateTime(s.checkedAt)}` : 'Not checked yet'}
          {s.checkedAt && !s.error && !s.updateAvailable ? ' — you have the newest version.' : '.'}
          {s.error ? ` The last check failed: ${s.error}` : ''}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Button type="button" size="sm" disabled={busy} onClick={() => void post('check')}>
            {busy ? 'Checking…' : 'Check now'}
          </Button>
          <span className="text-xs text-muted-foreground">Asks GitHub once for the public release list.</span>
        </div>
        {failed && (
          <p
            className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs mt-2"
            role="alert"
          >
            Could not check right now. Try again, or run <code>career-strike update --check</code>.
          </p>
        )}
      </div>
    </section>
  );
}
