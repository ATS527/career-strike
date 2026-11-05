import { z } from 'zod';

export const candidateProfileSchema = z.object({
  fullName: z.string().trim().optional(),
  headline: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  linkedinUrl: z.string().trim().url().or(z.literal('')).optional(),
  githubUrl: z.string().trim().url().or(z.literal('')).optional(),
  portfolioUrl: z.string().trim().url().or(z.literal('')).optional(),
  preferredRoles: z.array(z.string()).default([]),
  remotePref: z.string().default('remote_only'),
  targetCountries: z.array(z.string()).default([]),
  authSituation: z.enum(['unknown', 'sponsor', 'existing']).default('unknown'),
});

export type CandidateProfileFormValues = z.infer<typeof candidateProfileSchema>;

export const evidenceSchema = z.object({
  kind: z.enum(['project', 'achievement', 'portfolio', 'employment_detail']),
  name: z.string().trim().optional(),
  detail: z.string().trim().optional(),
  skills: z.string().trim().optional(),
  url: z.string().trim().url().or(z.literal('')).optional(),
  roleFactId: z.string().optional(),
});

export type EvidenceFormValues = z.infer<typeof evidenceSchema>;

export const suggestSkillsSchema = z.object({
  text: z.string().trim().min(1, 'Please paste résumé text first'),
});

export type SuggestSkillsFormValues = z.infer<typeof suggestSkillsSchema>;
