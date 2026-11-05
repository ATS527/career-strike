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
    <section className="follow-ups" aria-labelledby="fu-title">
      <h3 id="fu-title">Follow-ups</h3>
      {open.length === 0 ? (
        <p className="muted">No reminders set.</p>
      ) : (
        <ul className="disclosures" data-testid="follow-ups">
          {open.map((f) => (
            <li key={f.id}>
              {formatDate(f.dueAt)} · {f.note}{' '}
              <button type="button" className="quiet copy" onClick={() => void close(f, 'done')}>
                Done<span className="visually-hidden"> {f.note}</span>
              </button>{' '}
              <button type="button" className="quiet copy" onClick={() => void close(f, 'dismiss')}>
                Dismiss<span className="visually-hidden"> {f.note}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Form {...form}>
        <form className="fu-form space-y-2" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="fu-note">Remind me to</FormLabel>
                <FormControl>
                  <Input id="fu-note" placeholder="e.g. email the recruiter" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="fu-due">Due date</FormLabel>
                <FormControl>
                  <Input id="fu-due" type="date" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

          <Button type="submit" variant="ghost" size="sm" className="mt-1">
            Add reminder
          </Button>
          {error && (
            <span role="alert" className="save-status--error block text-xs text-destructive">
              {error}
            </span>
          )}
        </form>
      </Form>
    </section>
  );
}
