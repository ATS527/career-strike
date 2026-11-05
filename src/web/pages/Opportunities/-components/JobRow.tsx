import type { Disposition, JobSummary } from '../../../api';
import { TierChip } from '../../../components/FitPanel';
import { DispositionControls, StatusChip } from '../../../components/jobBits';
import { Badge } from '../../../components/ui/badge';
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
    <li className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card shadow-xs hover:border-border/80 transition-colors">
      <div className="space-y-1.5 flex-1 min-w-0">
        <h2 className="text-base font-semibold text-foreground m-0 truncate">
          <Link href={`/jobs/${job.id}`} className="hover:underline">
            {job.title}
          </Link>
        </h2>
        <p className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground m-0">
          <span className="font-medium text-foreground">{job.employer}</span>
          {job.locationText && (
            <>
              <span>•</span>
              <span>{job.locationText}</span>
            </>
          )}
          {job.market.location.countryCode && (
            <>
              <span>•</span>
              <span className="font-mono">{job.market.location.countryCode}</span>
            </>
          )}
          <span>•</span>
          <span>{REMOTE_LABEL[job.remotePolicy]}</span>
          {job.employmentType !== 'unknown' && (
            <>
              <span>•</span>
              <span>{EMPLOYMENT_LABEL[job.employmentType]}</span>
            </>
          )}
          {salary && (
            <>
              <span>•</span>
              <span className="font-semibold text-foreground">{salary}</span>
            </>
          )}
        </p>
        {job.fit && (
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
            <TierChip tier={job.fit.tier} />
            {job.fit.matchedSkills.length > 0 && (
              <span className="text-teal-700 dark:text-teal-300">You have {listSome(job.fit.matchedSkills)}</span>
            )}
            {job.fit.missingRequiredSkills.length > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                Missing {listSome(job.fit.missingRequiredSkills)}
              </span>
            )}
            {job.fit.immediateStartAsked && (
              <Badge variant="warning" className="text-[10px]">
                Asks for an early start
              </Badge>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
          <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
          <span>{job.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}</span>
          {job.sourceCapabilities.includes('AUTHORIZED_EMPLOYER_DIRECT') && (
            <Badge variant="outline" className="text-[10px]">
              Employer-direct
            </Badge>
          )}
          {job.sourceCapabilities.includes('USER_DRIVEN_DISCOVERY') && (
            <Badge variant="outline" className="text-[10px]">
              User-added
            </Badge>
          )}
          {job.employerExcluded && (
            <Badge variant="destructive" className="text-[10px]">
              Excluded employer
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <DispositionControls jobId={job.id} title={job.title} disposition={job.disposition} onChange={onDisposition} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selected && compareFull}
            onChange={onCompare}
            className="accent-primary"
          />
          <span>
            Compare<span className="sr-only"> {job.title}</span>
          </span>
        </label>
      </div>
    </li>
  );
}

export default JobRow;
