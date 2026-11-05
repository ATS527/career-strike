import { z } from 'zod';

export const variantEditSchema = z.object({
  content: z.string().min(1, 'Document content cannot be empty'),
});

export type VariantEditFormValues = z.infer<typeof variantEditSchema>;
