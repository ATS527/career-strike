import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import type { Strategy } from '../-helpers/rates';

interface ProposalListProps {
  proposals: Strategy['proposals'];
  onDecide: (id: string, how: 'accept' | 'dismiss', title: string) => void;
}

export function ProposalList({ proposals, onDecide }: ProposalListProps) {
  if (proposals.length === 0) {
    return <p className="empty text-muted-foreground text-sm">No suggestions right now.</p>;
  }

  return (
    <ul className="topic-list space-y-3" data-testid="proposals">
      {proposals.map((p) => (
        <li key={p.id} className="topic">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-base font-semibold text-foreground m-0">{p.title}</h3>
              <p className="help text-xs text-muted-foreground m-0">{p.rationale}</p>
              <div className="field__actions flex gap-2 pt-2">
                <Button type="button" size="sm" onClick={() => onDecide(p.id, 'accept', p.title)}>
                  Accept<span className="visually-hidden"> {p.title}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onDecide(p.id, 'dismiss', p.title)}>
                  Dismiss<span className="visually-hidden"> {p.title}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
