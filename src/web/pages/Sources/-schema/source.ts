import { z } from 'zod';

export const addBoardSchema = z.object({
  url: z.string().trim().url('Please enter a valid URL').min(1, 'Careers page link is required'),
});

export type AddBoardFormValues = z.infer<typeof addBoardSchema>;
