import { type Strategy, showRate } from '../-helpers/rates';

interface MetricSummaryCardsProps {
  metrics: Strategy['metrics'];
}

export function MetricSummaryCards({ metrics }: MetricSummaryCardsProps) {
  return (
    <dl className="facts" data-testid="totals">
      <div>
        <dt>Applications submitted</dt>
        <dd>{metrics.totals.submitted}</dd>
      </div>
      <div>
        <dt>Got a response</dt>
        <dd>{showRate(metrics.responseRate)}</dd>
      </div>
      <div>
        <dt>Reached interview</dt>
        <dd>{showRate(metrics.interviewRate)}</dd>
      </div>
      <div>
        <dt>Days to first response</dt>
        <dd>
          {metrics.daysToFirstResponse.median === null
            ? 'no data (n=0)'
            : `median ${metrics.daysToFirstResponse.median.toFixed(1)} (n=${metrics.daysToFirstResponse.n})`}
        </dd>
      </div>
      <div>
        <dt>Offers</dt>
        <dd>{metrics.totals.offers}</dd>
      </div>
    </dl>
  );
}
