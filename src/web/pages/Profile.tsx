import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, type FactKind, type LinkedInImportResult, type ProfileEvidence, type ProfileFact, type StoredDocument, type ValidationIssue } from '../api';
import { formatDate } from '../format';
import { uploadDocument } from './ApplicationPage';
import { ErrorPanel, Loading } from './states';

type FieldSpec = { name: string; label: string; type: 'text' | 'number' | 'select'; required?: boolean; options?: [string, string][]; hint?: string };

const SECTIONS: { kind: FactKind; title: string; intro: string; fields: FieldSpec[]; describe: (v: Record<string, unknown>) => string }[] = [
  {
    kind: 'skill',
    title: 'Skills',
    intro: 'Skills you can demonstrate. Common names like “k8s” are matched as “Kubernetes”.',
    fields: [
      { name: 'name', label: 'Skill', type: 'text', required: true },
      { name: 'years', label: 'Years using it', type: 'number' },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        options: [
          ['', '—'],
          ['familiar', 'Familiar'],
          ['proficient', 'Proficient'],
          ['expert', 'Expert'],
        ],
      },
    ],
    describe: (v) => [v.name, v.years != null ? `${String(v.years)} yrs` : null, v.level].filter(Boolean).join(' · '),
  },
  {
    kind: 'role',
    title: 'Experience',
    intro: 'Roles you have held. Years of experience are counted from these, with overlapping roles counted once.',
    fields: [
      { name: 'title', label: 'Job title', type: 'text', required: true },
      { name: 'employer', label: 'Employer', type: 'text' },
      { name: 'startYear', label: 'Start year', type: 'number', required: true },
      { name: 'endYear', label: 'End year', type: 'number', hint: 'Leave empty if current' },
    ],
    describe: (v) => `${String(v.title)}${v.employer ? ` at ${String(v.employer)}` : ''} · ${String(v.startYear)}–${v.endYear ?? 'now'}`,
  },
  {
    kind: 'education',
    title: 'Education',
    intro: '',
    fields: [
      { name: 'qualification', label: 'Qualification', type: 'text', required: true },
      { name: 'institution', label: 'Institution', type: 'text' },
      { name: 'year', label: 'Year', type: 'number' },
    ],
    describe: (v) => [v.qualification, v.institution, v.year].filter(Boolean).join(' · '),
  },
  {
    kind: 'certification',
    title: 'Certifications',
    intro: '',
    fields: [
      { name: 'name', label: 'Certification', type: 'text', required: true },
      { name: 'issuer', label: 'Issuer', type: 'text' },
      { name: 'year', label: 'Year', type: 'number' },
    ],
    describe: (v) => [v.name, v.issuer, v.year].filter(Boolean).join(' · '),
  },
  {
    kind: 'language',
    title: 'Languages',
    intro: '',
    fields: [
      { name: 'name', label: 'Language', type: 'text', required: true },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        required: true,
        options: [
          ['professional', 'Professional'],
          ['native', 'Native'],
          ['basic', 'Basic'],
        ],
      },
    ],
    describe: (v) => `${String(v.name)} · ${String(v.level)}`,
  },
];

export function Profile() {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [evidence, setEvidence] = useState<ProfileEvidence[] | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profile, settingsRes] = await Promise.all([
        api<{ facts: ProfileFact[]; evidence: ProfileEvidence[] }>('/api/profile'),
        api<{ settings: Record<string, unknown> }>('/api/settings').catch(() => null),
      ]);
      setFacts(profile.facts);
      setEvidence(profile.evidence);
      if (settingsRes?.settings) {
        setLinkedinUrl((settingsRes.settings['candidate.linkedinUrl'] as string | null) ?? null);
      }
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Profile</p>
        <h1>What you bring</h1>
        <p className="lede">
          Career Strike compares postings with these facts. They are stored only on this computer and are never sent anywhere
          without your explicit approval.
        </p>
      </div>
      {error && <ErrorPanel message="Your profile could not be loaded." onRetry={() => void load()} />}
      {!facts && !error && <Loading label="Loading your profile" />}
      {facts && <LinkedInSection currentUrl={linkedinUrl} onChange={() => void load()} />}
      {facts && <LinkedInImportSection onChange={() => void load()} />}
      {facts && <SuggestSkills onChange={() => void load()} />}
      {facts &&
        SECTIONS.map((section) => (
          <FactSection key={section.kind} section={section} facts={facts.filter((f) => f.kind === section.kind)} onChange={() => void load()} />
        ))}
      {facts && <Documents />}
      {facts && evidence && <EvidenceSection evidence={evidence} roles={facts.filter((f) => f.kind === 'role')} onChange={() => void load()} />}
    </>
  );
}

