import { SOURCE_LABEL } from '../../../format';
import { type Strategy, showRate } from '../-helpers/rates';

interface BySourceTableProps {
  bySource: Strategy['metrics']['bySource'];
}

export function BySourceTable({ bySource }: BySourceTableProps) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Results by source">
      <table className="compare" data-testid="by-source">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Found</th>
            <th scope="col">Closed or stale</th>
            <th scope="col">Submitted</th>
            <th scope="col">Responses</th>
          </tr>
        </thead>
        <tbody>
          {bySource.map((s) => (
            <tr key={s.source}>
              <th scope="row">{SOURCE_LABEL[s.source] ?? s.source}</th>
              <td>{s.found}</td>
              <td>{showRate(s.closedOrStale)}</td>
              <td>{s.submitted}</td>
              <td>{showRate(s.responded)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
