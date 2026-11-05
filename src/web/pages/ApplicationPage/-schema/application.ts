import { z } from 'zod';

export const followUpSchema = z.object({
  dueAt: z.string().min(1, 'Due date is required'),
  note: z.string().trim().min(1, 'Note is required'),
});

export type FollowUpFormValues = z.infer<typeof followUpSchema>;

export const interviewSchema = z.object({
  stage: z.string().trim().min(1, 'Stage is required'),
  format: z.string().min(1, 'Format is required'),
  scheduledAt: z.string().min(1, 'Scheduled date/time is required'),
});

export type InterviewFormValues = z.infer<typeof interviewSchema>;
