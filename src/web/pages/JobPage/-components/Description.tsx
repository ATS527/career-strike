import type { ReactElement } from 'react';
import type { JobDetail } from '../../../api';

/** Posting text rendered strictly as text; consecutive items become one list. */
export function Description({ blocks }: { blocks: JobDetail['description'] }) {
  const out: ReactElement[] = [];
  let items: string[] = [];
  const flushItems = (key: number): void => {
    if (items.length === 0) return;
    out.push(
      <ul key={`ul-${key}`} className="list-disc list-inside space-y-1 text-muted-foreground my-2">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>,
    );
    items = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === 'item') {
      items.push(b.text);
      return;
    }
    flushItems(i);
    out.push(
      b.type === 'heading' ? (
        <h3 key={i} className="text-base font-bold text-foreground mt-4 mb-1">
          {b.text}
        </h3>
      ) : (
        <p key={i} className="text-muted-foreground m-0">
          {b.text}
        </p>
      ),
    );
  });
  flushItems(blocks.length);
  return <div className="space-y-3 text-sm leading-relaxed text-foreground">{out}</div>;
}

export default Description;
