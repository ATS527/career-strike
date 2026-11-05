import { randomBytes } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { canonicalSkill } from '../matching/skills.js';
import type { Db } from '../store/db.js';
import { csvRecords } from './csv.js';

export interface LinkedInExportData {
  profile?: {
    fullName?: string;
    headline?: string;
    summary?: string;
  };
  roles: {
    title: string;
    employer: string | null;
    startYear: number;
    endYear: number | null;
    summary: string | null;
  }[];
  skills: {
    name: string;
  }[];
  education: {
    qualification: string;
    institution: string | null;
    year: number | null;
  }[];
  certifications: {
    name: string;
    issuer: string | null;
    year: number | null;
  }[];
  languages: {
    name: string;
    level: 'basic' | 'professional' | 'native';
  }[];
  projects: {
    name: string;
    summary: string;
    url: string | null;
    skills: string[];
  }[];
}

export interface LinkedInImportResult {
  imported: {
    skills: number;
    roles: number;
    education: number;
    certifications: number;
    languages: number;
    projects: number;
  };
  total: number;
  skipped: number;
  profile?: {
    fullName?: string;
    headline?: string;
    summary?: string;
  };
}

export function parseYear(val: string | undefined | null): number | null {
  if (!val) return null;
  const str = val.trim();
  if (!str || /present|current|ongoing/i.test(str)) return null;
  const match = str.match(/\b(19\d\d|20\d\d)\b/);
  if (!match) return null;
  const yr = Number.parseInt(match[1]!, 10);
  return yr >= 1950 && yr <= 2100 ? yr : null;
}

export function parseLanguageLevel(raw: string | undefined | null): 'basic' | 'professional' | 'native' {
  if (!raw) return 'professional';
  const lower = raw.trim().toLowerCase();
  if (lower.includes('native') || lower.includes('bilingual')) return 'native';
  if (lower.includes('basic') || lower.includes('elementary') || lower.includes('limited')) return 'basic';
  return 'professional';
}

function cleanUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let str = raw.trim();
  if (!str) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(str)) str = `https://${str}`;
  try {
    const u = new URL(str);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && str.length <= 2000) return str;
  } catch {}
  return null;
}

function mergePositions(data: LinkedInExportData, text: string): void {
  const records = csvRecords(text, ['title']) ?? csvRecords(text, ['company name']);
  if (!records) return;
  const thisYear = new Date().getUTCFullYear();
  for (const r of records) {
    const title = (r['title'] ?? r['job title'] ?? '').trim().slice(0, 150);
    if (!title) continue;
    const employer = (r['company name'] ?? r['company'] ?? '').trim().slice(0, 150) || null;
    let startYear = parseYear(r['started on'] ?? r['start date'] ?? r['start']);
    if (!startYear || startYear > thisYear) startYear = thisYear;
    let endYear = parseYear(r['finished on'] ?? r['end date'] ?? r['end']);
    if (endYear !== null && endYear < startYear) endYear = startYear;
    const summary = (r['description'] ?? r['summary'] ?? '').trim().slice(0, 2000) || null;
    data.roles.push({ title, employer, startYear, endYear, summary });
  }
}

function mergeSkills(data: LinkedInExportData, text: string): void {
  const records = csvRecords(text, ['name']) ?? csvRecords(text, ['skill']);
  if (!records) return;
  for (const r of records) {
    const name = (r['name'] ?? r['skill'] ?? r['skill name'] ?? '').trim().slice(0, 80);
    if (name) data.skills.push({ name });
  }
}

function mergeEducation(data: LinkedInExportData, text: string): void {
  const records =
    csvRecords(text, ['school name']) ?? csvRecords(text, ['degree name']) ?? csvRecords(text, ['institution']);
  if (!records) return;
  for (const r of records) {
    const institution = (r['school name'] ?? r['school'] ?? r['institution'] ?? '').trim().slice(0, 150) || null;
    const degree = (r['degree name'] ?? r['degree'] ?? '').trim();
    const field = (r['field of study'] ?? r['field'] ?? '').trim();
    let qualification = degree && field ? `${degree}, ${field}` : degree || field || 'Degree';
    qualification = qualification.slice(0, 150);
    const year = parseYear(r['end date'] ?? r['finished on'] ?? r['start date'] ?? r['started on']);
    data.education.push({ qualification, institution, year });
  }
}

function mergeCertifications(data: LinkedInExportData, text: string): void {
  const records = csvRecords(text, ['name']) ?? csvRecords(text, ['certification']);
  if (!records) return;
  for (const r of records) {
    const name = (r['name'] ?? r['certification'] ?? '').trim().slice(0, 150);
    if (!name) continue;
    const issuer = (r['authority'] ?? r['issuer'] ?? r['issuing organization'] ?? '').trim().slice(0, 150) || null;
    const year = parseYear(r['started on'] ?? r['start date'] ?? r['issue date']);
    data.certifications.push({ name, issuer, year });
  }
}

