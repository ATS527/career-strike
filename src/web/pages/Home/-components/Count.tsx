import { Link } from '../../../router';

export function Count({ label, value, href, note }: { label: string; value: number; href: string; note?: string }) {
  return (
    <div className="count">
      <dt>
        {label}
        {note && <span className="count__note"> ({note})</span>}
      </dt>
      <dd>
        <Link href={href} aria-label={`${value} ${label.toLowerCase()}${note ? `, ${note}` : ''}`}>
          {value}
        </Link>
      </dd>
    </div>
  );
}
