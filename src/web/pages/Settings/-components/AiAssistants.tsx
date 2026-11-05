import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../../api';
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
    <section className="settings-group" aria-labelledby="ai-title" id="ai-assistants">
      <h2 id="ai-title">AI assistants</h2>
      <p className="help">
        Assistants connected over MCP can always search and read public postings, add jobs and boards, and shortlist.
        Anything about you needs your permission below. No assistant can approve or submit an application.
      </p>
      {data && data.clients.length === 0 && (
        <p className="empty">
          None connected. In a terminal run <code>career-strike connect codex</code>, <code>claude-code</code> or{' '}
          <code>opencode</code>.
        </p>
      )}
      {data?.clients.map((c) => (
        <div key={c.id} className="field" data-client={c.name}>
          <h3>
            {NAMES[c.name] ?? c.name}{' '}
            <span className="muted">
              ·{' '}
              {data.connected.includes(c.id)
                ? `active ${ago(c.lastSeenAt)}`
                : c.lastSeenAt
                  ? `last active ${ago(c.lastSeenAt)}`
                  : 'not used yet'}
            </span>
          </h3>
          <fieldset>
            <legend className="visually-hidden">Access for {NAMES[c.name] ?? c.name}</legend>
            {GRANTABLE.map((scope) => (
              <label key={scope} className="choice">
                <input
                  type="checkbox"
                  checked={c.scopes.includes(scope)}
                  onChange={(e) => void toggle(c, scope, e.target.checked)}
                />
                <span>Allow it to {data.scopes[scope]!.toLowerCase()}</span>
              </label>
            ))}
          </fieldset>
          <div className="field__actions">
            <button type="button" className="quiet" onClick={() => void revoke(c)}>
              Disconnect {NAMES[c.name] ?? c.name}
            </button>
          </div>
        </div>
      ))}
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
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
    <section className="settings-group" aria-labelledby="ai-requests-title" id="ai-requests">
      <h2 id="ai-requests-title">Requests to see your information</h2>
      <p className="help">
        An assistant can ask for parts of your profile for a stated purpose. You see the exact values first, can share
        less, and each approval can be collected once. Contact details and documents are never shared with assistants.
      </p>
      {pending.length === 0 && <p className="empty">No requests waiting.</p>}
      <ul className="topic-list" data-testid="pending-requests">
        {pending.map((d) => (
          <li key={d.id} className="topic">
            <h3>
              {name(d.provider)} asks to see: {d.requested.map((f) => labels[f] ?? f).join('; ')}
            </h3>
            <p>
              <span className="muted">Purpose, in the assistant’s words: </span>
              <q>{d.purpose}</q>
            </p>
            {preview?.disclosure.id === d.id ? (
              <fieldset className="disclosure-preview">
                <legend>Exactly what {name(d.provider)} would receive</legend>
                {preview.disclosure.requested.map((f) => (
                  <div key={f} className="disclosure-item">
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={chosen.includes(f)}
                        onChange={(e) => setChosen(e.target.checked ? [...chosen, f] : chosen.filter((x) => x !== f))}
                      />
                      <span>Share {(preview.fields[f] ?? f).toLowerCase()}</span>
                    </label>
                    <ul className="disclosures" data-field={f}>
                      {showValue(preview.values[f]).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="field__actions">
                  <button type="button" onClick={() => void approve()} disabled={chosen.length === 0}>
                    Share once with {name(d.provider)}
                  </button>
                  <button type="button" className="quiet" onClick={() => void decline(d)}>
                    Decline
                  </button>
                </div>
              </fieldset>
            ) : (
              <div className="field__actions">
                <button type="button" onClick={() => void review(d)}>
                  Review what would be shared<span className="visually-hidden"> with {name(d.provider)}</span>
                </button>
                <button type="button" className="quiet" onClick={() => void decline(d)}>
                  Decline<span className="visually-hidden"> {name(d.provider)}’s request</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <h3>Record of what was shared</h3>
          <ul className="disclosures" data-testid="disclosure-history">
            {past.map((d) => (
              <li key={d.id}>
                {name(d.provider)} · {STATE_TEXT[d.state]}
                {d.approved ? ` · ${d.approved.map((f) => labels[f] ?? f).join('; ')}` : ''} ·{' '}
                {formatDate(d.decidedAt ?? d.createdAt)} · for “{d.purpose}”
              </li>
            ))}
          </ul>
        </>
      )}
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
