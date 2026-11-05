import { useForm } from 'react-hook-form';
import { api, ApiError, type JobDetail, type ValidationIssue } from '../api';
import { Link, useNavigateTo } from '../router';

const ARRANGEMENTS = [
  ['unknown', 'Not stated'],
  ['remote', 'Remote'],
  ['hybrid', 'Hybrid'],
  ['onsite', 'On-site'],
] as const;

type AddJobValues = {
  employer: string;
  title: string;
  url: string;
  location: string;
  remotePolicy: string;
  description: string;
};

export function AddJob() {
  const navigate = useNavigateTo();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddJobValues>({
    defaultValues: { employer: '', title: '', url: '', location: '', remotePolicy: 'unknown', description: '' },
  });

  const submit = async (values: AddJobValues): Promise<void> => {
    try {
      const body = { ...values, url: values.url.trim() || undefined, location: values.location.trim() || undefined };
      const res = await api<{ job: JobDetail }>('/api/jobs', { method: 'POST', body });
      navigate(`/jobs/${res.job.id}`);
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      if (issues.length > 0) {
        for (const issue of issues) {
          const field = String(issue.path[0] ?? 'form');
          if (field === 'form') continue;
          setError(field as keyof AddJobValues, { message: issue.message });
        }
        const formIssue = issues.find((i) => String(i.path[0] ?? '') === 'form');
        if (formIssue) setError('root', { message: formIssue.message });
      } else {
        setError('root', { message: 'The job could not be saved. Check that the service is running.' });
      }
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
        {...register(key)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={`job-${key}-help`}
      />
      <p className="help" id={`job-${key}-help`}>
        {errors[key] ? <span className="save-status--error">{errors[key]?.message}</span> : opts.help}
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
      <form className="form-narrow" onSubmit={handleSubmit((values) => void submit(values))} noValidate>
        {field('title', 'Job title', { required: true })}
        {field('employer', 'Employer', { required: true })}
        {field('url', 'Link to the official posting', { type: 'url', help: 'Paste the employer’s page so you can find it again.' })}
        {field('location', 'Location')}
        <fieldset className="field">
          <legend className="field__label">Work arrangement</legend>
          <div className="choices">
            {ARRANGEMENTS.map(([value, label]) => (
              <label key={value} className="choice">
                <input type="radio" value={value} {...register('remotePolicy')} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="job-description" className="field__label">
            Posting text <span className="muted">(optional)</span>
          </label>
          <textarea id="job-description" rows={10} {...register('description')} aria-describedby="job-description-help" />
          <p className="help" id="job-description-help">
            Paste the description so it can be searched. It is stored only on this computer.
          </p>
        </div>
        {errors.root?.message && (
          <p className="banner banner--danger" role="alert">
            {errors.root.message}
          </p>
        )}
        <div className="field__actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save job'}
          </button>
          <Link href="/opportunities" className="button button--quiet">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}