import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { confirmEvidence, listEvidence } from '../../src/career/evidence.js';
import {
  importLinkedInExport,
  parseLanguageLevel,
  parseLinkedInArchive,
  parseLinkedInCsvText,
  parseYear,
} from '../../src/career/linkedin-export.js';
import { approveAllFacts, approveFact, listFacts } from '../../src/career/profile.js';
import { openDb } from '../../src/store/db.js';

describe('LinkedIn export reader', () => {
  it('parses years across multiple formats and bounds them', () => {
    expect(parseYear('Jan 2021')).toBe(2021);
    expect(parseYear('January 2019')).toBe(2019);
    expect(parseYear('2020')).toBe(2020);
    expect(parseYear('03/2018')).toBe(2018);
    expect(parseYear('2022-05')).toBe(2022);
    expect(parseYear('Present')).toBeNull();
    expect(parseYear('Current')).toBeNull();
    expect(parseYear('')).toBeNull();
    expect(parseYear('1800')).toBeNull();
    expect(parseYear('2250')).toBeNull();
  });

  it('maps language proficiency strings', () => {
    expect(parseLanguageLevel('Native or bilingual proficiency')).toBe('native');
    expect(parseLanguageLevel('Full professional proficiency')).toBe('professional');
    expect(parseLanguageLevel('Professional working proficiency')).toBe('professional');
    expect(parseLanguageLevel('Limited working proficiency')).toBe('basic');
    expect(parseLanguageLevel('Elementary proficiency')).toBe('basic');
    expect(parseLanguageLevel(null)).toBe('professional');
  });

  it('parses a synthetic LinkedIn ZIP archive', () => {
    const archive = zipSync({
      'Positions.csv': strToU8(
        'Company Name,Title,Description,Started On,Finished On\nAcme Corp,Senior Engineer,"Built microservices",Jan 2021,Dec 2023\nBeta Co,Tech Lead,"Led team",Jan 2024,Present\n',
      ),
      'Skills.csv': strToU8('Name\nTypeScript\nKubernetes\nk8s\n'),
      'Education.csv': strToU8('School Name,Degree Name,Field Of Study,Started On,Finished On\nTech University,B.S.,Computer Science,2016,2020\n'),
      'Certifications.csv': strToU8('Name,Authority,Started On\nAWS Solutions Architect,Amazon Web Services,2022\n'),
      'Languages.csv': strToU8('Name,Proficiency\nEnglish,Native or bilingual proficiency\nGerman,Elementary proficiency\n'),
      'Projects.csv': strToU8('Title,Description,Url\nOpenSource Lib,"A fast parser",https://github.com/example/lib\n'),
      'Profile.csv': strToU8('First Name,Last Name,Headline,Summary\nJordan,Example,Staff Engineer,Passionate builder\n'),
    });

    const parsed = parseLinkedInArchive(archive);
    expect(parsed.roles).toHaveLength(2);
    expect(parsed.roles[0]).toEqual({
      title: 'Senior Engineer',
      employer: 'Acme Corp',
      startYear: 2021,
      endYear: 2023,
      summary: 'Built microservices',
    });
    expect(parsed.roles[1]?.endYear).toBeNull();

    expect(parsed.skills).toEqual([{ name: 'TypeScript' }, { name: 'Kubernetes' }, { name: 'k8s' }]);
    expect(parsed.education).toEqual([
      { qualification: 'B.S., Computer Science', institution: 'Tech University', year: 2020 },
    ]);
    expect(parsed.certifications).toEqual([
      { name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', year: 2022 },
    ]);
    expect(parsed.languages).toEqual([
      { name: 'English', level: 'native' },
      { name: 'German', level: 'basic' },
    ]);
    expect(parsed.projects).toEqual([
      { name: 'OpenSource Lib', summary: 'A fast parser', url: 'https://github.com/example/lib', skills: [] },
    ]);
    expect(parsed.profile).toEqual({
      fullName: 'Jordan Example',
      headline: 'Staff Engineer',
      summary: 'Passionate builder',
    });
  });

  it('parses individual CSV strings', () => {
    const csv = 'Company Name,Title,Started On\nStartup Inc,Founder,2020\n';
    const parsed = parseLinkedInCsvText(csv, 'Positions.csv');
    expect(parsed.roles).toHaveLength(1);
    expect(parsed.roles[0]?.title).toBe('Founder');
  });

  it('imports records as unapproved facts and unconfirmed evidence with deduplication', () => {
    const db = openDb(':memory:');
    try {
      const data = {
        roles: [{ title: 'Engineer', employer: 'Startup Inc', startYear: 2020, endYear: 2022, summary: null }],
        skills: [{ name: 'TypeScript' }, { name: 'k8s' }],
        education: [{ qualification: 'M.S.', institution: 'MIT', year: 2020 }],
        certifications: [{ name: 'Certified Dev', issuer: 'Linux Foundation', year: 2021 }],
        languages: [{ name: 'French', level: 'professional' as const }],
        projects: [{ name: 'CLI Tool', summary: 'Developer CLI', url: null, skills: [] }],
      };

      const res1 = importLinkedInExport(db, data, 'test');
      expect(res1.imported).toEqual({
        skills: 2,
        roles: 1,
        education: 1,
        certifications: 1,
        languages: 1,
        projects: 1,
      });
      expect(res1.total).toBe(7);
      expect(res1.skipped).toBe(0);

      // Check facts: all must be unapproved and have source='document', source_ref='linkedin'
      const facts = listFacts(db);
      expect(facts).toHaveLength(6);
      for (const f of facts) {
        expect(f.approved).toBe(false);
        expect(f.source).toBe('document');
      }

      // Check canonical normalization: 'k8s' was normalized to 'Kubernetes'
      const skillNames = facts.filter((f) => f.kind === 'skill').map((f) => f.value.name);
      expect(skillNames).toContain('Kubernetes');
      expect(skillNames).toContain('TypeScript');

      // Check evidence: project must be unconfirmed and source='document'
      const evidence = listEvidence(db);
      expect(evidence).toHaveLength(1);
      expect(evidence[0]?.confirmed).toBe(false);
      expect(evidence[0]?.source).toBe('document');

      // Re-importing identical data skips everything
      const res2 = importLinkedInExport(db, data, 'test');
      expect(res2.imported.skills).toBe(0);
      expect(res2.skipped).toBe(7);

      // Confirm evidence
      const confirmed = confirmEvidence(db, evidence[0]!.id, 'test');
      expect(confirmed?.confirmed).toBe(true);

      // Approve one fact
      const approvedFact = approveFact(db, facts[0]!.id, 'test');
      expect(approvedFact?.approved).toBe(true);

      // Approve remaining facts
      const remainingCount = approveAllFacts(db, 'test');
      expect(remainingCount).toBe(5);

      const allApproved = listFacts(db, { approvedOnly: true });
      expect(allApproved).toHaveLength(6);
    } finally {
      db.close();
    }
  });
});
