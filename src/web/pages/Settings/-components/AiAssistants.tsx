import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../../api';
import { Button } from '../../../components/ui/button';
import { ago, formatDate } from '../../../format';

interface Client {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastSeenAt: string | null;
}

const NAMES: Record<string, string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  test: 'Test client',
};
const GRANTABLE = ['personal:read', 'sensitive:read'] as const;

/** Connected AI assistants and the private access each has been granted. */
export function AiAssistants() {
  const [data, setData] = useState<{ clients: Client[]; connected: string[]; scopes: Record<string, string> } | null>(
    null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const load = useCallback(async () => {
    setData(
      await api<{ clients: Client[]; connected: string[]; scopes: Record<string, string> }>('/api/mcp-clients').catch(
        () => null,
      ),
    );
  }, []);
  useEffect(() => void load(), [load]);

  const toggle = async (c: Client, scope: string, on: boolean): Promise<void> => {
    const scopes = on ? [...c.scopes, scope] : c.scopes.filter((s) => s !== scope);
    // Show the change at once; the server's answer then replaces it (or restores the old value).
    setData((d) => (d ? { ...d, clients: d.clients.map((x) => (x.id === c.id ? { ...x, scopes } : x)) } : d));
    try {
      const res = await api<{ client: Client }>(`/api/mcp-clients/${c.id}/scopes`, { method: 'PUT', body: { scopes } });
      setData((d) => (d ? { ...d, clients: d.clients.map((x) => (x.id === c.id ? res.client : x)) } : d));
      setStatus(
        `${NAMES[c.name] ?? c.name}: ${on ? 'allowed' : 'no longer allowed'} to ${data!.scopes[scope]!.toLowerCase()}.`,
      );
    } catch {
      setStatus('Could not change access. Nothing was changed.');
      void load();
    }
  };

  const revoke = async (c: Client): Promise<void> => {
    if (!window.confirm(`Disconnect ${NAMES[c.name] ?? c.name}? It will lose all access immediately.`)) return;
    await api(`/api/mcp-clients/${c.id}/revoke`, { method: 'POST' }).catch(() => setStatus('Could not disconnect.'));
    setStatus(
      `${NAMES[c.name] ?? c.name} disconnected. To remove it from the assistant’s settings too, run: career-strike disconnect ${c.name}`,
    );
    void load();
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6"
      aria-labelledby="ai-title"
      id="ai-assistants"
    >
      <h2 id="ai-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        AI assistants
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Assistants connected over MCP can always search and read public postings, add jobs and boards, and shortlist.
        Anything about you needs your permission below. No assistant can approve or submit an application.
      </p>
      {data && data.clients.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">
          None connected. In a terminal run <code>career-strike connect codex</code>, <code>claude-code</code> or{' '}
          <code>opencode</code>.
        </p>
      )}
      {data?.clients.map((c) => (
        <div key={c.id} className="space-y-2 py-4 border-b border-border/60 last:border-0" data-client={c.name}>
          <h3 className="text-sm font-semibold text-foreground">
            {NAMES[c.name] ?? c.name}{' '}
            <span className="text-muted-foreground font-normal">
              ·{' '}
              {data.connected.includes(c.id)
                ? `active ${ago(c.lastSeenAt)}`
                : c.lastSeenAt
                  ? `last active ${ago(c.lastSeenAt)}`
                  : 'not used yet'}
            </span>
          </h3>
          <fieldset>
            <legend className="sr-only">Access for {NAMES[c.name] ?? c.name}</legend>
            <div className="flex flex-col gap-2 pt-1">
              {GRANTABLE.map((scope) => (
                <label key={scope} className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-primary rounded"
                    checked={c.scopes.includes(scope)}
                    onChange={(e) => void toggle(c, scope, e.target.checked)}
                  />
                  <span>Allow it to {data.scopes[scope]!.toLowerCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void revoke(c)}>
              Disconnect {NAMES[c.name] ?? c.name}
            </Button>
          </div>
        </div>
      ))}
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
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
interface Preview {
  disclosure: DisclosureItem;
  values: Record<string, unknown>;
  previewHash: string;
  fields: Record<string, string>;
}

const STATE_TEXT: Record<DisclosureItem['state'], string> = {
  PENDING: 'Waiting for you',
  APPROVED: 'Approved — not collected yet',
  DECLINED: 'Declined',
  DELIVERED: 'Shared once',
  EXPIRED: 'Expired — nothing shared',
};

function showValue(v: unknown): string[] {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
    return ['Not set — nothing would be shared'];
  if (Array.isArray(v))
    return v.map((x) =>
      typeof x === 'object' && x
        ? Object.values(x)
            .filter((y) => y !== null && y !== '')
            .join(' · ')
        : String(x),
    );
  if (typeof v === 'object') {
    return Object.entries(v)
      .filter(([, y]) => y !== null && !(Array.isArray(y) && y.length === 0))
      .map(
        ([k, y]) => `${k}: ${Array.isArray(y) ? y.join(', ') : typeof y === 'object' ? JSON.stringify(y) : String(y)}`,
      );
  }
  return [String(v)];
}

export function AiRequests() {
  const [items, setItems] = useState<DisclosureItem[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await api<{ disclosures: DisclosureItem[]; fields: Record<string, string> }>('/api/disclosures').catch(
      () => null,
    );
    setItems(res?.disclosures ?? null);
    setLabels(res?.fields ?? {});
  }, []);
  useEffect(() => void load(), [load]);

  const review = async (d: DisclosureItem): Promise<void> => {
    try {
      const p = await api<Preview>(`/api/disclosures/${d.id}/preview`);
      setPreview(p);
      setChosen(p.disclosure.requested);
    } catch {
      setStatus('Could not load the preview.');
    }
  };
  const name = (provider: string) => NAMES[provider] ?? provider;

  const approve = async (): Promise<void> => {
    if (!preview) return;
    try {
      await api(`/api/disclosures/${preview.disclosure.id}/approve`, {
        method: 'POST',
        body: { fields: chosen, previewHash: preview.previewHash },
      });
      setStatus(`Approved. ${name(preview.disclosure.provider)} can collect this once, within an hour.`);
      setPreview(null);
    } catch (err) {
      setStatus(
        (err instanceof ApiError && (err.body as { message?: string } | null)?.message) ||
          'Could not approve. Nothing was shared.',
      );
    }
    void load();
  };
  const decline = async (d: DisclosureItem): Promise<void> => {
    await api(`/api/disclosures/${d.id}/decline`, { method: 'POST' }).catch(() => undefined);
    setStatus(`Declined. Nothing was shared with ${name(d.provider)}.`);
    setPreview(null);
    void load();
  };

  if (!items) return null;
  const pending = items.filter((d) => d.state === 'PENDING');
  const past = items.filter((d) => d.state !== 'PENDING');
  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6"
      aria-labelledby="ai-requests-title"
      id="ai-requests"
    >
      <h2 id="ai-requests-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Requests to see your information
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        An assistant can ask for parts of your profile for a stated purpose. You see the exact values first, can share
        less, and each approval can be collected once. Contact details and documents are never shared with assistants.
      </p>
      {pending.length === 0 && <p className="text-sm text-muted-foreground italic py-2">No requests waiting.</p>}
      <ul className="space-y-4" data-testid="pending-requests">
        {pending.map((d) => (
          <li key={d.id} className="p-4 rounded-lg border border-border/70 bg-card/60 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {name(d.provider)} asks to see: {d.requested.map((f) => labels[f] ?? f).join('; ')}
            </h3>
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">Purpose, in the assistant’s words: </span>
              <q className="italic">{d.purpose}</q>
            </p>
            {preview?.disclosure.id === d.id ? (
              <fieldset className="p-4 rounded-lg border border-border bg-background/50 space-y-3 mt-3">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Exactly what {name(d.provider)} would receive
                </legend>
                {preview.disclosure.requested.map((f) => (
                  <div key={f} className="space-y-2">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary rounded"
                        checked={chosen.includes(f)}
                        onChange={(e) => setChosen(e.target.checked ? [...chosen, f] : chosen.filter((x) => x !== f))}
                      />
                      <span>Share {(preview.fields[f] ?? f).toLowerCase()}</span>
                    </label>
                    <ul className="divide-y divide-border/60 text-xs text-muted-foreground pl-6" data-field={f}>
                      {showValue(preview.values[f]).map((line) => (
                        <li key={line} className="py-1">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <Button type="button" size="sm" onClick={() => void approve()} disabled={chosen.length === 0}>
                    Share once with {name(d.provider)}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void decline(d)}>
                    Decline
                  </Button>
                </div>
              </fieldset>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <Button type="button" size="sm" onClick={() => void review(d)}>
                  Review what would be shared<span className="sr-only"> with {name(d.provider)}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void decline(d)}>
                  Decline<span className="sr-only"> {name(d.provider)}’s request</span>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Record of what was shared</h3>
          <ul className="divide-y divide-border/60 text-xs text-muted-foreground" data-testid="disclosure-history">
            {past.map((d) => (
              <li key={d.id} className="py-2 first:pt-0 last:pb-0">
                <span className="text-foreground font-medium">{name(d.provider)}</span> · {STATE_TEXT[d.state]}
                {d.approved ? ` · ${d.approved.map((f) => labels[f] ?? f).join('; ')}` : ''} ·{' '}
                {formatDate(d.decidedAt ?? d.createdAt)} · for “{d.purpose}”
              </li>
            ))}
          </ul>
        </div>
      )}
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
}
