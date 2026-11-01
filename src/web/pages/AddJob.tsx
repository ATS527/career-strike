import { type FormEvent, useState } from 'react';
import { api, ApiError, type JobDetail, type ValidationIssue } from '../api';
import { Link, useNavigateTo } from '../router';

const ARRANGEMENTS = [
  ['unknown', 'Not stated'],
  ['remote', 'Remote'],
  ['hybrid', 'Hybrid'],
  ['onsite', 'On-site'],
] as const;

export function AddJob() {
  const navigate = useNavigateTo();
  const [form, setForm] = useState({ employer: '', title: '', url: '', location: '', remotePolicy: 'unknown', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { ...form, url: form.url.trim() || undefined, location: form.location.trim() || undefined };
      const res = await api<{ job: JobDetail }>('/api/jobs', { method: 'POST', body });
      navigate(`/jobs/${res.job.id}`);
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      setErrors(
        issues.length > 0
          ? Object.fromEntries(issues.map((i) => [String(i.path[0] ?? 'form'), i.message]))
          : { form: 'The job could not be saved. Check that the service is running.' },
      );
      setSaving(false);
    }
  };

  const field = (key: 'employer' | 'title' | 'url' | 'location', label: string, opts: { required?: boolean; type?: string; help?: string } = {}) => (
    <div className="field">
      <label htmlFor={`job-${key}`} className="field__label">
        {label}
        {opts.required ? '' : <span className="muted"> (optional)</span>}
      </label>
      <input
        id={`job-${key}`}
        type={opts.type ?? 'text'}
        required={opts.required}
        value={form[key]}
        onChange={set(key)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={`job-${key}-help`}
      />
      <p className="help" id={`job-${key}-help`}>
        {errors[key] ? <span className="save-status--error">{errors[key]}</span> : opts.help}
      </p>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          <Link href="/opportunities">Opportunities</Link> / Add a job
        </p>
        <h1>Add a job you found</h1>
        <p className="lede">Jobs you add are marked unverified: Career Strike will not claim they are open.</p>
      </div>
      <form className="form-narrow" onSubmit={(e) => void submit(e)} noValidate>
        {field('title', 'Job title', { required: true })}
        {field('employer', 'Employer', { required: true })}
        {field('url', 'Link to the official posting', { type: 'url', help: 'Paste the employer’s page so you can find it again.' })}
        {field('location', 'Location')}
        <fieldset className="field">
          <legend className="field__label">Work arrangement</legend>
          <div className="choices">
            {ARRANGEMENTS.map(([value, label]) => (
              <label key={value} className="choice">
                <input type="radio" name="remotePolicy" value={value} checked={form.remotePolicy === value} onChange={set('remotePolicy')} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="job-description" className="field__label">
            Posting text <span className="muted">(optional)</span>
          </label>
          <textarea id="job-description" rows={10} value={form.description} onChange={set('description')} aria-describedby="job-description-help" />
          <p className="help" id="job-description-help">
            Paste the description so it can be searched. It is stored only on this computer.
          </p>
        </div>
        {errors.form && (
          <p className="banner banner--danger" role="alert">
            {errors.form}
          </p>
        )}
        <div className="field__actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save job'}
          </button>
          <Link href="/opportunities" className="button button--quiet">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
