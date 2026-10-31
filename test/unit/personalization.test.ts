import { describe, expect, it } from 'vitest';
import { addFact } from '../../src/career/profile.js';
import { syncBoard } from '../../src/career/jobs.js';
import { PersonalizationService } from '../../src/personalization/service.js';
import { openDb } from '../../src/store/db.js';
import type { NormalizedPosting } from '../../src/sources/types.js';

function posting(): NormalizedPosting {
  return {
    source: 'greenhouse', board: 'fixture', sourceJobId: '1', employer: 'Example Labs', title: 'Platform Engineer', locationText: 'Berlin, Germany',
    remotePolicy: 'hybrid', employmentType: 'full_time', department: null, salary: null,
    description: [
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: 'TypeScript and Kubernetes' },
      { type: 'item', text: '3 years of experience' },
    ],
    applyUrl: 'https://example.test/apply/1', postingUrl: 'https://example.test/jobs/1', publishedAt: null, unresolved: [],
  };
}

describe('local document personalization', () => {
  it('uses confirmed evidence only and marks a package stale after profile changes', () => {
    const db = openDb(':memory:');
    syncBoard(db, 'greenhouse', 'fixture', [posting()]);
    const jobId = db.prepare('SELECT id FROM jobs').pluck().get() as string;
    const applicationId = 'app_fixture';
    db.prepare("INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at) VALUES (?, ?, 'DRAFTED', 'manual', 1, ?, ?)")
      .run(applicationId, jobId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    addFact(db, { kind: 'skill', value: { name: 'TypeScript', years: 4, level: 'proficient' } }, 'test');
    addFact(db, { kind: 'role', value: { title: 'Software Engineer', employer: 'Example Co', startYear: 2020, endYear: null, summary: 'Built dependable developer tooling.' } }, 'test');

    const service = new PersonalizationService(db);
    const generated = service.generate(applicationId);
    expect(generated.binding.variants).toHaveLength(2);
    expect(generated.coverLetter).toContain('TypeScript');
    expect(service.bindingCurrent(applicationId, generated.binding)).toBe(true);

    const view = service.view(applicationId);
    expect(view.requirements.find((item) => item.requirement === 'TypeScript')).toMatchObject({ classification: 'STRONG_MATCH' });
    expect(view.requirements.find((item) => item.requirement === 'Kubernetes')).toMatchObject({ classification: 'MISSING' });

    addFact(db, { kind: 'skill', value: { name: 'Kubernetes', years: 1, level: 'familiar' } }, 'test');
    expect(service.bindingCurrent(applicationId, generated.binding)).toBe(false);
    expect(service.view(applicationId).stale).toBe(true);
    db.close();
  });
});
