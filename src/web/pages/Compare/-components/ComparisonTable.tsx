import type { ReactNode } from 'react';
import type { JobDetail } from '../../../api';
import { StatusChip } from '../../../components/jobBits';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../../../format';
import { Link } from '../../../router';

export function ComparisonTable({ jobs }: { jobs: JobDetail[] }) {
  const rows: [string, (j: JobDetail) => ReactNode][] = [
    ['Employer', (j) => j.employer],
    ['Status', (j) => <StatusChip status={j.status} lastVerifiedAt={j.lastVerifiedAt} />],
    ['Location', (j) => j.locationText ?? <span className="text-xs text-muted-foreground italic">Not stated</span>],
    [
      'Arrangement',
      (j) =>
        j.remotePolicy === 'unknown' ? (
          <span className="text-xs text-muted-foreground italic">Not stated</span>
        ) : (
          REMOTE_LABEL[j.remotePolicy]
        ),
    ],
    [
      'Employment',
      (j) =>
        j.employmentType === 'unknown' ? (
          <span className="text-xs text-muted-foreground italic">Not stated</span>
        ) : (
          EMPLOYMENT_LABEL[j.employmentType]
        ),
    ],
    [
      'Salary',
      (j) => formatSalary(j.salary) ?? <span className="text-xs text-muted-foreground italic">Not published</span>,
    ],
    [
      'Your decision',
      (j) => ({ none: 'Not reviewed', shortlisted: 'Shortlisted', excluded: 'Not for me' })[j.disposition],
    ],
    ['Found on', (j) => j.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')],
  ];

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border shadow-xs"
      tabIndex={0}
      role="region"
      aria-label="Comparison table"
    >
      <table className="w-full text-left text-sm border-collapse bg-card">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <td className="p-3 w-40 font-semibold text-muted-foreground text-xs uppercase tracking-wider" />
            {jobs.map((j) => (
              <th key={j.id} scope="col" className="p-3 font-semibold text-foreground">
                <Link href={`/jobs/${j.id}`} className="hover:underline">
                  {j.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([label, cell]) => (
            <tr key={label} className="hover:bg-muted/20 transition-colors">
              <th scope="row" className="p-3 font-medium text-foreground text-xs bg-muted/10">
                {label}
              </th>
              {jobs.map((j) => (
                <td key={j.id} className="p-3 text-muted-foreground text-sm">
                  {cell(j)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ComparisonTable;
