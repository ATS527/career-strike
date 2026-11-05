import type { JobSummary } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { formatSalary, REMOTE_LABEL } from '../../../format';
import { cn } from '../../../helpers/cn';
import { Link } from '../../../router';

export function TopMatchSpotlight({ jobs }: { jobs: JobSummary[] }) {
  const topMatch = jobs.find((j) => j.fit?.tier === 'strong' && j.disposition !== 'excluded');
  if (!topMatch) return null;

  return (
    <aside
      className="p-4 rounded-xl border border-teal-500/30 bg-teal-50/50 dark:bg-teal-950/20 shadow-xs mb-6 space-y-3"
      aria-label="Top match recommendation"
    >
      <Badge variant="teal" className="text-xs font-semibold">
        ⭐ High-Signal Match for Your Profile
      </Badge>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-serif text-foreground m-0">
            <Link href={`/jobs/${topMatch.id}`} className="hover:underline">
              {topMatch.title}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground m-0">
            <strong className="text-foreground">{topMatch.employer}</strong> ·{' '}
            {topMatch.locationText || 'Location unstated'} · <span>{REMOTE_LABEL[topMatch.remotePolicy]}</span>
            {topMatch.salary && ` · ${formatSalary(topMatch.salary)}`}
          </p>
          {topMatch.fit && topMatch.fit.matchedSkills.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
              <span className="text-muted-foreground">Your verified skills: </span>
              {topMatch.fit.matchedSkills.slice(0, 5).map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <Link
            href={`/jobs/${topMatch.id}`}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'text-xs')}
          >
            Review Role &amp; Prep
          </Link>
        </div>
      </div>
    </aside>
  );
}

export default TopMatchSpotlight;
