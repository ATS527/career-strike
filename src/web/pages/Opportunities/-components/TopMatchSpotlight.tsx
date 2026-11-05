import type { JobSummary } from '../../../api';
import { formatSalary, REMOTE_LABEL } from '../../../format';
import { Link } from '../../../router';

export function TopMatchSpotlight({ jobs }: { jobs: JobSummary[] }) {
  const topMatch = jobs.find((j) => j.fit?.tier === 'strong' && j.disposition !== 'excluded');
  if (!topMatch) return null;

  return (
    <aside className="top-match-card" aria-label="Top match recommendation">
      <div className="top-match-card__badge">⭐ High-Signal Match for Your Profile</div>
      <div className="top-match-card__content">
        <div className="top-match-card__details">
          <h3 className="top-match-card__title">
            <Link href={`/jobs/${topMatch.id}`}>{topMatch.title}</Link>
          </h3>
          <p className="top-match-card__meta">
            <strong>{topMatch.employer}</strong> · {topMatch.locationText || 'Location unstated'} ·{' '}
            <span>{REMOTE_LABEL[topMatch.remotePolicy]}</span>
            {topMatch.salary && ` · ${formatSalary(topMatch.salary)}`}
          </p>
          {topMatch.fit && topMatch.fit.matchedSkills.length > 0 && (
            <div className="top-match-card__skills">
              <span className="muted">Your verified skills: </span>
              {topMatch.fit.matchedSkills.slice(0, 5).map((s) => (
                <span key={s} className="evidence-chip evidence-chip--skill">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="top-match-card__action">
          <Link href={`/jobs/${topMatch.id}`} className="button button--small button--primary">
            Review Role &amp; Prep
          </Link>
        </div>
      </div>
    </aside>
  );
}
