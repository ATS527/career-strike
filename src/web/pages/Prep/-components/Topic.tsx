import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, type Prep as PrepData, type PrepTopic, type ProfileFact } from '../../../api';
import { findMatchingCareerEvidence } from '../../../candidateExperience';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { type PracticeLogFormValues, practiceLogSchema } from '../-schema/prep';

export const CONFIDENCE = ['', 'Not ready', 'Shaky', 'Getting there', 'Confident', 'Ready'];

export function Topic({
  topic,
  applicationId,
  facts,
  onLogged,
}: {
  topic: PrepTopic;
  applicationId: string;
  facts: ProfileFact[];
  onLogged: (d: PrepData) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [showStarGuide, setShowStarGuide] = useState(false);

  const matchedEvidence = useMemo(() => {
    return findMatchingCareerEvidence(topic.title, facts);
  }, [topic.title, facts]);

  const form = useForm<PracticeLogFormValues>({
    resolver: zodResolver(practiceLogSchema),
    defaultValues: {
      confidence: 3,
      minutes: '',
      notes: '',
    },
  });

  const id = `topic-${topic.id}`;

  const onSubmit = async (values: PracticeLogFormValues): Promise<void> => {
    try {
      onLogged(
        await api<PrepData>(`/api/applications/${applicationId}/practice`, {
          method: 'POST',
          body: {
            topicId: topic.id,
            confidence: values.confidence,
            minutes: values.minutes ? Number(values.minutes) : null,
            notes: values.notes?.trim() || null,
          },
        }),
      );
      form.reset({ confidence: 3, minutes: '', notes: '' });
      setStatus('Logged.');
    } catch {
      setStatus('Could not log practice.');
    }
  };

  const insertStarTemplate = () => {
    const template =
      'S: [Situation & Context] | T: [Specific Objective] | A: [Key Technical Actions & Tradeoffs] | R: [Measurable Outcome]';
    const currentNotes = form.getValues('notes');
    form.setValue('notes', currentNotes ? `${currentNotes}\n${template}` : template);
    setShowStarGuide(true);
  };

  return (
    <li
      className={`p-4 rounded-lg border bg-card shadow-xs space-y-3 ${
        topic.gap ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'
      }`}
      data-topic={topic.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 id={id} className="text-base font-semibold text-foreground m-0">
            {topic.title}
          </h3>
          {topic.gap && (
            <Badge variant="warning" className="text-[10px]">
              Gap: not in your profile
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {topic.sessions === 0
            ? 'Not practised yet'
            : `${topic.sessions} session${topic.sessions === 1 ? '' : 's'} · last: ${CONFIDENCE[topic.lastConfidence ?? 0]}`}
        </span>
      </div>

      {topic.quote && <p className="text-xs text-muted-foreground italic m-0">Posting: “{topic.quote}”</p>}

      {(matchedEvidence.skills.length > 0 || matchedEvidence.roles.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1">
          <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
            Your Anchors:
          </span>
          {matchedEvidence.skills.map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px]">
              ⚡ {s}
            </Badge>
          ))}
          {matchedEvidence.roles.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px]">
              💼 {r}
            </Badge>
          ))}
        </div>
      )}

      <ul className="space-y-1 p-0 m-0 list-none text-xs text-muted-foreground">
        {topic.prompts.map((p) => (
          <li key={p} className="p-2 rounded bg-muted/20 border border-border/40 text-foreground">
            {p}
          </li>
        ))}
      </ul>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => setShowStarGuide(!showStarGuide)}
          aria-expanded={showStarGuide}
        >
          {showStarGuide ? '▾ Hide STAR Story Assistant' : '▸ ⭐ Use STAR Story Framework'}
        </Button>
      </div>

      {showStarGuide && (
        <div className="p-3.5 rounded-lg border border-teal-500/30 bg-teal-50/40 dark:bg-teal-950/20 text-xs space-y-2">
          <p className="m-0 text-foreground">
            Structure your behavioral & technical answers with <strong>STAR</strong>:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
            <div className="p-1.5 rounded bg-background/50 border border-border/50">
              <strong className="text-foreground">S</strong>: Set the scene (architecture, constraints, scale)
            </div>
            <div className="p-1.5 rounded bg-background/50 border border-border/50">
              <strong className="text-foreground">T</strong>: The challenge or milestone you owned
            </div>
            <div className="p-1.5 rounded bg-background/50 border border-border/50">
              <strong className="text-foreground">A</strong>: Decisions, code, tools & how you tackled friction
            </div>
            <div className="p-1.5 rounded bg-background/50 border border-border/50">
              <strong className="text-foreground">R</strong>: Measurable impact, performance gains, team growth
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" className="text-xs h-7" onClick={insertStarTemplate}>
            ✍️ Insert STAR Outline into Notes
          </Button>
        </div>
      )}

      <Form {...form}>
        <form
          className="flex flex-wrap items-end gap-3 pt-2 border-t border-border"
          onSubmit={form.handleSubmit(onSubmit)}
          aria-labelledby={id}
        >
          <FormField
            control={form.control}
            name="confidence"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor={`${id}-conf`} className="text-xs font-medium">
                  How ready do you feel?
                </FormLabel>
                <FormControl>
                  <select
                    id={`${id}-conf`}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-xs"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {CONFIDENCE[n]}
                      </option>
                    ))}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minutes"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor={`${id}-min`} className="text-xs font-medium">
                  Minutes (optional)
                </FormLabel>
                <FormControl>
                  <Input
                    id={`${id}-min`}
                    type="number"
                    min={1}
                    max={600}
                    inputMode="numeric"
                    className="w-24 h-8 text-xs"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="space-y-1 flex-1 min-w-[200px]">
                <FormLabel htmlFor={`${id}-notes`} className="text-xs font-medium">
                  Notes (optional)
                </FormLabel>
                <FormControl>
                  <Input id={`${id}-notes`} type="text" className="h-8 text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <Button type="submit" variant="ghost" size="sm" className="h-8 text-xs">
            Log practice<span className="sr-only"> for {topic.title}</span>
          </Button>
          {status && (
            <span role="status" className="text-xs text-muted-foreground self-center">
              {status}
            </span>
          )}
        </form>
      </Form>
    </li>
  );
}

export default Topic;
