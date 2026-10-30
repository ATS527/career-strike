import type { FitDetail, JobDetail } from '../api';
import { EVIDENCE_LABEL, TIER_LABEL, VERDICT_LABEL } from '../format';
import { Link } from '../router';

export function TierChip({ tier }: { tier: string }) {
  return <span className={`chip chip--tier chip--tier-${tier}`}>{TIER_LABEL[tier] ?? tier}</span>;
}

/** How a posting fits the candidate: the tier, the rule that decided it, and every factor with its evidence. */
export function FitPanel({ fit }: { fit: FitDetail }) {
  return (
    <section aria-labelledby="fit-title" className="fit">
      <div className="fit__head">
        <h2 id="fit-title">How it fits you</h2>
        <TierChip tier={fit.tier} />
      </div>
      <p className="fit__rule">
        <span className="visually-hidden">Why: </span>
        {fit.tierRule}
      </p>
      {fit.tier === 'unknown' && (
        <p>
          <Link href="/profile">Add your skills and roles</Link> to see how postings fit.
        </p>
      )}
      <ul className="factors" data-testid="fit-factors">
        {fit.factors.map((f) => (
          <li key={f.id} className={`factor factor--${f.verdict}`} data-factor={f.id}>
            <div className="factor__head">
              <span className="factor__label">{f.label}</span>
              <span className={`verdict verdict--${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span>
            </div>
            <p className="factor__detail">{f.detail}</p>
            {f.evidence.length > 0 && (
              <ul className="evidence">
                {f.evidence.map((e, i) => (
                  <li key={i}>
                    <span className={`source source--${e.source}`}>{EVIDENCE_LABEL[e.source]}</span> {e.text}
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
  const groups = (['required', 'preferred', 'mentioned'] as const).map((imp) => [imp, req.skills.filter((s) => s.importance === imp)] as const);
  const any = req.skills.length > 0 || req.yearsRequired || req.urgency.length > 0 || req.locationConstraints.length > 0;
  return (
    <section aria-labelledby="req-title" className="requirements">
      <h2 id="req-title">What the posting asks for</h2>
      <p className="provenance">
        Quotes are from the posting. Whether a skill is “required” or “preferred” is Career Strike’s inference from the posting’s
        headings — check the original.
      </p>
      {!any && <p className="muted">Career Strike found no skills or requirements it recognises in this posting.</p>}
      {groups.map(([imp, skills]) =>
        skills.length === 0 ? null : (
          <div key={imp}>
            <h3>{{ required: 'Listed as required', preferred: 'Listed as nice to have', mentioned: 'Also mentioned' }[imp]}</h3>
            <ul className="evidence">
              {skills.map((s) => (
                <li key={s.skill}>
                  <strong>{s.skill}</strong> — “{s.evidence}”
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {req.yearsRequired && (
        <>
          <h3>Experience</h3>
          <p>“{req.yearsRequired.evidence}”</p>
        </>
      )}
      {req.urgency.length > 0 && (
        <>
          <h3>Start date</h3>
          {req.urgency.map((u) => (
            <p key={u}>“{u}”</p>
          ))}
        </>
      )}
      {req.locationConstraints.length > 0 && (
        <>
          <h3>Location conditions</h3>
          {req.locationConstraints.map((u) => (
            <p key={u}>“{u}”</p>
          ))}
        </>
      )}
    </section>
  );
}
