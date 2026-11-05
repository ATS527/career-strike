import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type UpdateStatus } from '../api';
import { formatDate, formatDateTime } from '../format';
import { Link } from '../router';
import { apiKey, useResource } from '../useResource';

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
    <div className="letter" role="region" aria-label={`Release notes for ${version}`} tabIndex={0}>
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
      <div className="banner banner--ok" role="status" data-testid="whats-new-banner">
        <p>
          <strong>Career Strike is now {whatsNew.to}</strong> (was {whatsNew.from}).{' '}
          <Link href="/settings#updates">See what’s new</Link>
        </p>
        <button type="button" className="quiet" disabled={busy} onClick={() => void post('acknowledge')}>
          Dismiss
        </button>
      </div>
    );
  }
  if (updateAvailable && latest) {
    return (
      <div className="banner banner--attention" role="status" data-testid="update-banner">
        <p>
          <strong>Career Strike {latest.version} is available.</strong> Run <code>career-strike update</code> in a
          terminal — your data is backed up first. <Link href="/settings#updates">Details</Link>
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
    <section className="settings-group" aria-labelledby="updates-title" id="updates" tabIndex={-1}>
      <h2 id="updates-title">Updates</h2>
      <p className="lede">
        You have Career Strike <strong data-testid="installed-version">{s.current}</strong>.{' '}
        {s.checks === 'weekly'
          ? 'It looks for new versions once a week.'
          : 'It does not look for new versions on its own.'}{' '}
        <Link href="/settings#monitoring.updateChecks">Change</Link>
      </p>

      {s.whatsNew && (
        <div className="field">
          <h3>What’s new in {s.whatsNew.to}</h3>
          {s.whatsNew.notes ? (
            <ReleaseNotes version={s.whatsNew.to} text={s.whatsNew.notes} />
          ) : (
            <p className="help">This version has no release notes.</p>
          )}
          <p className="help">
            Not working for you? <code>career-strike update --undo</code> returns to {s.whatsNew.from}.
          </p>
        </div>
      )}

      {s.updateAvailable && s.latest && (
        <div className="field" data-testid="update-available">
          <h3>
            {s.latest.name}
            {s.latest.publishedAt ? ` · released ${formatDate(s.latest.publishedAt)}` : ''}
          </h3>
          {s.latest.notes && <ReleaseNotes version={s.latest.version} text={s.latest.notes} />}
          <p className="help">Run this in a terminal. Your data is backed up first, and the update can be undone.</p>
          <pre className="command">career-strike update</pre>
          <p className="help">
            <a href={s.latest.url} target="_blank" rel="noopener noreferrer external">
              Full release notes on GitHub<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
      )}

      <div className="field">
        <h3>Check for a new version</h3>
        <p className="help" data-testid="update-check-status">
          {s.checkedAt ? `Last checked ${formatDateTime(s.checkedAt)}` : 'Not checked yet'}
          {s.checkedAt && !s.error && !s.updateAvailable ? ' — you have the newest version.' : '.'}
          {s.error ? ` The last check failed: ${s.error}` : ''}
        </p>
        <div className="field__actions field__actions--flush">
          <button type="button" disabled={busy} onClick={() => void post('check')}>
            {busy ? 'Checking…' : 'Check now'}
          </button>
          <span className="help">Asks GitHub once for the public release list.</span>
        </div>
        {failed && (
          <p className="banner banner--danger" role="alert">
            Could not check right now. Try again, or run <code>career-strike update --check</code>.
          </p>
        )}
      </div>
    </section>
  );
}
