import type { ReactNode } from 'react';
import { cn } from '../helpers/cn';

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, lede, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6', className)}>
      <div className="space-y-1">
        {eyebrow && <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-serif">{title}</h1>
        {lede && <p className="text-muted-foreground text-sm sm:text-base mt-1 max-w-[75ch] leading-relaxed">{lede}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}

export default PageHeader;
