import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { formatDate } from '../../../format';

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
      const [b, d, diag] = await Promise.all([
        api<BackupStatus>('/api/data/backups').catch(() => null),
        api<{ disclosures: DisclosureItem[]; fields: Record<string, string> }>('/api/disclosures').catch(() => null),
        api<{ checks: DiagnosticCheck[]; allOk: boolean }>('/api/diagnostics').catch(() => null),
      ]);
      setBackups(b);
      setDisclosures(d?.disclosures ?? null);
      setLabels(d?.fields ?? {});
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
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6"
      aria-labelledby="data-privacy-title"
      id="data-privacy"
    >
      <h2 id="data-privacy-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Data &amp; privacy
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Your data stays on this computer. Export, inspect backups, review assistant disclosures, check installation
        health, or erase everything.
      </p>

      <div className="space-y-2 py-4 border-b border-border/60">
        <h3 className="text-sm font-semibold text-foreground">Export career data</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Download a complete, readable JSON archive of your jobs, applications, notes and documents. Login sessions and
          private signing keys are excluded.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <a
            href="/api/data/export"
            download="career-strike-export.json"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3"
            data-testid="download-export"
          >
            Download data export
          </a>
        </div>
      </div>

      <div className="space-y-2 py-4 border-b border-border/60">
        <h3 className="text-sm font-semibold text-foreground">Backups</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Backups are created automatically before upgrades, or run <code>career-strike backup &lt;folder&gt;</code> in
          a terminal to copy everything for <code>career-strike restore</code>.
        </p>
        <div data-testid="backup-status" className="pt-1">
          {backups && backups.count > 0 ? (
            <p className="text-xs text-foreground">
              Last backup: {formatDate(backups.latest!.createdAt)} ({backups.count} total backup
              {backups.count === 1 ? '' : 's'} on disk
              {preUpgrade > 0 ? `, including ${preUpgrade} pre-upgrade copy` : ''}).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No backups recorded yet. Backups are saved automatically before upgrades.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 py-4 border-b border-border/60">
        <h3 className="text-sm font-semibold text-foreground">What you’ve shared with AI assistants</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every one-time release of profile information that you approved for a connected assistant.
        </p>
        {shared.length > 0 ? (
          <ul
            className="divide-y divide-border/60 text-xs text-muted-foreground pl-4 pt-1"
            data-testid="assistant-shares"
          >
            {shared.map((d) => (
              <li key={d.id} className="py-2 first:pt-0 last:pb-0">
                <span className="text-foreground font-medium">{PROVIDER_NAMES[d.provider] ?? d.provider}</span>:{' '}
                {d.approved?.map((f) => labels[f] ?? f).join(', ')} · delivered{' '}
                {formatDate(d.deliveredAt ?? d.decidedAt!)} for “{d.purpose}”
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic pt-1" data-testid="assistant-shares-empty">
            No profile information has been shared with AI assistants yet.
          </p>
        )}
      </div>

      <div className="space-y-2 py-4 border-b border-border/60">
        <h3 className="text-sm font-semibold text-foreground">Installation diagnostics</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Environment, permissions and database checks on this installation (identical to{' '}
          <code>career-strike doctor</code>).
        </p>
        {diagnostics && (
          <div
            className="overflow-x-auto rounded-lg border border-border mt-3"
            tabIndex={0}
            role="region"
            aria-label="Installation diagnostics"
          >
            <table className="w-full text-left text-xs divide-y divide-border" data-testid="installation-diagnostics">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="p-2.5 font-medium text-foreground">
                    Check
                  </th>
                  <th scope="col" className="p-2.5 font-medium text-foreground">
                    Status
                  </th>
                  <th scope="col" className="p-2.5 font-medium text-foreground">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {diagnostics.checks.map((c) => (
                  <tr key={c.name} className="hover:bg-muted/30">
                    <th scope="row" className="p-2.5 font-medium text-foreground">
                      {c.name}
                    </th>
                    <td className="p-2.5">
                      <Badge variant={c.ok ? 'teal' : 'destructive'}>{c.ok ? 'PASS' : 'FAIL'}</Badge>
                    </td>
                    <td className="p-2.5 text-muted-foreground">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2 py-4">
        <h3 className="text-sm font-semibold text-foreground">Delete career data</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Permanently delete your profile, jobs, applications, documents, settings, and logs from this computer.
        </p>
        {deleteStatus ? (
          <p
            role="status"
            className="p-3 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200 text-xs"
            data-testid="delete-status"
          >
            {deleteStatus}
          </p>
        ) : confirming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            data-testid="delete-confirmation-form"
            className="space-y-3 pt-2"
          >
            <p className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs">
              This action cannot be undone. To permanently erase your data, type <strong>delete my career data</strong>{' '}
              below.
            </p>
            <div className="space-y-1">
              <label htmlFor="delete-confirm-input" className="block text-xs font-medium text-foreground">
                Type: delete my career data
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="delete my career data"
                autoComplete="off"
                data-testid="delete-confirm-input"
              />
            </div>
            {deleteError && (
              <p
                role="alert"
                className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs"
              >
                {deleteError}
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={confirmText !== 'delete my career data'}
                data-testid="confirm-delete-button"
              >
                Permanently delete all data
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(true)}
              data-testid="start-delete-button"
            >
              Delete career data…
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
