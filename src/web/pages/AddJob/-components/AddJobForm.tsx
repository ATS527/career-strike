import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api, type JobDetail, type ValidationIssue } from '../../../api';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { useNavigateTo } from '../../../router';
import { type AddJobFormValues, addJobSchema } from '../-schema/job';

const ARRANGEMENTS = [
  { value: 'unknown', label: 'Not stated' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const;

export function AddJobForm() {
  const navigate = useNavigateTo();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<AddJobFormValues>({
    resolver: zodResolver(addJobSchema),
    defaultValues: {
      title: '',
      employer: '',
      url: '',
      location: '',
      remotePolicy: 'unknown',
      description: '',
    },
  });

  const onSubmit = async (values: AddJobFormValues): Promise<void> => {
    setServerError(null);
    try {
      const body = {
        ...values,
        url: values.url?.trim() || undefined,
        location: values.location?.trim() || undefined,
      };
      const res = await api<{ job: JobDetail }>('/api/jobs', { method: 'POST', body });
      navigate(`/jobs/${res.job.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const issues = (err.body as { issues?: ValidationIssue[] } | null)?.issues ?? [];
        if (issues.length > 0) {
          for (const issue of issues) {
            const path = String(issue.path[0] ?? '');
            if (path && path in values) {
              form.setError(path as keyof AddJobFormValues, { message: issue.message });
            } else {
              setServerError(issue.message);
            }
          }
          return;
        }
      }
      setServerError('The job could not be saved. Check that the service is running.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-6" noValidate>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Senior Software Engineer" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="employer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Employer</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Acme Corp" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Link to the official posting <span className="text-muted-foreground text-xs">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input type="url" placeholder="https://..." {...field} />
              </FormControl>
              <FormDescription>Paste the employer’s page so you can find it again.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Location <span className="text-muted-foreground text-xs">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="e.g. San Francisco, CA / London / Remote" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="remotePolicy"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Work arrangement</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-4">
                  {ARRANGEMENTS.map((item) => (
                    <label key={item.value} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        value={item.value}
                        checked={field.value === item.value}
                        onChange={() => field.onChange(item.value)}
                        className="accent-primary"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Posting text <span className="text-muted-foreground text-xs">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea rows={8} placeholder="Paste the job description here..." {...field} />
              </FormControl>
              <FormDescription>
                Paste the description so it can be searched. It is stored only on this computer.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Save job'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
