import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, type FactKind, type ProfileFact, type StoredDocument, type ValidationIssue } from '../api';
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
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setFacts((await api<{ facts: ProfileFact[] }>('/api/profile')).facts);
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
      {facts && <SuggestSkills onChange={() => void load()} />}
      {facts &&
        SECTIONS.map((section) => (
          <FactSection key={section.kind} section={section} facts={facts.filter((f) => f.kind === section.kind)} onChange={() => void load()} />
        ))}
      {facts && <Documents />}
    </>
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
