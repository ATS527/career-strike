import { type Strategy, showRate } from '../-helpers/rates';

interface MetricSummaryCardsProps {
  metrics: Strategy['metrics'];
}

export function MetricSummaryCards({ metrics }: MetricSummaryCardsProps) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 p-0 m-0" data-testid="totals">
      <div className="p-4 rounded-lg border border-border bg-card shadow-xs flex flex-col justify-between">
        <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Applications submitted</dt>
        <dd className="text-2xl font-bold font-serif text-foreground mt-2 m-0">{metrics.totals.submitted}</dd>
      </div>
      <div className="p-4 rounded-lg border border-border bg-card shadow-xs flex flex-col justify-between">
        <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Got a response</dt>
        <dd className="text-2xl font-bold font-serif text-foreground mt-2 m-0">{showRate(metrics.responseRate)}</dd>
      </div>
      <div className="p-4 rounded-lg border border-border bg-card shadow-xs flex flex-col justify-between">
        <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reached interview</dt>
        <dd className="text-2xl font-bold font-serif text-foreground mt-2 m-0">{showRate(metrics.interviewRate)}</dd>
      </div>
      <div className="p-4 rounded-lg border border-border bg-card shadow-xs flex flex-col justify-between">
        <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Days to first response</dt>
        <dd className="text-2xl font-bold font-serif text-foreground mt-2 m-0">
          {metrics.daysToFirstResponse.median === null
            ? 'no data (n=0)'
            : `median ${metrics.daysToFirstResponse.median.toFixed(1)} (n=${metrics.daysToFirstResponse.n})`}
        </dd>
      </div>
      <div className="p-4 rounded-lg border border-border bg-card shadow-xs flex flex-col justify-between">
        <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offers</dt>
        <dd className="text-2xl font-bold font-serif text-foreground mt-2 m-0">{metrics.totals.offers}</dd>
      </div>
    </dl>
  );
}

export default MetricSummaryCards;
