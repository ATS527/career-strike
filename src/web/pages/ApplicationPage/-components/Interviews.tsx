import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { type ApplicationView, api, type Interview } from '../../../api';
import { downloadInterviewIcs } from '../../../candidateExperience';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { formatDateTime } from '../../../format';
import { Link } from '../../../router';
import { type InterviewFormValues, interviewSchema } from '../-schema/application';

const SUBMITTED = ['SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER'];
const OUTCOME_TEXT: Record<Interview['outcome'], string> = {
  pending: 'Upcoming',
  passed: 'Went well / passed',
  not_passed: 'Not progressed',
  cancelled: 'Cancelled',
};

export function Interviews({ view, onChange }: { view: ApplicationView; onChange: () => void }) {
  const [list, setList] = useState<Interview[]>([]);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      stage: '',
      format: 'video',
      scheduledAt: '',
    },
  });

  const reload = useCallback(async () => {
    const prep = await api<{ interviews: Interview[] }>(`/api/applications/${view.id}/prep`).catch(() => ({
      interviews: [],
    }));
    setList(prep.interviews);
  }, [view.id]);

  useEffect(() => void reload(), [reload, view.state]);
  const canSchedule = SUBMITTED.includes(view.state);

  const onSubmit = async (values: InterviewFormValues): Promise<void> => {
    setError(null);
    try {
      await api(`/api/applications/${view.id}/interviews`, {
        method: 'POST',
        body: {
          stage: values.stage.trim(),
          format: values.format,
          scheduledAt: new Date(values.scheduledAt).toISOString(),
          notes: null,
        },
      });
      form.reset({ stage: '', format: 'video', scheduledAt: '' });
      onChange();
      void reload();
    } catch {
      setError('Add the stage and a date and time.');
    }
  };

  return (
    <section className="follow-ups" aria-labelledby="int-title">
      <h3 id="int-title">Interviews</h3>
      <p>
        <Link href={`/applications/${view.id}/prep`}>Prepare for interviews</Link>
      </p>
      {list.length > 0 && (
        <ul className="disclosures" data-testid="interviews">
          {list.map((i) => (
            <li key={i.id}>
              {i.stage} · {formatDateTime(i.scheduledAt)} · {i.format.replace('_', '-')} ·{' '}
              <button
                type="button"
                className="button button--small button--quiet"
                onClick={() =>
                  downloadInterviewIcs({ interview: i, employer: view.job.employer, jobTitle: view.job.title })
                }
                title="Download .ics calendar file"
              >
                📅 .ics
              </button>{' '}
              <label className="visually-hidden" htmlFor={`int-${i.id}`}>
                Outcome of {i.stage}
              </label>
              <select
                id={`int-${i.id}`}
                value={i.outcome}
                onChange={async (e) => {
                  await api(`/api/interviews/${i.id}`, { method: 'PUT', body: { outcome: e.target.value } }).catch(() =>
                    setError('Could not update.'),
                  );
                  void reload();
                }}
              >
                {Object.entries(OUTCOME_TEXT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {canSchedule ? (
        <Form {...form}>
          <form className="fu-form space-y-2" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="stage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="int-stage">Stage</FormLabel>
                  <FormControl>
                    <Input id="int-stage" placeholder="e.g. phone screen" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="int-format">Format</FormLabel>
                  <FormControl>
                    <select
                      id="int-format"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                      {...field}
                    >
                      <option value="phone">Phone</option>
                      <option value="video">Video</option>
                      <option value="onsite">On-site</option>
                      <option value="take_home">Take-home assessment</option>
                      <option value="other">Other</option>
                    </select>
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scheduledAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="int-when">Date and time</FormLabel>
                  <FormControl>
                    <Input id="int-when" type="datetime-local" required {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button type="submit" variant="ghost" size="sm">
              Add interview
            </Button>
            {error && (
              <span role="alert" className="save-status--error block text-xs text-destructive">
                {error}
              </span>
            )}
          </form>
        </Form>
      ) : (
        <p className="muted">Interviews can be added once the application has been submitted.</p>
      )}
    </section>
  );
}
