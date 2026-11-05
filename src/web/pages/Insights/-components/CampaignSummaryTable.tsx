import { formatDate } from '../../../format';
import type { CampaignWeekSummary } from '../-helpers/rates';

interface CampaignSummaryTableProps {
  summaries: CampaignWeekSummary[];
}

export function CampaignSummaryTable({ summaries }: CampaignSummaryTableProps) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly campaign summary">
      <table className="compare" data-testid="campaign-summary">
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Discovered</th>
            <th scope="col">Shortlisted</th>
            <th scope="col">Submitted</th>
            <th scope="col">Responses</th>
            <th scope="col">Interviews</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((w) => (
            <tr key={w.weekStart}>
              <th scope="row">Week of {formatDate(w.weekStart)}</th>
              <td>{w.discovered}</td>
              <td>{w.shortlisted}</td>
              <td>{w.submitted}</td>
              <td>{w.responses}</td>
              <td>{w.interviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
