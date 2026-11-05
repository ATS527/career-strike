import { formatDate } from '../../../format';
import type { CampaignWeekSummary } from '../-helpers/rates';

interface CampaignSummaryTableProps {
  summaries: CampaignWeekSummary[];
}

export function CampaignSummaryTable({ summaries }: CampaignSummaryTableProps) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border shadow-xs"
      tabIndex={0}
      role="region"
      aria-label="Weekly campaign summary"
    >
      <table className="w-full text-left text-sm border-collapse bg-card" data-testid="campaign-summary">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th scope="col" className="p-3">
              Week
            </th>
            <th scope="col" className="p-3">
              Discovered
            </th>
            <th scope="col" className="p-3">
              Shortlisted
            </th>
            <th scope="col" className="p-3">
              Submitted
            </th>
            <th scope="col" className="p-3">
              Responses
            </th>
            <th scope="col" className="p-3">
              Interviews
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {summaries.map((w) => (
            <tr key={w.weekStart} className="hover:bg-muted/20 transition-colors">
              <th scope="row" className="p-3 font-semibold text-foreground text-xs">
                Week of {formatDate(w.weekStart)}
              </th>
              <td className="p-3 text-muted-foreground">{w.discovered}</td>
              <td className="p-3 text-muted-foreground">{w.shortlisted}</td>
              <td className="p-3 text-muted-foreground">{w.submitted}</td>
              <td className="p-3 text-muted-foreground">{w.responses}</td>
              <td className="p-3 text-muted-foreground">{w.interviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CampaignSummaryTable;
