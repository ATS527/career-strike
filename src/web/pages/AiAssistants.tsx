import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ago } from '../format';

interface Client {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastSeenAt: string | null;
}

const NAMES: Record<string, string> = { codex: 'Codex', 'claude-code': 'Claude Code', opencode: 'OpenCode', test: 'Test client' };
const GRANTABLE = ['personal:read', 'sensitive:read'] as const;

/** Connected AI assistants and the private access each has been granted. */
export function AiAssistants() {
  const [data, setData] = useState<{ clients: Client[]; connected: string[]; scopes: Record<string, string> } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const load = useCallback(async () => {
    setData(await api<{ clients: Client[]; connected: string[]; scopes: Record<string, string> }>('/api/mcp-clients').catch(() => null));
  }, []);
  useEffect(() => void load(), [load]);

  const toggle = async (c: Client, scope: string, on: boolean): Promise<void> => {
    const scopes = on ? [...c.scopes, scope] : c.scopes.filter((s) => s !== scope);
    // Show the change at once; the server's answer then replaces it (or restores the old value).
    setData((d) => (d ? { ...d, clients: d.clients.map((x) => (x.id === c.id ? { ...x, scopes } : x)) } : d));
    try {
      const res = await api<{ client: Client }>(`/api/mcp-clients/${c.id}/scopes`, { method: 'PUT', body: { scopes } });
      setData((d) => (d ? { ...d, clients: d.clients.map((x) => (x.id === c.id ? res.client : x)) } : d));
      setStatus(`${NAMES[c.name] ?? c.name}: ${on ? 'allowed' : 'no longer allowed'} to ${data!.scopes[scope]!.toLowerCase()}.`);
    } catch {
      setStatus('Could not change access. Nothing was changed.');
      void load();
    }
  };

  const revoke = async (c: Client): Promise<void> => {
    if (!window.confirm(`Disconnect ${NAMES[c.name] ?? c.name}? It will lose all access immediately.`)) return;
    await api(`/api/mcp-clients/${c.id}/revoke`, { method: 'POST' }).catch(() => setStatus('Could not disconnect.'));
    setStatus(`${NAMES[c.name] ?? c.name} disconnected. To remove it from the assistant’s settings too, run: career-strike disconnect ${c.name}`);
    void load();
  };

  return (
    <section className="settings-group" aria-labelledby="ai-title" id="ai-assistants">
      <h2 id="ai-title">AI assistants</h2>
      <p className="help">
        Assistants connected over MCP can always search and read public postings, add jobs and boards, and shortlist. Anything about you needs your
        permission below. No assistant can approve or submit an application.
      </p>
      {data && data.clients.length === 0 && (
        <p className="empty">
          None connected. In a terminal run <code>career-strike connect codex</code>, <code>claude-code</code> or <code>opencode</code>.
        </p>
      )}
      {data?.clients.map((c) => (
        <div key={c.id} className="field" data-client={c.name}>
          <h3>
            {NAMES[c.name] ?? c.name}{' '}
            <span className="muted">· {data.connected.includes(c.id) ? `active ${ago(c.lastSeenAt)}` : c.lastSeenAt ? `last active ${ago(c.lastSeenAt)}` : 'not used yet'}</span>
          </h3>
          <fieldset>
            <legend className="visually-hidden">Access for {NAMES[c.name] ?? c.name}</legend>
            {GRANTABLE.map((scope) => (
              <label key={scope} className="choice">
                <input type="checkbox" checked={c.scopes.includes(scope)} onChange={(e) => void toggle(c, scope, e.target.checked)} />
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
