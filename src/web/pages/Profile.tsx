import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, type FactKind, type ProfileFact, type ValidationIssue } from '../api';
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
      {facts &&
        SECTIONS.map((section) => (
          <FactSection key={section.kind} section={section} facts={facts.filter((f) => f.kind === section.kind)} onChange={() => void load()} />
        ))}
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
              {!f.approved && <span className="badge">Not approved — not used</span>}
              <button type="button" className="quiet" onClick={() => void remove(f)}>
                Remove<span className="visually-hidden"> {section.describe(f.value)}</span>
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
