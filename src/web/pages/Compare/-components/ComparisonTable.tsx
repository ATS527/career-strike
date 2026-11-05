import type { ReactNode } from 'react';
import type { JobDetail } from '../../../api';
import { StatusChip } from '../../../components/jobBits';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../../../format';
import { Link } from '../../../router';

export function ComparisonTable({ jobs }: { jobs: JobDetail[] }) {
  const rows: [string, (j: JobDetail) => ReactNode][] = [
    ['Employer', (j) => j.employer],
    ['Status', (j) => <StatusChip status={j.status} lastVerifiedAt={j.lastVerifiedAt} />],
    ['Location', (j) => j.locationText ?? <span className="muted">Not stated</span>],
    [
      'Arrangement',
      (j) => (j.remotePolicy === 'unknown' ? <span className="muted">Not stated</span> : REMOTE_LABEL[j.remotePolicy]),
    ],
    [
      'Employment',
      (j) =>
        j.employmentType === 'unknown' ? <span className="muted">Not stated</span> : EMPLOYMENT_LABEL[j.employmentType],
    ],
    ['Salary', (j) => formatSalary(j.salary) ?? <span className="muted">Not published</span>],
    [
      'Your decision',
      (j) => ({ none: 'Not reviewed', shortlisted: 'Shortlisted', excluded: 'Not for me' })[j.disposition],
    ],
    ['Found on', (j) => j.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')],
  ];

  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Comparison table">
      <table className="compare">
        <thead>
          <tr>
            <td />
            {jobs.map((j) => (
              <th key={j.id} scope="col">
                <Link href={`/jobs/${j.id}`}>{j.title}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {jobs.map((j) => (
                <td key={j.id}>{cell(j)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
