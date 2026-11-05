import type { ReactElement } from 'react';
import type { JobDetail } from '../../../api';

/** Posting text rendered strictly as text; consecutive items become one list. */
export function Description({ blocks }: { blocks: JobDetail['description'] }) {
  const out: ReactElement[] = [];
  let items: string[] = [];
  const flushItems = (key: number): void => {
    if (items.length === 0) return;
    out.push(
      <ul key={`ul-${key}`}>
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
    out.push(b.type === 'heading' ? <h3 key={i}>{b.text}</h3> : <p key={i}>{b.text}</p>);
  });
  flushItems(blocks.length);
  return <div className="prose">{out}</div>;
}