function mergeLanguages(data: LinkedInExportData, text: string): void {
  const records = csvRecords(text, ['name']) ?? csvRecords(text, ['language']);
  if (!records) return;
  for (const r of records) {
    const name = (r['name'] ?? r['language'] ?? '').trim().slice(0, 60);
    if (!name) continue;
    const level = parseLanguageLevel(r['proficiency']);
    data.languages.push({ name, level });
  }
}

function mergeProjects(data: LinkedInExportData, text: string): void {
  const records = csvRecords(text, ['title']) ?? csvRecords(text, ['name']);
  if (!records) return;
  for (const r of records) {
    const name = (r['title'] ?? r['name'] ?? '').trim().slice(0, 160);
    if (!name) continue;
    const summary = (r['description'] ?? name).trim().slice(0, 2000);
    const url = cleanUrl(r['url']);
    data.projects.push({ name, summary, url, skills: [] });
  }
}

function mergeProfile(data: LinkedInExportData, text: string): void {
  const records = csvRecords(text, ['first name']) ?? csvRecords(text, ['headline']) ?? csvRecords(text, ['summary']);
  if (!records || records.length === 0) return;
  const first = records[0]!;
  const firstName = (first['first name'] ?? '').trim();
  const lastName = (first['last name'] ?? '').trim();
  const headline = (first['headline'] ?? '').trim() || undefined;
  const summary = (first['summary'] ?? '').trim() || undefined;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined;
  data.profile = { fullName, headline, summary };
}

function mergeCsvData(data: LinkedInExportData, filename: string, text: string): void {
  if (filename.includes('position')) {
    mergePositions(data, text);
  } else if (filename.includes('skill')) {
    mergeSkills(data, text);
  } else if (filename.includes('education')) {
    mergeEducation(data, text);
  } else if (filename.includes('certif')) {
    mergeCertifications(data, text);
  } else if (filename.includes('language')) {
    mergeLanguages(data, text);
  } else if (filename.includes('project')) {
    mergeProjects(data, text);
  } else if (filename.includes('profile')) {
    mergeProfile(data, text);
  } else {
    // Inferred from headers when filename is ambiguous
    if (csvRecords(text, ['company name']) || csvRecords(text, ['title', 'started on'])) {
      mergePositions(data, text);
    } else if (csvRecords(text, ['school name']) || csvRecords(text, ['degree name'])) {
      mergeEducation(data, text);
    } else if (csvRecords(text, ['authority']) || csvRecords(text, ['issuing organization'])) {
      mergeCertifications(data, text);
    } else if (csvRecords(text, ['proficiency'])) {
      mergeLanguages(data, text);
    } else if (csvRecords(text, ['first name', 'last name']) || csvRecords(text, ['headline'])) {
      mergeProfile(data, text);
    } else if (csvRecords(text, ['skill']) || csvRecords(text, ['name'])) {
      mergeSkills(data, text);
    }
  }
}

export function parseLinkedInArchive(bytes: Uint8Array | Buffer): LinkedInExportData {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(u8);
  } catch {
    throw new Error('Could not read the ZIP archive. Make sure it is a valid LinkedIn data export file.');
  }

  const result: LinkedInExportData = {
    roles: [],
    skills: [],
    education: [],
    certifications: [],
    languages: [],
    projects: [],
  };

  for (const [filepath, content] of Object.entries(unzipped)) {
    const filename = filepath.split(/[/\\]/).pop()?.toLowerCase();
    if (!filename || !filename.endsWith('.csv')) continue;
    const text = strFromU8(content);
    mergeCsvData(result, filename, text);
  }

  return result;
}

export function parseLinkedInCsvText(text: string, filenameHint?: string): LinkedInExportData {
  const result: LinkedInExportData = {
    roles: [],
    skills: [],
    education: [],
    certifications: [],
    languages: [],
    projects: [],
  };
  mergeCsvData(result, (filenameHint ?? '').toLowerCase(), text);
  return result;
}

interface FactRow {
  kind: string;
  value_json: string;
}

interface EvidenceRow {
  kind: string;
  value_json: string;
}

