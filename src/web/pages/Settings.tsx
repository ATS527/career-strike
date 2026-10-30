import { type FormEvent, useState } from 'react';
import { api, ApiError, type SettingDefinition, type SettingsResponse, type ValidationIssue } from '../api';
import { useHashFocus } from '../router';
import { useResource } from '../useResource';
import { type Draft, type FieldKind, fieldKind, fromDraft, groupOf, sameValue, toDraft } from './settingFields';
import { ErrorPanel, Loading } from './states';

const GROUPS = [
  { id: 'search', title: 'What you are looking for' },
  { id: 'candidate', title: 'About you' },
] as const;

export function Settings() {
  const settings = useResource<SettingsResponse>('/api/settings');
  useHashFocus(settings.state === 'ready');

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Your search, your rules</h1>
        <p className="lede">Each setting is saved on this computer as soon as you press Save.</p>
      </div>
      {settings.state === 'loading' && <Loading label="Loading settings" />}
      {settings.state === 'error' && <ErrorPanel message={settings.message} onRetry={settings.retry} />}
      {settings.state === 'ready' &&
        GROUPS.map((group) => (
          <section key={group.id} className="settings-group" aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`}>{group.title}</h2>
            {settings.data.definitions
              .filter((d) => groupOf(d) === group.id)
              .map((def) => (
                <SettingField key={def.key} def={def} value={settings.data.settings[def.key]} />
              ))}
          </section>
        ))}
    </>
  );
}

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; messages: string[] };

function SettingField({ def, value }: { def: SettingDefinition; value: unknown }) {
  const kind = fieldKind(def.schema);
  const [saved, setSaved] = useState<unknown>(value);
  const [draft, setDraft] = useState<Draft>(() => (kind ? toDraft(kind, value) : ''));
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  if (!kind) {
    return (
      <div className="field" data-setting={def.key} id={def.key}>
        <p className="banner banner--danger">This dashboard cannot edit “{def.label}” yet. Update Career Strike.</p>
      </div>
    );
  }

  const candidate = fromDraft(kind, draft);
  const dirty = !sameValue(candidate, saved);
  const helpId = `${def.key}-help`;
  const statusId = `${def.key}-status`;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSave({ status: 'saving' });
    try {
      const res = await api<{ value: unknown }>(`/api/settings/${encodeURIComponent(def.key)}`, { method: 'PUT', body: { value: candidate } });
      setSaved(res.value);
      setDraft(toDraft(kind, res.value));
      setSave({ status: 'saved' });
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      setSave({
        status: 'error',
        messages: issues.length > 0 ? issues.map(describeIssue) : ['Could not save. Check that the service is running and try again.'],
      });
    }
  };

  return (
    <form className="field" data-setting={def.key} id={def.key} onSubmit={(e) => void submit(e)} noValidate>
      <FieldControl def={def} kind={kind} draft={draft} onChange={(d) => { setDraft(d); setSave({ status: 'idle' }); }} describedBy={`${helpId} ${statusId}`} />
      <p className="help" id={helpId}>
        {def.help}
        {def.classification === 'SENSITIVE' && <span className="badge">Sensitive · stays on this device</span>}
      </p>
      <div className="field__actions">
        <button type="submit" disabled={!dirty || save.status === 'saving'}>
          {save.status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button type="button" className="quiet" onClick={() => { setDraft(toDraft(kind, saved)); setSave({ status: 'idle' }); }}>
            Discard changes
          </button>
        )}
        <span id={statusId} role="status" aria-live="polite" className={`save-status save-status--${save.status}`}>
          {save.status === 'saved' && 'Saved'}
          {save.status === 'error' && save.messages.join(' ')}
        </span>
      </div>
    </form>
  );
}

function describeIssue(issue: ValidationIssue): string {
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}

interface ControlProps {
  def: SettingDefinition;
  kind: FieldKind;
  draft: Draft;
  onChange: (draft: Draft) => void;
  describedBy: string;
}

function FieldControl({ def, kind, draft, onChange, describedBy }: ControlProps) {
  const label = (value: string): string => def.options[value] ?? value;
  const inputId = `${def.key}-input`;

  switch (kind.kind) {
    case 'choice':
      return (
        <fieldset aria-describedby={describedBy}>
          <legend>{def.label}</legend>
          <div className="choices">
            {kind.values.map((v) => (
              <label key={v} className="choice">
                <input type="radio" name={def.key} value={v} checked={draft === v} onChange={() => onChange(v)} />
                <span>{label(v)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    case 'multi-choice': {
      const selected = draft as string[];
      return (
        <fieldset aria-describedby={describedBy}>
          <legend>{def.label}</legend>
          <div className="choices">
            {kind.values.map((v) => (
              <label key={v} className="choice">
                <input
                  type="checkbox"
                  value={v}
                  checked={selected.includes(v)}
                  onChange={(e) => onChange(e.target.checked ? kind.values.filter((x) => x === v || selected.includes(x)) : selected.filter((x) => x !== v))}
                />
                <span>{label(v)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'lines':
      return (
        <>
          <label htmlFor={inputId} className="field__label">
            {def.label}
          </label>
          <textarea id={inputId} rows={4} value={draft as string} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />
        </>
      );
    case 'optional-text':
      return (
        <>
          <label htmlFor={inputId} className="field__label">
            {def.label}
          </label>
          <input
            id={inputId}
            type="text"
            className="input--short"
            value={draft as string}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={describedBy}
            autoComplete="off"
          />
        </>
      );
    case 'optional-record': {
      const record = draft as Record<string, string>;
      const set = (name: string, v: string): void => onChange({ ...record, [name]: v });
      return (
        <fieldset aria-describedby={describedBy}>
          <legend>{def.label}</legend>
          <div className="record">
            {kind.properties.map(([name, schema]) => {
              const id = `${def.key}-${name}`;
              return (
                <div key={name} className="record__part">
                  <label htmlFor={id}>{recordLabel(name)}</label>
                  {schema.enum ? (
                    <select id={id} value={record[name] ?? ''} onChange={(e) => set(name, e.target.value)}>
                      <option value="">—</option>
                      {schema.enum.map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={schema.type === 'integer' ? 'number' : 'text'}
                      inputMode={schema.type === 'integer' ? 'numeric' : undefined}
                      value={record[name] ?? ''}
                      onChange={(e) => set(name, e.target.value)}
                      autoComplete="off"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      );
    }
  }
}

function recordLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase();
}
