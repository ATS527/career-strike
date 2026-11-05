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
    <li className={`topic${topic.gap ? ' topic--gap' : ''}`} data-topic={topic.id}>
      <div className="topic__head">
        <h3 id={id}>{topic.title}</h3>
        {topic.gap && (
          <Badge variant="secondary" className="ml-2">
            Gap: not in your profile
          </Badge>
        )}
        <span className="muted">
          {topic.sessions === 0
            ? 'Not practised yet'
            : `${topic.sessions} session${topic.sessions === 1 ? '' : 's'} · last: ${CONFIDENCE[topic.lastConfidence ?? 0]}`}
        </span>
      </div>
      {topic.quote && <p className="provenance">Posting: “{topic.quote}”</p>}

      {(matchedEvidence.skills.length > 0 || matchedEvidence.roles.length > 0) && (
        <div className="topic-evidence">
          <span className="topic-evidence__label">Your Anchors:</span>
          {matchedEvidence.skills.map((s) => (
            <span key={s} className="evidence-chip evidence-chip--skill">
              ⚡ {s}
            </span>
          ))}
          {matchedEvidence.roles.map((r) => (
            <span key={r} className="evidence-chip evidence-chip--role">
              💼 {r}
            </span>
          ))}
        </div>
      )}

      <ul className="disclosures">
        {topic.prompts.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <div className="star-assistant-toggle">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowStarGuide(!showStarGuide)}
          aria-expanded={showStarGuide}
        >
          {showStarGuide ? '▾ Hide STAR Story Assistant' : '▸ ⭐ Use STAR Story Framework'}
        </Button>
      </div>

      {showStarGuide && (
        <div className="star-guide">
          <p className="star-guide__intro">
            Structure your behavioral & technical answers with <strong>STAR</strong>:
          </p>
          <div className="star-guide__steps">
            <div>
              <strong>S</strong>: Set the scene (architecture, constraints, scale)
            </div>
            <div>
              <strong>T</strong>: The challenge or milestone you owned
            </div>
            <div>
              <strong>A</strong>: Decisions, code, tools & how you tackled friction
            </div>
            <div>
              <strong>R</strong>: Measurable impact, performance gains, team growth
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={insertStarTemplate}>
            ✍️ Insert STAR Outline into Notes
          </Button>
        </div>
      )}

      <Form {...form}>
        <form className="practice-form" onSubmit={form.handleSubmit(onSubmit)} aria-labelledby={id}>
          <FormField
            control={form.control}
            name="confidence"
            render={({ field }) => (
              <FormItem className="inline-block mr-2">
                <FormLabel htmlFor={`${id}-conf`}>How ready do you feel?</FormLabel>
                <FormControl>
                  <select
                    id={`${id}-conf`}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="p-1 border border-input rounded-md bg-background text-sm"
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
              <FormItem className="inline-block mr-2">
                <FormLabel htmlFor={`${id}-min`}>Minutes (optional)</FormLabel>
                <FormControl>
                  <Input
                    id={`${id}-min`}
                    type="number"
                    min={1}
                    max={600}
                    inputMode="numeric"
                    className="w-20 inline-block"
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
              <FormItem className="inline-block mr-2">
                <FormLabel htmlFor={`${id}-notes`}>Notes (optional)</FormLabel>
                <FormControl>
                  <Input id={`${id}-notes`} type="text" className="inline-block w-48" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <Button type="submit" variant="ghost" size="sm">
            Log practice<span className="visually-hidden"> for {topic.title}</span>
          </Button>
          <span role="status" className="field-note ml-2">
            {status}
          </span>
        </form>
      </Form>
    </li>
  );
}
