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
    <section className="space-y-4" aria-labelledby="int-title">
      <h3 id="int-title" className="text-base font-semibold text-foreground m-0">
        Interviews
      </h3>
      <p className="text-xs text-muted-foreground m-0">
        <Link href={`/applications/${view.id}/prep`} className="text-primary hover:underline font-medium">
          Prepare for interviews →
        </Link>
      </p>
      {list.length > 0 && (
        <ul className="space-y-2 p-0 m-0 list-none text-sm text-muted-foreground" data-testid="interviews">
          {list.map((i) => (
            <li key={i.id} className="flex items-center gap-2 flex-wrap">
              <span>
                {i.stage} · {formatDateTime(i.scheduledAt)} · {i.format.replace('_', '-')}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  downloadInterviewIcs({ interview: i, employer: view.job.employer, jobTitle: view.job.title })
                }
                title="Download .ics calendar file"
              >
                📅 .ics
              </Button>
              <label className="sr-only" htmlFor={`int-${i.id}`}>
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
                className="h-7 text-xs rounded border border-input bg-background px-2"
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
          <form className="space-y-3 pt-2" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="stage"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel htmlFor="int-stage" className="text-xs font-medium">
                    Stage
                  </FormLabel>
                  <FormControl>
                    <Input id="int-stage" placeholder="e.g. phone screen" className="h-8 text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel htmlFor="int-format" className="text-xs font-medium">
                    Format
                  </FormLabel>
                  <FormControl>
                    <select
                      id="int-format"
                      className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                <FormItem className="space-y-1">
                  <FormLabel htmlFor="int-when" className="text-xs font-medium">
                    Date and time
                  </FormLabel>
                  <FormControl>
                    <Input id="int-when" type="datetime-local" required className="h-8 text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button type="submit" variant="ghost" size="sm" className="h-8 text-xs">
              Add interview
            </Button>
            {error && (
              <span role="alert" className="block text-xs text-destructive">
                {error}
              </span>
            )}
          </form>
        </Form>
      ) : (
        <p className="text-xs text-muted-foreground italic m-0">
          Interviews can be added once the application has been submitted.
        </p>
      )}
    </section>
  );
}

export default Interviews;
