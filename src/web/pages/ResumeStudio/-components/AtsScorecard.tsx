import { Badge } from '../../../components/ui/badge';

export interface AtsCheck {
  id: string;
  label: string;
  passed: boolean;
  explanation: string;
}

export function AtsScorecard({ atsChecks }: { atsChecks: AtsCheck[] }) {
  const allPassed = atsChecks.every((c) => c.passed);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            ATS &amp; Recruiter Parsability Audit
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time heuristics simulating Greenhouse, Lever, Workday and Ashby parsing pipelines.
          </p>
        </div>
        <Badge variant={allPassed ? 'teal' : 'warning'}>{allPassed ? '✓ 100% Parsable' : 'Attention needed'}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {atsChecks.map((check) => (
          <div key={check.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/70 bg-card/60">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                check.passed
                  ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              {check.passed ? '✓' : '!'}
            </span>
            <div className="space-y-0.5">
              <strong className="text-xs font-semibold text-foreground block">{check.label}</strong>
              <p className="text-xs text-muted-foreground leading-relaxed">{check.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
