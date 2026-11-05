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
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs"
      aria-labelledby={headingId}
      data-fact-kind={section.kind}
    >
      <h2 id={headingId} className="text-lg font-semibold tracking-tight text-foreground mb-1">
        {section.title}
      </h2>
      {section.intro && <p className="text-sm text-muted-foreground mb-4">{section.intro}</p>}
      {facts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">None added yet.</p>
      ) : (
        <>
          {facts.filter((f) => !f.approved).length > 1 && (
            <div className="mb-3">
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
          <ul className="divide-y divide-border/60 text-sm mb-4">
            {facts.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{section.describe(f.value)}</span>
                  {!f.approved && <Badge variant="secondary">Suggested — not used until you approve</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {!f.approved && (
                    <Button type="button" size="sm" onClick={() => void approve(f)}>
                      Approve<span className="sr-only"> {section.describe(f.value)}</span>
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => void remove(f)}>
                    {f.approved ? 'Remove' : 'Discard'}
                    <span className="sr-only"> {section.describe(f.value)}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3"
        onSubmit={(e) => void submit(e)}
        noValidate
        aria-label={`Add to ${section.title.toLowerCase()}`}
      >
        {section.fields.map((f) => {
          const id = `${section.kind}-${f.name}`;
          return (
            <div key={f.name} className="space-y-1">
              <label htmlFor={id} className="block text-xs font-medium text-foreground">
                {f.label}
                {!f.required && <span className="text-muted-foreground font-normal"> (optional)</span>}
              </label>
              {f.type === 'select' ? (
                <select
                  id={id}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  className={`block text-xs mt-1 ${errors[f.name] ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                >
                  {errors[f.name] ?? f.hint}
                </span>
              )}
            </div>
          );
        })}
        <div className="pt-2 flex justify-end">
          <Button type="submit" size="sm">
            Add
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
