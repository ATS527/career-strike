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
    <section className="settings-group" aria-labelledby="evidence-title">
      <h2 id="evidence-title">Projects and evidence</h2>
      <p className="help">
        Add only work, achievements, and links you can stand behind. Tailored documents use confirmed evidence, never
        inferred claims.
      </p>
      {evidence.length > 0 && (
        <ul className="fact-list">
          {evidence.map((item) => (
            <li key={item.id}>
              <span>{describeEvidence(item)}</span>
              {!item.confirmed && (
                <Badge variant="secondary" className="ml-2">
                  Suggested — not used until you confirm
                </Badge>
              )}
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
                  Confirm<span className="visually-hidden"> evidence</span>
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
                <span className="visually-hidden"> evidence</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="fact-form" onSubmit={(event) => void submit(event)}>
        <div className="record__part">
          <label htmlFor="evidence-kind">Type</label>
          <select
            id="evidence-kind"
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
          <div className="record__part">
            <label htmlFor="evidence-name">{kind === 'project' ? 'Project name' : 'Label'}</label>
            <input id="evidence-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        )}
        {(kind === 'project' || kind === 'achievement' || kind === 'employment_detail') && (
          <div className="record__part">
            <label htmlFor="evidence-detail">{kind === 'achievement' ? 'Verified achievement' : 'Description'}</label>
            <textarea
              id="evidence-detail"
              rows={3}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
        )}
        {kind === 'project' && (
          <div className="record__part">
            <label htmlFor="evidence-skills">Skills used</label>
            <input
              id="evidence-skills"
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="TypeScript, Kubernetes"
            />
          </div>
        )}
        {(kind === 'project' || kind === 'portfolio') && (
          <div className="record__part">
            <label htmlFor="evidence-url">Link {kind === 'project' ? '(optional)' : ''}</label>
            <input
              id="evidence-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
        )}
        {(kind === 'achievement' || kind === 'employment_detail') && (
          <div className="record__part">
            <label htmlFor="evidence-role">Related role {kind === 'achievement' ? '(optional)' : ''}</label>
            <select id="evidence-role" value={roleFactId} onChange={(event) => setRoleFactId(event.target.value)}>
              <option value="">—</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {String(role.value.title)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="fact-form__submit">
          <Button type="submit" size="sm">
            Add confirmed evidence
          </Button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
