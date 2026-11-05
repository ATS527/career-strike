import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api, type SourceBoard, type Task } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { SOURCE_LABEL } from '../../../format';
import { type AddBoardFormValues, addBoardSchema } from '../-schema/source';

export function AddBoardForm({ onAdded }: { onAdded: (task: Task | null) => void }) {
  const [status, setStatus] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string } | { kind: 'added'; name: string }
  >({ kind: 'idle' });

  const form = useForm<AddBoardFormValues>({
    resolver: zodResolver(addBoardSchema),
    defaultValues: {
      url: '',
    },
  });

  const onSubmit = async (values: AddBoardFormValues): Promise<void> => {
    setStatus({ kind: 'saving' });
    try {
      const res = await api<{ board: SourceBoard; task: Task | null }>('/api/sources', {
        method: 'POST',
        body: { url: values.url },
      });
      form.reset();
      setStatus({ kind: 'added', name: `${SOURCE_LABEL[res.board.source]} · ${res.board.board}` });
      onAdded(res.task);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string } | null) : null;
      setStatus({ kind: 'error', message: body?.message ?? 'The board could not be added.' });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="add-board mb-6">
        <label htmlFor="board-url" className="field__label block text-sm font-medium mb-1">
          Careers page link
        </label>
        <p className="help text-xs text-muted-foreground mb-3" id="board-url-help">
          For example <code>https://jobs.lever.co/company</code>, <code>https://job-boards.greenhouse.io/company</code>{' '}
          or <code>https://jobs.ashbyhq.com/company</code>.
        </p>
        <div className="add-board__row flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem className="flex-1 w-full m-0 space-y-0">
                <FormControl>
                  <Input
                    id="board-url"
                    type="url"
                    placeholder="https://jobs.lever.co/..."
                    aria-describedby="board-url-help board-url-status"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={status.kind === 'saving' || !form.watch('url')?.trim()} className="shrink-0">
            {status.kind === 'saving' ? 'Adding…' : 'Monitor this board'}
          </Button>
        </div>
        <p
          id="board-url-status"
          role="status"
          aria-live="polite"
          className={`save-status mt-2 text-sm ${status.kind === 'error' ? 'text-destructive save-status--error' : 'text-primary save-status--saved'}`}
        >
          {status.kind === 'error' && status.message}
          {status.kind === 'added' && `Added ${status.name}. Fetching its postings now.`}
        </p>
      </form>
    </Form>
  );
}
