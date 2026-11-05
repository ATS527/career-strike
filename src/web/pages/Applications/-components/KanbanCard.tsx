import type { ApplicationSummary } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { APP_STATE_LABEL, ago } from '../../../format';
import { cn } from '../../../helpers/cn';
import { Link } from '../../../router';

export function KanbanCard({ application: a }: { application: ApplicationSummary }) {
  return (
    <div
      className="p-3 bg-card border border-border rounded-lg shadow-xs space-y-2 hover:border-border/80 transition-colors"
      data-application={a.id}
    >
      <div>
        <h4 className="font-semibold text-sm m-0 leading-snug">
          <Link href={`/applications/${a.id}`} className="hover:underline text-foreground">
            {a.title}
          </Link>
        </h4>
        <span className="text-xs text-muted-foreground block mt-0.5">{a.employer}</span>
      </div>
      <div className="text-xs text-muted-foreground flex items-center justify-between pt-1">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
          {APP_STATE_LABEL[a.state]}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{ago(a.updatedAt)}</span>
      </div>
      <div className="flex justify-end pt-1">
        {a.state === 'READY_FOR_REVIEW' ? (
          <Link
            href={`/applications/${a.id}`}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'h-7 text-xs px-2.5')}
          >
            Review Package
          </Link>
        ) : a.state === 'APPROVED' ? (
          <Link
            href={`/applications/${a.id}`}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'h-7 text-xs px-2.5')}
          >
            Submit on Site
          </Link>
        ) : a.state === 'INTERVIEW' ? (
          <Link
            href={`/applications/${a.id}/prep`}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'h-7 text-xs px-2.5')}
          >
            🎯 Prep Interview
          </Link>
        ) : (
          <Link
            href={`/applications/${a.id}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 text-xs px-2.5')}
          >
            Open
          </Link>
        )}
      </div>
    </div>
  );
}

export default KanbanCard;
