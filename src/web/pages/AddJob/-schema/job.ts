import { z } from 'zod';

export const addJobSchema = z.object({
  title: z.string().trim().min(1, 'Job title is required'),
  employer: z.string().trim().min(1, 'Employer is required'),
  url: z.string().trim().url('Must be a valid URL').or(z.literal('')).optional(),
  location: z.string().trim().optional(),
  remotePolicy: z.enum(['unknown', 'remote', 'hybrid', 'onsite']),
  description: z.string().optional(),
});

export type AddJobFormValues = z.infer<typeof addJobSchema>;
