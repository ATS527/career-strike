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
    <div className="ats-card">
      <div className="ats-card__header">
        <div>
          <h3>ATS &amp; Recruiter Parsability Audit</h3>
          <p className="help">
            Real-time heuristics simulating Greenhouse, Lever, Workday and Ashby parsing pipelines.
          </p>
        </div>
        <Badge variant={allPassed ? 'teal' : 'warning'}>{allPassed ? '✓ 100% Parsable' : 'Attention needed'}</Badge>
      </div>

      <div className="ats-card__grid">
        {atsChecks.map((check) => (
          <div key={check.id} className="ats-check">
            <span
              className={
                check.passed ? 'ats-check__badge ats-check__badge--pass' : 'ats-check__badge ats-check__badge--warn'
              }
            >
              {check.passed ? '✓' : '!'}
            </span>
            <div className="ats-check__body">
              <strong>{check.label}</strong>
              <p>{check.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
