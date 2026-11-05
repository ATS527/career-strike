import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, type ProfileFact } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/form';
import { Textarea } from '../../../components/ui/textarea';
import { type SuggestSkillsFormValues, suggestSkillsSchema } from '../-schema/profile';

export function SuggestSkillsSection({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<string | null>(null);

  const form = useForm<SuggestSkillsFormValues>({
    resolver: zodResolver(suggestSkillsSchema),
    defaultValues: {
      text: '',
    },
  });

  const onSubmit = async (values: SuggestSkillsFormValues): Promise<void> => {
    try {
      const { suggested } = await api<{ suggested: ProfileFact[] }>('/api/profile/suggestions', {
        method: 'POST',
        body: { text: values.text },
      });
      form.reset();
      setStatus(
        suggested.length === 0
          ? 'No new skills found. Add any that are missing by hand below.'
          : `${suggested.length} skill${suggested.length === 1 ? '' : 's'} suggested below. Approve the ones that are true; nothing is used until you do.`,
      );
      onChange();
    } catch {
      setStatus('Could not read the text. Check that the service is running.');
    }
  };

  return (
    <section className="settings-group" aria-labelledby="suggest-title">
      <h2 id="suggest-title">Suggest skills from your résumé</h2>
      <p className="help">
        Paste the text of your résumé. Career Strike looks for skills it recognises, on this computer, and lists them
        for you to approve or discard. The pasted text is not saved.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="text"
            render={({ field }) => (
              <FormItem className="record__part">
                <FormLabel htmlFor="resume-text">Résumé text</FormLabel>
                <FormControl>
                  <Textarea
                    id="resume-text"
                    rows={6}
                    placeholder="Paste résumé content here..."
                    autoComplete="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="field__actions">
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Analyzing…' : 'Suggest skills'}
            </Button>
          </div>
        </form>
      </Form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
