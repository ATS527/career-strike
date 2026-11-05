import { z } from 'zod';

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'Invalid ID format');
export const optionalUrlSchema = z.string().url('Must be a valid URL').or(z.literal('')).optional();
