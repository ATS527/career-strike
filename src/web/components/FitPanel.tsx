import type { FitDetail, JobDetail } from '../api';
import { EVIDENCE_LABEL, TIER_LABEL, VERDICT_LABEL } from '../format';
import { Link } from '../router';

const TIER_STYLES: Record<string, string> = {
  strong: 'bg-primary text-primary-foreground border-transparent shadow-2xs',
  possible: 'border-primary text-primary bg-primary/10',
  stretch: 'border-dashed border-border text-muted-foreground',
  ineligible: 'border-destructive/40 bg-destructive/10 text-destructive',
  unknown: 'border-border text-muted-foreground/60',
};

export function TierChip({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier] ?? 'border-border text-foreground';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style}`}>
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

const FACTOR_BORDER: Record<string, string> = {
  meets: 'border-l-emerald-500',
  partial: 'border-l-primary',
  gap: 'border-l-amber-500',
  unknown: 'border-l-muted-foreground/40',
};

const VERDICT_COLOR: Record<string, string> = {
  meets: 'text-emerald-700 dark:text-emerald-400',
  partial: 'text-primary',
  gap: 'text-amber-800 dark:text-amber-400',
  unknown: 'text-muted-foreground',
};

/** How a posting fits the candidate: the tier, the rule that decided it, and every factor with its evidence. */
export function FitPanel({ fit }: { fit: FitDetail }) {
  return (
    <section
      aria-labelledby="fit-title"
      className="mt-6 p-5 rounded-xl border border-border bg-card shadow-xs space-y-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="fit-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
          How it fits you
        </h2>
        <TierChip tier={fit.tier} />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="sr-only">Why: </span>
        {fit.tierRule}
      </p>
      {fit.tier === 'unknown' && (
        <p className="text-sm text-muted-foreground">
          <Link href="/profile" className="text-primary hover:underline">
            Add your skills and roles
          </Link>{' '}
          to see how postings fit.
        </p>
      )}
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 list-none p-0 m-0" data-testid="fit-factors">
        {fit.factors.map((f) => (
          <li
            key={f.id}
            className={`p-3 rounded-lg border border-border border-l-4 ${FACTOR_BORDER[f.verdict] ?? 'border-l-border'} bg-background/50 shadow-2xs hover:shadow-xs transition-shadow space-y-1.5`}
            data-factor={f.id}
          >
            <div className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-foreground min-w-0 break-words">{f.label}</span>
              <span
                className={`font-mono text-[11px] uppercase tracking-wider font-bold whitespace-nowrap ${VERDICT_COLOR[f.verdict] ?? 'text-foreground'}`}
              >
                {VERDICT_LABEL[f.verdict]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.detail}</p>
            {f.evidence.length > 0 && (
              <ul className="divide-y divide-border/60 text-xs text-muted-foreground pl-2 mt-2 border-t border-border/40 pt-1">
                {f.evidence.map((e, i) => (
                  <li key={i} className="py-1 first:pt-0 last:pb-0">
                    <span className="font-mono text-[10px] uppercase font-semibold text-muted-foreground/80">
                      {EVIDENCE_LABEL[e.source]}
                    </span>{' '}
                    {e.text}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the posting asks for. Skills and quotes are read from the text; the required/preferred split is inferred from headings. */
export function RequirementsPanel({ req }: { req: JobDetail['requirements'] }) {
  const groups = (['required', 'preferred', 'mentioned'] as const).map(
    (imp) => [imp, req.skills.filter((s) => s.importance === imp)] as const,
  );
  const any =
    req.skills.length > 0 || req.yearsRequired || req.urgency.length > 0 || req.locationConstraints.length > 0;
  return (
    <section
      aria-labelledby="req-title"
      className="mt-6 p-5 rounded-xl border border-border bg-card shadow-xs space-y-4"
    >
      <h2 id="req-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
        What the posting asks for
      </h2>
      <p className="text-xs text-muted-foreground italic mb-3">
        Quotes are from the posting. Whether a skill is “required” or “preferred” is Career Strike’s inference from the
        posting’s headings — check the original.
      </p>
      {!any && (
        <p className="text-sm text-muted-foreground italic">
          Career Strike found no skills or requirements it recognises in this posting.
        </p>
      )}
      {groups.map(([imp, skills]) =>
        skills.length === 0 ? null : (
          <div key={imp} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {
                { required: 'Listed as required', preferred: 'Listed as nice to have', mentioned: 'Also mentioned' }[
                  imp
                ]
              }
            </h3>
            <ul className="divide-y divide-border/60 text-xs text-muted-foreground pl-2">
              {skills.map((s) => (
                <li key={s.skill} className="py-1 first:pt-0 last:pb-0">
                  <strong className="text-foreground">{s.skill}</strong> — “{s.evidence}”
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {req.yearsRequired && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Experience</h3>
          <p className="text-xs text-muted-foreground">“{req.yearsRequired.evidence}”</p>
        </div>
      )}
      {req.urgency.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Start date</h3>
          {req.urgency.map((u) => (
            <p key={u} className="text-xs text-muted-foreground">
              “{u}”
            </p>
          ))}
        </div>
      )}
      {req.locationConstraints.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Location conditions</h3>
          {req.locationConstraints.map((u) => (
            <p key={u} className="text-xs text-muted-foreground">
              “{u}”
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
