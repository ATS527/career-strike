import { z } from 'zod';

export const practiceLogSchema = z.object({
  confidence: z.number().min(1).max(5),
  minutes: z.string().optional(),
  notes: z.string().optional(),
});

export type PracticeLogFormValues = z.infer<typeof practiceLogSchema>;
