import type { Disposition, JobSummary } from '../../../api';
import { TierChip } from '../../../components/FitPanel';
import { DispositionControls, StatusChip } from '../../../components/jobBits';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../../../format';
import { Link } from '../../../router';

function listSome(items: string[]): string {
  return items.length <= 3 ? items.join(', ') : `${items.slice(0, 3).join(', ')} +${items.length - 3}`;
}

export function JobRow({
  job,
  selected,
  compareFull,
  onCompare,
  onDisposition,
}: {
  job: JobSummary;
  selected: boolean;
  compareFull: boolean;
  onCompare: () => void;
  onDisposition: (d: Disposition) => void;
}) {
  const salary = formatSalary(job.salary);
  return (
    <li className={`job-row job-row--${job.disposition}`}>
      <div className="job-row__main">
        <h2 className="job-row__title">
          <Link href={`/jobs/${job.id}`}>{job.title}</Link>
        </h2>
        <p className="job-row__meta">
          <span className="job-row__employer">{job.employer}</span>
          {job.locationText && <span>{job.locationText}</span>}
          {job.market.location.countryCode && <span>{job.market.location.countryCode}</span>}
          <span>{REMOTE_LABEL[job.remotePolicy]}</span>
          {job.employmentType !== 'unknown' && <span>{EMPLOYMENT_LABEL[job.employmentType]}</span>}
          {salary && <span className="job-row__salary">{salary}</span>}
        </p>
        {job.fit && (
          <p className="job-row__fit">
            <TierChip tier={job.fit.tier} />
            {job.fit.matchedSkills.length > 0 && <span>You have {listSome(job.fit.matchedSkills)}</span>}
            {job.fit.missingRequiredSkills.length > 0 && (
              <span className="attention">Missing {listSome(job.fit.missingRequiredSkills)}</span>
            )}
            {job.fit.immediateStartAsked && <span className="badge">Asks for an early start</span>}
          </p>
        )}
        <p className="job-row__facts">
          <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
          <span className="muted">{job.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}</span>
          {job.sourceCapabilities.includes('AUTHORIZED_EMPLOYER_DIRECT') && (
            <span className="badge">Employer-direct</span>
          )}
          {job.sourceCapabilities.includes('USER_DRIVEN_DISCOVERY') && <span className="badge">User-added</span>}
          {job.employerExcluded && <span className="badge">Excluded employer</span>}
        </p>
      </div>
      <div className="job-row__actions">
        <DispositionControls jobId={job.id} title={job.title} disposition={job.disposition} onChange={onDisposition} />
        <label className="compare-check">
          <input type="checkbox" checked={selected} disabled={!selected && compareFull} onChange={onCompare} />
          <span>
            Compare<span className="visually-hidden"> {job.title}</span>
          </span>
        </label>
      </div>
    </li>
  );
}
