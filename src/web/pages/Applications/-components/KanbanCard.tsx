import type { ApplicationSummary } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { APP_STATE_LABEL, ago } from '../../../format';
import { Link } from '../../../router';

export function KanbanCard({ application: a }: { application: ApplicationSummary }) {
  return (
    <div className="kanban-card p-3 bg-card border border-border rounded-lg shadow-xs" data-application={a.id}>
      <div className="kanban-card__header mb-2">
        <h4 className="kanban-card__title font-semibold text-sm">
          <Link href={`/applications/${a.id}`}>{a.title}</Link>
        </h4>
        <span className="kanban-card__employer text-xs text-muted-foreground block">{a.employer}</span>
      </div>
      <div className="kanban-card__meta text-xs text-muted-foreground mb-3 flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {APP_STATE_LABEL[a.state]}
        </Badge>
        <span className="muted">{ago(a.updatedAt)}</span>
      </div>
      <div className="kanban-card__actions flex justify-end">
        {a.state === 'READY_FOR_REVIEW' ? (
          <Link href={`/applications/${a.id}`} className="button button--small button--primary text-xs">
            Review Package
          </Link>
        ) : a.state === 'APPROVED' ? (
          <Link href={`/applications/${a.id}`} className="button button--small button--secondary text-xs">
            Submit on Site
          </Link>
        ) : a.state === 'INTERVIEW' ? (
          <Link href={`/applications/${a.id}/prep`} className="button button--small button--primary text-xs">
            🎯 Prep Interview
          </Link>
        ) : (
          <Link href={`/applications/${a.id}`} className="button button--small button--quiet text-xs">
            Open
          </Link>
        )}
      </div>
    </div>
  );
}
