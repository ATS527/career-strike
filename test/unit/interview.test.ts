import { describe, expect, it } from 'vitest';
import { prepTopics } from '../../src/interview/topics.js';
import type { Fit } from '../../src/matching/fit.js';
import { extractRequirements } from '../../src/matching/requirements.js';

const req = extractRequirements('Senior Backend Engineer', [
  { type: 'paragraph', text: 'We also use Kafka.' },
  { type: 'heading', text: 'Requirements' },
  { type: 'item', text: '6+ years building APIs in TypeScript' },
  { type: 'item', text: 'Kubernetes in production' },
  { type: 'heading', text: 'Nice to have' },
  { type: 'item', text: 'Terraform' },
]);

describe('interview preparation topics', () => {
  it('lists what the posting asks for first, quoting it, and flags required skills the profile lacks', () => {
    const fit = { missingRequiredSkills: ['Kubernetes'], factors: [{ id: 'experience', verdict: 'meets' }] } as unknown as Fit;
    const topics = prepTopics({ title: 'Senior Backend Engineer', employer: 'Synthetic Labs', requirements: req, fit });
    const posting = topics.filter((t) => t.source === 'posting');
    expect(posting.map((t) => t.title)).toEqual(['Kubernetes', 'TypeScript', 'Terraform', '6+ years of relevant experience']);
    expect(posting.find((t) => t.title === 'Kubernetes')).toMatchObject({ gap: true, quote: 'Kubernetes in production' });
    expect(posting.find((t) => t.title === 'Kubernetes')!.prompts[0]).toContain('honestly');
    expect(posting.find((t) => t.title === 'TypeScript')!.gap).toBe(false);
    // Merely mentioned skills are not turned into requirements.
    expect(topics.map((t) => t.title)).not.toContain('Apache Kafka');
  });

  it('adds labelled general topics suited to the role, and system design only for senior engineering roles', () => {
    const senior = prepTopics({ title: 'Senior Backend Engineer', employer: 'X', requirements: req, fit: null });
    expect(senior.filter((t) => t.source === 'inferred').map((t) => t.id)).toEqual(['coding', 'system-design', 'behavioral', 'company']);
    const junior = prepTopics({ title: 'Junior Backend Engineer', employer: 'X', requirements: extractRequirements('Junior Backend Engineer', []), fit: null });
    expect(junior.map((t) => t.id)).not.toContain('system-design');
    const sales = prepTopics({ title: 'Account Executive', employer: 'X', requirements: extractRequirements('Account Executive', []), fit: null });
    expect(sales.map((t) => t.id)).toEqual(['behavioral', 'company']);
  });
});
