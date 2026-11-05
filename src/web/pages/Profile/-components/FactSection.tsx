import { type FormEvent, useState } from 'react';
import { ApiError, api, type ProfileFact, type ValidationIssue } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import type { SECTIONS } from '../-helpers/profileHelpers';

export function FactSection({
  section,
  facts,
  onChange,
}: {
  section: (typeof SECTIONS)[number];
  facts: ProfileFact[];
  onChange: () => void;
}) {
  const empty = Object.fromEntries(
    section.fields.map((f) => [f.name, f.options && f.required ? f.options[0]![0] : '']),
  );
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await api('/api/profile/facts/approve-all', { method: 'POST', body: { kind: section.kind } });
                  setStatus(`Approved all suggested ${section.title.toLowerCase()}.`);
                  onChange();
                }}
              >
                Approve all {facts.filter((f) => !f.approved).length} suggested {section.title.toLowerCase()}
              </Button>
            </div>
          )}
          <ul className="fact-list">
            {facts.map((f) => (
              <li key={f.id}>
                <span>{section.describe(f.value)}</span>
                {!f.approved && (
                  <Badge variant="secondary" className="ml-2">
                    Suggested — not used until you approve
                  </Badge>
                )}
                {!f.approved && (
                  <Button type="button" size="sm" onClick={() => void approve(f)}>
                    Approve<span className="visually-hidden"> {section.describe(f.value)}</span>
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => void remove(f)}>
                  {f.approved ? 'Remove' : 'Discard'}
                  <span className="visually-hidden"> {section.describe(f.value)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        className="fact-form"
        onSubmit={(e) => void submit(e)}
        noValidate
        aria-label={`Add to ${section.title.toLowerCase()}`}
      >
        {section.fields.map((f) => {
          const id = `${section.kind}-${f.name}`;
          return (
            <div key={f.name} className="record__part">
              <label htmlFor={id}>
                {f.label}
                {!f.required && <span className="muted"> (optional)</span>}
              </label>
              {f.type === 'select' ? (
                <select
                  id={id}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                >
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
                <span
                  id={`${id}-note`}
                  className={errors[f.name] ? 'save-status--error field-note' : 'muted field-note'}
                >
                  {errors[f.name] ?? f.hint}
                </span>
              )}
            </div>
          );
        })}
        <div className="fact-form__submit">
          <Button type="submit" size="sm">
            Add
          </Button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
