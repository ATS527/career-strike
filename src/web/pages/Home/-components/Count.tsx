import { Link } from '../../../router';

export function Count({ label, value, href, note }: { label: string; value: number; href: string; note?: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card shadow-xs flex flex-col justify-between">
      <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
        {note && <span className="font-normal text-muted-foreground lowercase"> ({note})</span>}
      </dt>
      <dd className="text-3xl font-bold font-serif text-foreground mt-2 m-0">
        <Link
          href={href}
          aria-label={`${value} ${label.toLowerCase()}${note ? `, ${note}` : ''}`}
          className="hover:underline text-foreground"
        >
          {value}
        </Link>
      </dd>
    </div>
  );
}

export default Count;
