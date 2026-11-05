import { type FormEvent, useState } from 'react';
import { ApiError, api, type ProfileEvidence, type ProfileFact, type ValidationIssue } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

export function EvidenceSection({
  evidence,
  roles,
  onChange,
}: {
  evidence: ProfileEvidence[];
  roles: ProfileFact[];
  onChange: () => void;
}) {
  const [kind, setKind] = useState<ProfileEvidence['kind']>('project');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [skills, setSkills] = useState('');
  const [url, setUrl] = useState('');
  const [roleFactId, setRoleFactId] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const value =
      kind === 'project'
        ? {
            name,
            summary: detail,
            skills: skills
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            url: url || null,
          }
        : kind === 'achievement'
          ? { text: detail, roleFactId: roleFactId || null }
          : kind === 'portfolio'
            ? { label: name, url }
            : { roleFactId, summary: detail };
    try {
      await api('/api/profile/evidence', { method: 'POST', body: { kind, value } });
      setName('');
      setDetail('');
      setSkills('');
      setUrl('');
      setRoleFactId('');
      setStatus('Saved as confirmed evidence.');
      onChange();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues?.[0]?.message ??
            'Check the fields and try again.')
          : 'Could not save evidence.';
      setStatus(message);
    }
  };

  const describeEvidence = (item: ProfileEvidence): string => {
    if (item.kind === 'project') return `${String(item.value.name)} — ${String(item.value.summary)}`;
    if (item.kind === 'achievement') return String(item.value.text);
    if (item.kind === 'portfolio') return `${String(item.value.label)} — ${String(item.value.url)}`;
    return String(item.value.summary);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="evidence-title">
      <h2 id="evidence-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Projects and evidence
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Add only work, achievements, and links you can stand behind. Tailored documents use confirmed evidence, never
        inferred claims.
      </p>
      {evidence.length > 0 && (
        <ul className="divide-y divide-border/60 text-sm mb-4">
          {evidence.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="text-foreground">{describeEvidence(item)}</span>
                {!item.confirmed && <Badge variant="secondary">Suggested — not used until you confirm</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {!item.confirmed && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      await api(`/api/profile/evidence/${item.id}/confirm`, { method: 'POST' });
                      setStatus(`Confirmed ${describeEvidence(item)}.`);
                      onChange();
                    }}
                  >
                    Confirm<span className="sr-only"> evidence</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api(`/api/profile/evidence/${item.id}`, { method: 'DELETE' });
                    setStatus(`Removed ${describeEvidence(item)}.`);
                    onChange();
                  }}
                >
                  {item.confirmed ? 'Remove' : 'Discard'}
                  <span className="sr-only"> evidence</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3"
        onSubmit={(event) => void submit(event)}
      >
        <div className="space-y-1">
          <label htmlFor="evidence-kind" className="block text-xs font-medium text-foreground">
            Type
          </label>
          <select
            id="evidence-kind"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={kind}
            onChange={(event) => setKind(event.target.value as ProfileEvidence['kind'])}
          >
            <option value="project">Project</option>
            <option value="achievement">Achievement</option>
            <option value="portfolio">Portfolio or GitHub link</option>
            <option value="employment_detail">Employment detail</option>
          </select>
        </div>
        {(kind === 'project' || kind === 'portfolio') && (
          <div className="space-y-1">
            <label htmlFor="evidence-name" className="block text-xs font-medium text-foreground">
              {kind === 'project' ? 'Project name' : 'Label'}
            </label>
            <input
              id="evidence-name"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        )}
        {(kind === 'project' || kind === 'achievement' || kind === 'employment_detail') && (
          <div className="space-y-1">
            <label htmlFor="evidence-detail" className="block text-xs font-medium text-foreground">
              {kind === 'achievement' ? 'Verified achievement' : 'Description'}
            </label>
            <textarea
              id="evidence-detail"
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
        )}
        {kind === 'project' && (
          <div className="space-y-1">
            <label htmlFor="evidence-skills" className="block text-xs font-medium text-foreground">
              Skills used
            </label>
            <input
              id="evidence-skills"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="TypeScript, Kubernetes"
            />
          </div>
        )}
        {(kind === 'project' || kind === 'portfolio') && (
          <div className="space-y-1">
            <label htmlFor="evidence-url" className="block text-xs font-medium text-foreground">
              Link {kind === 'project' ? '(optional)' : ''}
            </label>
            <input
              id="evidence-url"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
        )}
        {(kind === 'achievement' || kind === 'employment_detail') && (
          <div className="space-y-1">
            <label htmlFor="evidence-role" className="block text-xs font-medium text-foreground">
              Related role {kind === 'achievement' ? '(optional)' : ''}
            </label>
            <select
              id="evidence-role"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={roleFactId}
              onChange={(event) => setRoleFactId(event.target.value)}
            >
              <option value="">—</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {String(role.value.title)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="pt-2 flex justify-end">
          <Button type="submit" size="sm">
            Add confirmed evidence
          </Button>
        </div>
      </form>
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
}
