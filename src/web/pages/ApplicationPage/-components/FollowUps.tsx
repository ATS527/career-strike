import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, type ApplicationView, api, type FollowUp } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { formatDate } from '../../../format';
import { type FollowUpFormValues, followUpSchema } from '../-schema/application';

export function FollowUps({ view, onChange }: { view: ApplicationView; onChange: () => void }) {
  const inAWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [error, setError] = useState<string | null>(null);
  const open = view.followUps.filter((f) => f.status === 'OPEN');

  const form = useForm<FollowUpFormValues>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      dueAt: inAWeek,
      note: '',
    },
  });

  const close = async (f: FollowUp, how: 'done' | 'dismiss'): Promise<void> => {
    await api(`/api/follow-ups/${f.id}/${how}`, { method: 'POST' }).catch(() => setError('Could not update.'));
    onChange();
  };

  const onSubmit = async (values: FollowUpFormValues): Promise<void> => {
    setError(null);
    try {
      await api(`/api/applications/${view.id}/follow-ups`, {
        method: 'POST',
        body: { dueAt: values.dueAt, note: values.note.trim() },
      });
      form.reset({ dueAt: inAWeek, note: '' });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? 'Add a date and a short note.' : 'Could not save.');
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="fu-title">
      <h3 id="fu-title" className="text-base font-semibold text-foreground m-0">
        Follow-ups
      </h3>
      {open.length === 0 ? (
        <p className="text-xs text-muted-foreground italic m-0">No reminders set.</p>
      ) : (
        <ul className="space-y-2 p-0 m-0 list-none text-sm text-muted-foreground" data-testid="follow-ups">
          {open.map((f) => (
            <li key={f.id} className="flex items-center gap-2 flex-wrap">
              <span>
                {formatDate(f.dueAt)} · {f.note}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => void close(f, 'done')}
              >
                Done<span className="sr-only"> {f.note}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => void close(f, 'dismiss')}
              >
                Dismiss<span className="sr-only"> {f.note}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Form {...form}>
        <form className="space-y-3 pt-2" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="fu-note" className="text-xs font-medium">
                  Remind me to
                </FormLabel>
                <FormControl>
                  <Input id="fu-note" placeholder="e.g. email the recruiter" className="h-8 text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueAt"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel htmlFor="fu-due" className="text-xs font-medium">
                  Due date
                </FormLabel>
                <FormControl>
                  <Input id="fu-due" type="date" className="h-8 text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <Button type="submit" variant="ghost" size="sm" className="h-8 text-xs">
            Add reminder
          </Button>
          {error && (
            <span role="alert" className="block text-xs text-destructive">
              {error}
            </span>
          )}
        </form>
      </Form>
    </section>
  );
}

export default FollowUps;
