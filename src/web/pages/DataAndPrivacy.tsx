import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate } from '../format';

interface BackupItem {
  name: string;
  kind: 'pre-upgrade' | 'pre-restore' | 'pre-rollback' | 'manual';
  createdAt: string;
  bytes: number;
  schemaVersion?: number;
}

interface BackupStatus {
  count: number;
  latest: BackupItem | null;
  backups: BackupItem[];
}

interface DisclosureItem {
  id: string;
  provider: string;
  purpose: string;
  requested: string[];
  approved: string[] | null;
  state: 'PENDING' | 'APPROVED' | 'DECLINED' | 'DELIVERED' | 'EXPIRED';
  createdAt: string;
  decidedAt: string | null;
  deliveredAt: string | null;
}

interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const PROVIDER_NAMES: Record<string, string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  test: 'Test client',
};

export function DataAndPrivacy() {
  const [backups, setBackups] = useState<BackupStatus | null>(null);
  const [disclosures, setDisclosures] = useState<DisclosureItem[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<{ checks: DiagnosticCheck[]; allOk: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await api<BackupStatus>('/api/data/backups').catch(() => null);
      setBackups(b);
      const d = await api<{ disclosures: DisclosureItem[]; fields: Record<string, string> }>('/api/disclosures').catch(() => null);
      setDisclosures(d?.disclosures ?? null);
      setLabels(d?.fields ?? {});
      const diag = await api<{ checks: DiagnosticCheck[]; allOk: boolean }>('/api/diagnostics').catch(() => null);
      setDiagnostics(diag);
    } catch {
      // Ignore initial load error
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (): Promise<void> => {
    if (confirmText !== 'delete my career data') return;
    try {
      setDeleteError(null);
      await api<{ ok: boolean }>('/api/data/delete', {
        method: 'POST',
        body: { confirm: confirmText },
      });
      setDeleteStatus('All career data deleted permanently from this computer.');
      setConfirming(false);
    } catch {
      setDeleteError('Could not delete data. Try running `career-strike delete-data` in a terminal.');
    }
  };

  const shared = disclosures?.filter((d) => d.state === 'DELIVERED') ?? [];
  const preUpgrade = backups?.backups.filter((b) => b.kind === 'pre-upgrade').length ?? 0;

  return (
    <section className="settings-group" aria-labelledby="data-privacy-title" id="data-privacy">
      <h2 id="data-privacy-title">Data &amp; privacy</h2>
      <p className="lede">
        Your data stays on this computer. Export, inspect backups, review assistant disclosures, check installation health, or erase everything.
      </p>

      <div className="field">
        <h3>Export career data</h3>
        <p className="help">
          Download a complete, readable JSON archive of your jobs, applications, notes and documents. Login sessions and private signing keys are excluded.
        </p>
        <div className="field__actions" style={{marginTop: "0px"}}>
          <a href="/api/data/export" download="career-strike-export.json" className="button" data-testid="download-export">
            Download data export
          </a>
        </div>
      </div>

      <div className="field">
        <h3>Backups</h3>
        <p className="help">
          Backups are created automatically before upgrades, or run <code>career-strike backup &lt;folder&gt;</code> in a terminal to copy everything for <code>career-strike restore</code>.
        </p>
        <div data-testid="backup-status">
          {backups && backups.count > 0 ? (
            <p>
              Last backup: {formatDate(backups.latest!.createdAt)} ({backups.count} total backup{backups.count === 1 ? '' : 's'} on disk
              {preUpgrade > 0 ? `, including ${preUpgrade} pre-upgrade copy` : ''}).
            </p>
          ) : (
            <p className="empty">No backups recorded yet. Backups are saved automatically before upgrades.</p>
          )}
        </div>
      </div>

      <div className="field">
        <h3>What you’ve shared with AI assistants</h3>
        <p className="help">Every one-time release of profile information that you approved for a connected assistant.</p>
        {shared.length > 0 ? (
          <ul className="disclosures" data-testid="assistant-shares">
            {shared.map((d) => (
              <li key={d.id}>
                {PROVIDER_NAMES[d.provider] ?? d.provider}: {d.approved?.map((f) => labels[f] ?? f).join(', ')} · delivered {formatDate(d.deliveredAt ?? d.decidedAt!)} for “{d.purpose}”
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty" data-testid="assistant-shares-empty">
            No profile information has been shared with AI assistants yet.
          </p>
        )}
      </div>

      <div className="field">
        <h3>Installation diagnostics</h3>
        <p className="help">Environment, permissions and database checks on this installation (identical to <code>career-strike doctor</code>).</p>
        {diagnostics && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Installation diagnostics">
            <table className="compare" data-testid="installation-diagnostics">
              <thead>
                <tr>
                  <th scope="col">Check</th>
                  <th scope="col">Status</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.checks.map((c) => (
                  <tr key={c.name}>
                    <th scope="row">{c.name}</th>
                    <td>
                      <span className={`badge ${c.ok ? 'badge--ok' : 'badge--danger'}`}>{c.ok ? 'PASS' : 'FAIL'}</span>
                    </td>
                    <td>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="field">
        <h3>Delete career data</h3>
        <p className="help">Permanently delete your profile, jobs, applications, documents, settings, and logs from this computer.</p>
        {deleteStatus ? (
          <p role="status" className="banner banner--ok" data-testid="delete-status">
            {deleteStatus}
          </p>
        ) : confirming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            data-testid="delete-confirmation-form"
          >
            <p className="banner banner--danger">
              This action cannot be undone. To permanently erase your data, type <strong>delete my career data</strong> below.
            </p>
            <div className="field">
              <label htmlFor="delete-confirm-input">Type: delete my career data</label>
              <input
                id="delete-confirm-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="delete my career data"
                autoComplete="off"
                data-testid="delete-confirm-input"
              />
            </div>
            {deleteError && (
              <p role="alert" className="banner banner--danger">
                {deleteError}
              </p>
            )}
            <div className="field__actions" style={{ marginTop: "0px" }}>
              <button
                type="submit"
                disabled={confirmText !== 'delete my career data'}
                data-testid="confirm-delete-button"
              >
                Permanently delete all data
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="field__actions" style={{ marginTop: "0px" }}>
            <button
              type="button"
              className="quiet"
              onClick={() => setConfirming(true)}
              data-testid="start-delete-button"
            >
              Delete career data…
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
