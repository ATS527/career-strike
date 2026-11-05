import { describe, expect, it } from 'vitest';
import { addEvidence } from '../../src/career/evidence.js';
import { addFact } from '../../src/career/profile.js';
import { evaluateProfileReadiness } from '../../src/career/readiness-engine.js';
import { openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';

describe('profile readiness state machine', () => {
  it('reports PROFILE_MISSING_INFORMATION for a fresh profile', () => {
    const db = openDb(':memory:');
    const report = evaluateProfileReadiness(db);
    expect(report.state).toBe('PROFILE_MISSING_INFORMATION');
    expect(report.missingRequirements).toContain('At least one confirmed past role');
    expect(report.missingRequirements).toContain('At least one confirmed skill');
    expect(report.counts.confirmedRoles).toBe(0);
    expect(report.counts.confirmedSkills).toBe(0);
    expect(report.counts.totalUnconfirmed).toBe(0);
    db.close();
  });

  it('reports PROFILE_EXTRACTED_UNCONFIRMED when unapproved facts exist', () => {
    const db = openDb(':memory:');
    // Add fact with approved=false
    db.prepare(
      `INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
    ).run('fact_1', 'skill', JSON.stringify({ name: 'TypeScript', years: 3, level: 'proficient' }), 'document');

    const report = evaluateProfileReadiness(db);
    expect(report.state).toBe('PROFILE_EXTRACTED_UNCONFIRMED');
    expect(report.counts.unconfirmedSkills).toBe(1);
    expect(report.counts.confirmedSkills).toBe(0);
    expect(report.counts.totalUnconfirmed).toBe(1);
    expect(report.summary).toContain('1 extracted fact');
    db.close();
  });

  it('reports APPLICATION_INFORMATION_INCOMPLETE when background is confirmed but contact info is missing', () => {
    const db = openDb(':memory:');
    addFact(
      db,
      {
        kind: 'role',
        value: { title: 'Staff Engineer', employer: 'Acme', startYear: 2021, endYear: null, summary: null },
      },
      'test',
    );
    addFact(db, { kind: 'skill', value: { name: 'Go', years: 4, level: 'expert' } }, 'test');

    const report = evaluateProfileReadiness(db);
    expect(report.state).toBe('APPLICATION_INFORMATION_INCOMPLETE');
    expect(report.counts.confirmedRoles).toBe(1);
    expect(report.counts.confirmedSkills).toBe(1);
    expect(report.hasContactDetails).toBe(false);
    expect(report.missingRequirements).toContain('Full name for applications');
    expect(report.missingRequirements).toContain('Email address for applications');
    db.close();
  });

  it('reports PROFILE_READY_FOR_APPLICATION_PREPARATION when background and contact info are both present', () => {
    const db = openDb(':memory:');
    addFact(
      db,
      {
        kind: 'role',
        value: { title: 'Principal Engineer', employer: 'Acme Corp', startYear: 2020, endYear: null, summary: null },
      },
      'test',
    );
    addFact(db, { kind: 'skill', value: { name: 'TypeScript', years: 5, level: 'expert' } }, 'test');
    addEvidence(
      db,
      {
        kind: 'project',
        value: { name: 'Career Strike', summary: 'Local career workspace', skills: ['TypeScript'], url: null },
      },
      'test',
    );

    // Set contact info
    setSetting(db, 'identity.fullName', 'Ada Lovelace', 'test');
    setSetting(db, 'identity.email', 'ada@example.com', 'test');
    setSetting(db, 'candidate.linkedinUrl', 'https://www.linkedin.com/in/ada-lovelace', 'test');

    const report = evaluateProfileReadiness(db);
    expect(report.state).toBe('PROFILE_READY_FOR_APPLICATION_PREPARATION');
    expect(report.counts.confirmedRoles).toBe(1);
    expect(report.counts.confirmedSkills).toBe(1);
    expect(report.counts.confirmedEvidence).toBe(1);
    expect(report.hasContactDetails).toBe(true);
    expect(report.hasLinkedInUrl).toBe(true);
    expect(report.missingRequirements).toEqual([]);
    db.close();
  });
});