export function importLinkedInExport(db: Db, data: LinkedInExportData, actor: string): LinkedInImportResult {
  const at = new Date().toISOString();
  const imported = { skills: 0, roles: 0, education: 0, certifications: 0, languages: 0, projects: 0 };
  let skipped = 0;

  db.transaction(() => {
    // 1. Skills
    const existingFactRows = db.prepare('SELECT kind, value_json FROM profile_facts').all() as FactRow[];
    const existingSkills = new Set<string>();
    const existingRoles = new Set<string>();
    const existingEdu = new Set<string>();
    const existingCert = new Set<string>();
    const existingLang = new Set<string>();

    for (const row of existingFactRows) {
      try {
        const val = JSON.parse(row.value_json) as Record<string, unknown>;
        if (row.kind === 'skill' && typeof val.name === 'string') {
          existingSkills.add(val.name.toLowerCase());
          const c = canonicalSkill(val.name);
          if (c) existingSkills.add(c.toLowerCase());
        } else if (row.kind === 'role') {
          const t = String(val.title ?? '').toLowerCase();
          const emp = String(val.employer ?? '').toLowerCase();
          const yr = String(val.startYear ?? '');
          existingRoles.add(`${t}|${emp}|${yr}`);
        } else if (row.kind === 'education') {
          const q = String(val.qualification ?? '').toLowerCase();
          const inst = String(val.institution ?? '').toLowerCase();
          existingEdu.add(`${q}|${inst}`);
        } else if (row.kind === 'certification') {
          const n = String(val.name ?? '').toLowerCase();
          const iss = String(val.issuer ?? '').toLowerCase();
          existingCert.add(`${n}|${iss}`);
        } else if (row.kind === 'language') {
          existingLang.add(String(val.name ?? '').toLowerCase());
        }
      } catch {}
    }

    const insertFact = db.prepare(
      "INSERT INTO profile_facts (id, kind, value_json, source, source_ref, approved, created_at, updated_at) VALUES (?, ?, ?, 'document', 'linkedin', 0, ?, ?)",
    );

    for (const skill of data.skills) {
      const norm = canonicalSkill(skill.name) ?? skill.name;
      if (existingSkills.has(norm.toLowerCase()) || existingSkills.has(skill.name.toLowerCase())) {
        skipped++;
        continue;
      }
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insertFact.run(id, 'skill', JSON.stringify({ name: norm, years: null, level: null }), at, at);
      existingSkills.add(norm.toLowerCase());
      imported.skills++;
    }

    for (const role of data.roles) {
      const key = `${role.title.toLowerCase()}|${(role.employer ?? '').toLowerCase()}|${role.startYear}`;
      if (existingRoles.has(key)) {
        skipped++;
        continue;
      }
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insertFact.run(id, 'role', JSON.stringify(role), at, at);
      existingRoles.add(key);
      imported.roles++;
    }

    for (const edu of data.education) {
      const key = `${edu.qualification.toLowerCase()}|${(edu.institution ?? '').toLowerCase()}`;
      if (existingEdu.has(key)) {
        skipped++;
        continue;
      }
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insertFact.run(id, 'education', JSON.stringify(edu), at, at);
      existingEdu.add(key);
      imported.education++;
    }

    for (const cert of data.certifications) {
      const key = `${cert.name.toLowerCase()}|${(cert.issuer ?? '').toLowerCase()}`;
      if (existingCert.has(key)) {
        skipped++;
        continue;
      }
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insertFact.run(id, 'certification', JSON.stringify(cert), at, at);
      existingCert.add(key);
      imported.certifications++;
    }

    for (const lang of data.languages) {
      const key = lang.name.toLowerCase();
      if (existingLang.has(key)) {
        skipped++;
        continue;
      }
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      insertFact.run(id, 'language', JSON.stringify(lang), at, at);
      existingLang.add(key);
      imported.languages++;
    }

    // 2. Evidence (Projects)
    const existingEvidenceRows = db.prepare('SELECT kind, value_json FROM profile_evidence').all() as EvidenceRow[];
    const existingProjects = new Set<string>();
    for (const row of existingEvidenceRows) {
      try {
        const val = JSON.parse(row.value_json) as Record<string, unknown>;
        if (row.kind === 'project' && typeof val.name === 'string') {
          existingProjects.add(val.name.toLowerCase());
        }
      } catch {}
    }

    const insertEvidence = db.prepare(
      "INSERT INTO profile_evidence (id, kind, value_json, source, source_ref, confirmed, created_at, updated_at) VALUES (?, 'project', ?, 'document', 'linkedin', 0, ?, ?)",
    );

    for (const project of data.projects) {
      const key = project.name.toLowerCase();
      if (existingProjects.has(key)) {
        skipped++;
        continue;
      }
      const id = `evidence_${randomBytes(9).toString('base64url')}`;
      insertEvidence.run(id, JSON.stringify(project), at, at);
      existingProjects.add(key);
      imported.projects++;
    }

    const total =
      imported.skills +
      imported.roles +
      imported.education +
      imported.certifications +
      imported.languages +
      imported.projects;
    db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)').run(
      at,
      actor,
      'profile.linkedin.imported',
      'linkedin',
      JSON.stringify({ imported, total, skipped }),
    );
  })();

  const total =
    imported.skills +
    imported.roles +
    imported.education +
    imported.certifications +
    imported.languages +
    imported.projects;
  return {
    imported,
    total,
    skipped,
    profile: data.profile,
  };
}