function LinkedInSection({ currentUrl, onChange }: { currentUrl: string | null; onChange: () => void }) {
  const [url, setUrl] = useState(currentUrl ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setUrl(currentUrl ?? '');
  }, [currentUrl]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const val = url.trim();
    try {
      const res = await api<{ key: string; value: string | null }>('/api/settings/candidate.linkedinUrl', {
        method: 'PUT',
        body: { value: val || null },
      });
      setUrl(res.value ?? '');
      setStatus(res.value ? 'Saved your LinkedIn profile address.' : 'Cleared your LinkedIn profile address.');
      setIsEditing(false);
      onChange();
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      setStatus(issues[0]?.message ?? 'Enter a valid LinkedIn profile address (e.g. linkedin.com/in/your-name).');
    }
  };

  return (
    <section className="settings-group" aria-labelledby="linkedin-profile-title" id="linkedin-profile">
      <h2 id="linkedin-profile-title">LinkedIn Profile</h2>
      <p className="help">
        Your member profile address (e.g. <code>https://www.linkedin.com/in/your-name</code>). Used to pre-fill LinkedIn questions in job applications, and only shared with AI assistants when you approve a personal-info request.
      </p>
      {currentUrl && !isEditing ? (
        <div className="fact-list">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--color-surface, #f9f9f9)', borderRadius: '6px' }}>
            <span>
              <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                {currentUrl}
              </a>
            </span>
            <span style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="quiet" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                className="quiet"
                onClick={async () => {
                  await api('/api/settings/candidate.linkedinUrl', { method: 'PUT', body: { value: null } });
                  setUrl('');
                  setStatus('Cleared your LinkedIn profile address.');
                  onChange();
                }}
              >
                Clear
              </button>
            </span>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="fact-form">
          <div className="record__part">
            <label htmlFor="linkedin-url-input">LinkedIn profile address</label>
            <input
              id="linkedin-url-input"
              type="text"
              placeholder="https://www.linkedin.com/in/your-name"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="fact-form__submit" style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit">Save</button>
            {isEditing && (
              <button type="button" className="quiet" onClick={() => { setIsEditing(false); setUrl(currentUrl ?? ''); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function LinkedInImportSection({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    setStatus('Reading export file...');
    try {
      let body: unknown;
      if (file.name.endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        body = { zipBase64: btoa(binary) };
      } else {
        const text = await file.text();
        body = { csvText: text, filename: file.name };
      }
      const res = await api<{ ok: boolean; result: LinkedInImportResult }>('/api/profile/import/linkedin', {
        method: 'POST',
        body,
      });
      const { imported, total, skipped } = res.result;
      if (total === 0) {
        setStatus(skipped > 0 ? `All items in ${file.name} were already in your profile.` : `No profile items found in ${file.name}.`);
      } else {
        const parts = [
          imported.roles ? `${imported.roles} role${imported.roles > 1 ? 's' : ''}` : null,
          imported.skills ? `${imported.skills} skill${imported.skills > 1 ? 's' : ''}` : null,
          imported.education ? `${imported.education} education` : null,
          imported.certifications ? `${imported.certifications} cert${imported.certifications > 1 ? 's' : ''}` : null,
          imported.languages ? `${imported.languages} language${imported.languages > 1 ? 's' : ''}` : null,
          imported.projects ? `${imported.projects} project${imported.projects > 1 ? 's' : ''}` : null,
        ].filter(Boolean);
        setStatus(`Imported ${parts.join(', ')} for your review below. Nothing is used until you approve it.`);
      }
      onChange();
    } catch (err) {
      setStatus(err instanceof ApiError ? ((err.body as { message?: string } | null)?.message ?? 'Import failed.') : 'Could not import the file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="settings-group" aria-labelledby="linkedin-import-title" id="linkedin-import">
      <h2 id="linkedin-import-title">Import from LinkedIn export</h2>
      <p className="help">
        Upload your LinkedIn data export archive (.zip) or individual CSV file (e.g. <code>Positions.csv</code>, <code>Skills.csv</code>, <code>Education.csv</code>, <code>Projects.csv</code>). Career Strike extracts facts locally on this computer; each item is suggested for your review below and is never used until you approve it.
      </p>
      <div className="fact-form">
        <div className="record__part">
          <label htmlFor="linkedin-export-file">LinkedIn export file (.zip or .csv)</label>
          <input
            id="linkedin-export-file"
            type="file"
            accept=".zip,.csv,application/zip,text/csv"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleFile(file);
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function EvidenceSection({ evidence, roles, onChange }: { evidence: ProfileEvidence[]; roles: ProfileFact[]; onChange: () => void }) {
  const [kind, setKind] = useState<ProfileEvidence['kind']>('project');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [skills, setSkills] = useState('');
  const [url, setUrl] = useState('');
  const [roleFactId, setRoleFactId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const value = kind === 'project'
      ? { name, summary: detail, skills: skills.split(',').map((s) => s.trim()).filter(Boolean), url: url || null }
      : kind === 'achievement'
        ? { text: detail, roleFactId: roleFactId || null }
        : kind === 'portfolio'
          ? { label: name, url }
          : { roleFactId, summary: detail };
    try {
      await api('/api/profile/evidence', { method: 'POST', body: { kind, value } });
      setName(''); setDetail(''); setSkills(''); setUrl(''); setRoleFactId('');
      setStatus('Saved as confirmed evidence.');
      onChange();
    } catch (err) {
      const message = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues?.[0]?.message ?? 'Check the fields and try again.') : 'Could not save evidence.';
      setStatus(message);
    }
  };
  const describe = (item: ProfileEvidence): string => {
    if (item.kind === 'project') return `${String(item.value.name)} — ${String(item.value.summary)}`;
    if (item.kind === 'achievement') return String(item.value.text);
    if (item.kind === 'portfolio') return `${String(item.value.label)} — ${String(item.value.url)}`;
    return String(item.value.summary);
  };
  return (
    <section className="settings-group" aria-labelledby="evidence-title">
      <h2 id="evidence-title">Projects and evidence</h2>
      <p className="help">Add only work, achievements, and links you can stand behind. Tailored documents use confirmed evidence, never inferred claims.</p>
      {evidence.length > 0 && (
        <ul className="fact-list">
          {evidence.map((item) => (
            <li key={item.id}>
              <span>{describe(item)}</span>
              {!item.confirmed && <span className="badge">Suggested — not used until you confirm</span>}
              {!item.confirmed && (
                <button
                  type="button"
                  onClick={async () => {
                    await api(`/api/profile/evidence/${item.id}/confirm`, { method: 'POST' });
                    setStatus(`Confirmed ${describe(item)}.`);
                    onChange();
                  }}
                >
                  Confirm<span className="visually-hidden"> evidence</span>
                </button>
              )}
              <button
                type="button"
                className="quiet"
                onClick={async () => {
                  await api(`/api/profile/evidence/${item.id}`, { method: 'DELETE' });
                  setStatus(`Removed ${describe(item)}.`);
                  onChange();
                }}
              >
                {item.confirmed ? 'Remove' : 'Discard'}
                <span className="visually-hidden"> evidence</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="fact-form" onSubmit={(event) => void submit(event)}>
        <div className="record__part"><label htmlFor="evidence-kind">Type</label><select id="evidence-kind" value={kind} onChange={(event) => setKind(event.target.value as ProfileEvidence['kind'])}><option value="project">Project</option><option value="achievement">Achievement</option><option value="portfolio">Portfolio or GitHub link</option><option value="employment_detail">Employment detail</option></select></div>
        {(kind === 'project' || kind === 'portfolio') && <div className="record__part"><label htmlFor="evidence-name">{kind === 'project' ? 'Project name' : 'Label'}</label><input id="evidence-name" value={name} onChange={(event) => setName(event.target.value)} /></div>}
        {(kind === 'project' || kind === 'achievement' || kind === 'employment_detail') && <div className="record__part"><label htmlFor="evidence-detail">{kind === 'achievement' ? 'Verified achievement' : 'Description'}</label><textarea id="evidence-detail" rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} /></div>}
        {kind === 'project' && <div className="record__part"><label htmlFor="evidence-skills">Skills used</label><input id="evidence-skills" value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="TypeScript, Kubernetes" /></div>}
        {(kind === 'project' || kind === 'portfolio') && <div className="record__part"><label htmlFor="evidence-url">Link {kind === 'project' ? '(optional)' : ''}</label><input id="evidence-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></div>}
        {(kind === 'achievement' || kind === 'employment_detail') && <div className="record__part"><label htmlFor="evidence-role">Related role {kind === 'achievement' ? '(optional)' : ''}</label><select id="evidence-role" value={roleFactId} onChange={(event) => setRoleFactId(event.target.value)}><option value="">—</option>{roles.map((role) => <option key={role.id} value={role.id}>{String(role.value.title)}</option>)}</select></div>}
        <div className="fact-form__submit"><button type="submit">Add confirmed evidence</button></div>
      </form>
      <p role="status" aria-live="polite" className="save-status">{status}</p>
    </section>
  );
}

function FactSection({ section, facts, onChange }: { section: (typeof SECTIONS)[number]; facts: ProfileFact[]; onChange: () => void }) {
  const empty = Object.fromEntries(section.fields.map((f) => [f.name, f.options && f.required ? f.options[0]![0] : '']));
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErrors({});
    const value = Object.fromEntries(
      section.fields.map((f) => {
        const raw = (form[f.name] ?? '').trim();
        if (raw === '') return [f.name, f.required ? '' : null];
        return [f.name, f.type === 'number' ? Number(raw) : raw];
      }),
    );
    try {
      await api('/api/profile/facts', { method: 'POST', body: { kind: section.kind, value } });
      setForm(empty);
      setStatus(`Added ${section.describe(value)}.`);
      onChange();
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      setErrors(Object.fromEntries(issues.map((i) => [String(i.path.at(-1) ?? 'form'), i.message])));
      setStatus(issues.length ? 'Check the highlighted fields.' : 'Could not save. Check that the service is running.');
    }
  };

  const approve = async (fact: ProfileFact): Promise<void> => {
    try {
      await api(`/api/profile/facts/${fact.id}/approve`, { method: 'POST' });
      setStatus(`Approved ${section.describe(fact.value)}.`);
      onChange();
    } catch {
      setStatus('Could not approve. Try again.');
    }
  };

  const remove = async (fact: ProfileFact): Promise<void> => {
    try {
      await api(`/api/profile/facts/${fact.id}`, { method: 'DELETE' });
      setStatus(`Removed ${section.describe(fact.value)}.`);
      onChange();
    } catch {
      setStatus('Could not remove. Try again.');
    }
  };

  const headingId = `profile-${section.kind}`;
  return (
    <section className="settings-group" aria-labelledby={headingId} data-fact-kind={section.kind}>
      <h2 id={headingId}>{section.title}</h2>
      {section.intro && <p className="help">{section.intro}</p>}
      {facts.length === 0 ? (
        <p className="empty">None added yet.</p>
      ) : (
        <>
          {facts.filter((f) => !f.approved).length > 1 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="quiet"
                onClick={async () => {
                  await api('/api/profile/facts/approve-all', { method: 'POST', body: { kind: section.kind } });
                  setStatus(`Approved all suggested ${section.title.toLowerCase()}.`);
                  onChange();
                }}
              >
                Approve all {facts.filter((f) => !f.approved).length} suggested {section.title.toLowerCase()}
              </button>
            </div>
          )}
          <ul className="fact-list">
            {facts.map((f) => (
              <li key={f.id}>
                <span>{section.describe(f.value)}</span>
                {!f.approved && <span className="badge">Suggested — not used until you approve</span>}
                {!f.approved && (
                  <button type="button" onClick={() => void approve(f)}>
                    Approve<span className="visually-hidden"> {section.describe(f.value)}</span>
                  </button>
                )}
                <button type="button" className="quiet" onClick={() => void remove(f)}>
                  {f.approved ? 'Remove' : 'Discard'}
                  <span className="visually-hidden"> {section.describe(f.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="fact-form" onSubmit={(e) => void submit(e)} noValidate aria-label={`Add to ${section.title.toLowerCase()}`}>
        {section.fields.map((f) => {
          const id = `${section.kind}-${f.name}`;
          return (
            <div key={f.name} className="record__part">
              <label htmlFor={id}>
                {f.label}
                {!f.required && <span className="muted"> (optional)</span>}
              </label>
              {f.type === 'select' ? (
                <select id={id} value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  {f.options!.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={f.type}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  aria-invalid={errors[f.name] ? true : undefined}
                  aria-describedby={errors[f.name] || f.hint ? `${id}-note` : undefined}
                  autoComplete="off"
                />
              )}
              {(errors[f.name] || f.hint) && (
                <span id={`${id}-note`} className={errors[f.name] ? 'save-status--error field-note' : 'muted field-note'}>
                  {errors[f.name] ?? f.hint}
                </span>
              )}
            </div>
          );
        })}
        <div className="fact-form__submit">
          <button type="submit">Add</button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

/** Find known skills in pasted résumé text. The text itself is not kept. */
function SuggestSkills({ onChange }: { onChange: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!text.trim()) {
      setStatus('Paste your résumé text first.');
      return;
    }
    try {
      const { suggested } = await api<{ suggested: ProfileFact[] }>('/api/profile/suggestions', { method: 'POST', body: { text } });
      setText('');
      setStatus(
        suggested.length === 0
          ? 'No new skills found. Add any that are missing by hand below.'
          : `${suggested.length} skill${suggested.length === 1 ? '' : 's'} suggested below. Approve the ones that are true; nothing is used until you do.`,
      );
      onChange();
    } catch {
      setStatus('Could not read the text. Check that the service is running.');
    }
  };
  return (
    <section className="settings-group" aria-labelledby="suggest-title">
      <h2 id="suggest-title">Suggest skills from your résumé</h2>
      <p className="help">
        Paste the text of your résumé. Career Strike looks for skills it recognises, on this computer, and lists them for you to
        approve or discard. The pasted text is not saved.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="record__part">
          <label htmlFor="resume-text">Résumé text</label>
          <textarea id="resume-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field__actions">
          <button type="submit">Suggest skills</button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function Documents() {
  const [docs, setDocs] = useState<StoredDocument[] | null>(null);
  const [kind, setKind] = useState<'resume' | 'cover_letter' | 'other'>('resume');
  const [status, setStatus] = useState<string | null>(null);
  const load = useCallback(async () => {
    setDocs((await api<{ documents: StoredDocument[] }>('/api/documents').catch(() => ({ documents: [] }))).documents);
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <section className="settings-group" aria-labelledby="documents-title" id="documents">
      <h2 id="documents-title">Documents</h2>
      <p className="help">Kept in your private vault on this computer. A file is attached to an application only when you approve that application.</p>
      {docs && docs.length === 0 && <p className="empty">No documents yet.</p>}
      {docs && docs.length > 0 && (
        <ul className="fact-list" data-testid="documents">
          {docs.map((d) => (
            <li key={d.id}>
              <span>
                {d.filename} <span className="muted">· {d.kind.replace('_', ' ')} · {Math.ceil(d.sizeBytes / 1024)} KB · added {formatDate(d.createdAt)}</span>
              </span>
              <span className="doc-actions">
                <a href={`/api/documents/${d.id}/content`} download>
                  Download<span className="visually-hidden"> {d.filename}</span>
                </a>
                <button
                  type="button"
                  className="quiet"
                  onClick={async () => {
                    await api(`/api/documents/${d.id}`, { method: 'DELETE' }).catch(() => setStatus('Could not remove.'));
                    void load();
                  }}
                >
                  Remove<span className="visually-hidden"> {d.filename}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="fact-form">
        <div className="record__part">
          <label htmlFor="doc-kind">Type</label>
          <select id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="resume">Résumé</option>
            <option value="cover_letter">Cover letter</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="record__part">
          <label htmlFor="doc-file">File (PDF, .docx or .txt, up to 10 MB)</label>
          <input
            id="doc-file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setStatus(await uploadDocument(file, kind));
              e.target.value = '';
              void load();
            }}
          />
        </div>
      </div>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
