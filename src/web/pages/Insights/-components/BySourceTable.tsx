import { SOURCE_LABEL } from '../../../format';
import { type Strategy, showRate } from '../-helpers/rates';

interface BySourceTableProps {
  bySource: Strategy['metrics']['bySource'];
}

export function BySourceTable({ bySource }: BySourceTableProps) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border shadow-xs"
      tabIndex={0}
      role="region"
      aria-label="Results by source"
    >
      <table className="w-full text-left text-sm border-collapse bg-card" data-testid="by-source">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th scope="col" className="p-3">
              Source
            </th>
            <th scope="col" className="p-3">
              Found
            </th>
            <th scope="col" className="p-3">
              Closed or stale
            </th>
            <th scope="col" className="p-3">
              Submitted
            </th>
            <th scope="col" className="p-3">
              Responses
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bySource.map((s) => (
            <tr key={s.source} className="hover:bg-muted/20 transition-colors">
              <th scope="row" className="p-3 font-semibold text-foreground text-xs">
                {SOURCE_LABEL[s.source] ?? s.source}
              </th>
              <td className="p-3 text-muted-foreground">{s.found}</td>
              <td className="p-3 text-muted-foreground">{showRate(s.closedOrStale)}</td>
              <td className="p-3 text-muted-foreground">{s.submitted}</td>
              <td className="p-3 text-muted-foreground">{showRate(s.responded)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BySourceTable;
