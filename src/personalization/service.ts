import { createHash, randomBytes } from 'node:crypto';
import type { ApplicationPayload } from '../applications/payload.js';
import { listEvidence, profileFingerprint } from '../career/evidence.js';
import { listFacts } from '../career/profile.js';
import type { PostingRequirements, SkillRequirement } from '../matching/requirements.js';
import type { Db } from '../store/db.js';
import type { DocumentVariant, EvidenceClassification, PersonalizationView, RequirementMatch } from './types.js';

type VariantKind = DocumentVariant['kind'];
type VariantStatus = DocumentVariant['status'];
type Completeness = 'FULL' | 'INCOMPLETE' | 'MISSING';

interface JobRow {
  id: string;
  title: string;
  employer: string;
  description_text: string;
  requirements_json: string;
  market_json: string;
}

interface VariantRow {
  id: string;
  application_id: string;
  snapshot_id: string;
  kind: VariantKind;
  format: 'source_text';
  locale: string;
  content: string;
  content_hash: string;
  profile_fingerprint: string;
  status: VariantStatus;
  based_on_variant_id: string | null;
  created_at: string;
}

interface SnapshotRow {
  id: string;
  job_id: string;
  description_hash: string;
  completeness: Completeness;
  requirements_json: string;
  created_at: string;
}

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const id = (prefix: string): string => `${prefix}_${randomBytes(9).toString('base64url')}`;
const quote = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 300);

function localeFor(marketJson: string): string {
  try {
    const country = (JSON.parse(marketJson) as { location?: { countryCode?: string | null } }).location?.countryCode;
    if (country === 'DE') return 'de-DE';
    if (country === 'IN') return 'en-IN';
    if (country === 'SG') return 'en-SG';
    if (country === 'MY') return 'en-MY';
    if (country === 'PH') return 'en-PH';
    if (country === 'AE') return 'en-AE';
  } catch {
    // Locale is presentation guidance only; an unreadable market value is not evidence.
  }
  return 'en';
}

function toVariant(row: VariantRow, evidence: RequirementMatch[]): DocumentVariant {
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    locale: row.locale,
    content: row.content,
    contentHash: row.content_hash,
    profileFingerprint: row.profile_fingerprint,
    status: row.status,
    basedOnVariantId: row.based_on_variant_id,
    createdAt: row.created_at,
    evidence,
  };
}

/**
 * Deterministic local document preparation. Job text is treated as untrusted data: this class
 * extracts only structured requirements already stored by Career Strike and never executes or
 * follows instructions contained in a listing.
 */
export class PersonalizationService {
  constructor(private readonly db: Db) {}

  generate(applicationId: string): {
    binding: NonNullable<ApplicationPayload['personalization']>;
    coverLetter: string | null;
  } {
    const job = this.jobFor(applicationId);
    const snapshot = this.snapshot(job);
    const fingerprint = profileFingerprint(this.db);
    const requirements = JSON.parse(snapshot.requirements_json) as PostingRequirements;
    const matches = this.requirementMatches(requirements.skills);
    const locale = localeFor(job.market_json);
    const resume = this.resume(job, matches);
    const letter = this.coverLetter(job, matches);
    const at = new Date().toISOString();
    const variants: { id: string; kind: VariantKind; contentHash: string }[] = [];

    this.db.transaction(() => {
      for (const created of [resume, letter]) {
        this.db
          .prepare(
            "UPDATE document_variants SET status = 'SUPERSEDED' WHERE application_id = ? AND kind = ? AND status != 'SUPERSEDED'",
          )
          .run(applicationId, created.kind);
        const variantId = id('variant');
        const contentHash = hash(created.content);
        this.db
          .prepare(
            `INSERT INTO document_variants (id, application_id, snapshot_id, kind, format, locale, content, content_hash, profile_fingerprint, status, based_on_variant_id, created_at)
           VALUES (?, ?, ?, ?, 'source_text', ?, ?, ?, ?, 'DRAFT', NULL, ?)`,
          )
          .run(
            variantId,
            applicationId,
            snapshot.id,
            created.kind,
            locale,
            created.content,
            contentHash,
            fingerprint,
            at,
          );
        this.insertEvidence(variantId, created.evidence);
        variants.push({ id: variantId, kind: created.kind, contentHash });
      }
      this.audit('personalization.generated', applicationId, at);
    })();
    return {
      binding: { profileFingerprint: fingerprint, snapshotId: snapshot.id, variants },
      coverLetter: letter.content,
    };
  }

  edit(
    applicationId: string,
    variantId: string,
    content: string,
  ): { binding: NonNullable<ApplicationPayload['personalization']>; coverLetter: string | null } {
    const previous = this.db
      .prepare('SELECT * FROM document_variants WHERE id = ? AND application_id = ?')
      .get(variantId, applicationId) as VariantRow | undefined;
    if (!previous)
      throw new PersonalizationError('NOT_FOUND', 'That document variant does not exist for this application.');
    if (content.trim().length === 0 || content.length > 20_000)
      throw new PersonalizationError('INVALID_CONTENT', 'Document text must be between 1 and 20,000 characters.');
    const fingerprint = profileFingerprint(this.db);
    const snapshot = this.snapshotForId(previous.snapshot_id);
    const at = new Date().toISOString();
    const replacement = id('variant');
    const contentHash = hash(content);
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE document_variants SET status = 'SUPERSEDED' WHERE application_id = ? AND kind = ? AND status != 'SUPERSEDED'",
        )
        .run(applicationId, previous.kind);
      this.db
        .prepare(
          `INSERT INTO document_variants (id, application_id, snapshot_id, kind, format, locale, content, content_hash, profile_fingerprint, status, based_on_variant_id, created_at)
         VALUES (?, ?, ?, ?, 'source_text', ?, ?, ?, ?, 'CANDIDATE_EDITED', ?, ?)`,
        )
        .run(
          replacement,
          applicationId,
          snapshot.id,
          previous.kind,
          previous.locale,
          content,
          contentHash,
          fingerprint,
          previous.id,
          at,
        );
      this.audit('personalization.variant.edited', `${applicationId}:${previous.kind}`, at);
    })();
    const current = this.currentVariants(applicationId);
    return {
      binding: {
        profileFingerprint: fingerprint,
        snapshotId: snapshot.id,
        variants: current.map((v) => ({ id: v.id, kind: v.kind, contentHash: v.contentHash })),
      },
      coverLetter:
        previous.kind === 'cover_letter' ? content : (current.find((v) => v.kind === 'cover_letter')?.content ?? null),
    };
  }

  view(applicationId: string): PersonalizationView {
    const variants = this.currentVariants(applicationId);
    const snapshot = variants[0]
      ? this.snapshotForId(
          this.db
            .prepare('SELECT snapshot_id FROM document_variants WHERE id = ?')
            .pluck()
            .get(variants[0].id) as string,
        )
      : null;
    const requirements = snapshot
      ? this.requirementMatches((JSON.parse(snapshot.requirements_json) as PostingRequirements).skills)
      : [];
    const stale =
      variants.some((v) => v.profileFingerprint !== profileFingerprint(this.db)) ||
      (snapshot ? !this.snapshotCurrent(snapshot) : false);
    const warnings: string[] = [];
    if (snapshot?.completeness === 'MISSING')
      warnings.push('The job description is missing; document requirements cannot be verified.');
    if (snapshot?.completeness === 'INCOMPLETE')
      warnings.push(
        'The job description may be incomplete; paste the full employer description before relying on this package.',
      );
    if (variants.some((v) => v.status === 'CANDIDATE_EDITED'))
      warnings.push(
        'Candidate-edited text should be reviewed: only unchanged generated claims retain automatic evidence mapping.',
      );
    if (stale)
      warnings.push(
        'Your profile or the job description changed after this package was created. Generate and review a new package.',
      );
    return {
      applicationId,
      snapshot: snapshot
        ? { id: snapshot.id, completeness: snapshot.completeness, createdAt: snapshot.created_at }
        : null,
      variants,
      requirements,
      stale,
      warnings,
    };
  }

  /** Used by approval/submission safeguards: a bound document package must remain exact and current. */
  bindingCurrent(applicationId: string, binding: NonNullable<ApplicationPayload['personalization']>): boolean {
    if (binding.profileFingerprint !== profileFingerprint(this.db)) return false;
    const snapshot = this.db.prepare('SELECT * FROM job_description_snapshots WHERE id = ?').get(binding.snapshotId) as
      | SnapshotRow
      | undefined;
    if (!snapshot || !this.snapshotCurrent(snapshot)) return false;
    for (const item of binding.variants) {
      const row = this.db
        .prepare('SELECT * FROM document_variants WHERE id = ? AND application_id = ?')
        .get(item.id, applicationId) as VariantRow | undefined;
      if (
        !row ||
        row.status === 'SUPERSEDED' ||
        row.content_hash !== item.contentHash ||
        row.snapshot_id !== binding.snapshotId
      )
        return false;
    }
    return true;
  }

  private jobFor(applicationId: string): JobRow {
    const row = this.db
      .prepare(
        `SELECT j.id, j.title, j.employer, j.description_text, j.requirements_json, j.market_json
       FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`,
      )
      .get(applicationId) as JobRow | undefined;
    if (!row) throw new PersonalizationError('NOT_FOUND', 'Application not found.');
    return row;
  }

  private snapshot(job: JobRow): SnapshotRow {
    const descriptionHash = hash(job.description_text ?? '');
    const existing = this.db
      .prepare(
        'SELECT * FROM job_description_snapshots WHERE job_id = ? AND description_hash = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(job.id, descriptionHash) as SnapshotRow | undefined;
    if (existing) return existing;
    const completeness: Completeness = job.description_text.trim() ? 'FULL' : 'MISSING';
    const snapshot: SnapshotRow = {
      id: id('snapshot'),
      job_id: job.id,
      description_hash: descriptionHash,
      completeness,
      requirements_json: job.requirements_json,
      created_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        'INSERT INTO job_description_snapshots (id, job_id, description_hash, completeness, requirements_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        snapshot.id,
        snapshot.job_id,
        snapshot.description_hash,
        snapshot.completeness,
        snapshot.requirements_json,
        snapshot.created_at,
      );
    return snapshot;
  }

  private snapshotForId(snapshotId: string): SnapshotRow {
    const snapshot = this.db.prepare('SELECT * FROM job_description_snapshots WHERE id = ?').get(snapshotId) as
      | SnapshotRow
      | undefined;
    if (!snapshot) throw new PersonalizationError('NOT_FOUND', 'The job-description snapshot no longer exists.');
    return snapshot;
  }

  private snapshotCurrent(snapshot: SnapshotRow): boolean {
    const text = this.db.prepare('SELECT description_text FROM jobs WHERE id = ?').pluck().get(snapshot.job_id) as
      | string
      | undefined;
    return text !== undefined && hash(text) === snapshot.description_hash;
  }

  private requirementMatches(skills: SkillRequirement[]): RequirementMatch[] {
    const facts = listFacts(this.db, { approvedOnly: true });
    const evidence = listEvidence(this.db, { confirmedOnly: true });
    return skills.map((requirement) => {
      const skillFacts = facts.filter(
        (f) => f.kind === 'skill' && String(f.value.name).toLowerCase() === requirement.skill.toLowerCase(),
      );
      if (skillFacts.length)
        return {
          requirement: requirement.skill,
          classification: 'STRONG_MATCH',
          evidenceRefs: skillFacts.map((f) => f.id),
          explanation: `Listed in your confirmed skills. Employer evidence: ${quote(requirement.evidence)}`,
        };
      const projects = evidence.filter(
        (e) =>
          e.kind === 'project' &&
          Array.isArray(e.value.skills) &&
          e.value.skills.some((s) => String(s).toLowerCase() === requirement.skill.toLowerCase()),
      );
      if (projects.length)
        return {
          requirement: requirement.skill,
          classification: 'TRANSFERABLE_EXPERIENCE',
          evidenceRefs: projects.map((e) => e.id),
          explanation: `Named in a confirmed project. Employer evidence: ${quote(requirement.evidence)}`,
        };
      return {
        requirement: requirement.skill,
        classification: requirement.importance === 'required' ? 'MISSING' : 'UNVERIFIED',
        evidenceRefs: [],
        explanation: `No confirmed candidate evidence. Employer evidence: ${quote(requirement.evidence)}`,
      };
    });
  }

  private resume(
    job: JobRow,
    matches: RequirementMatch[],
  ): { kind: VariantKind; content: string; evidence: RequirementMatch[] } {
    const facts = listFacts(this.db, { approvedOnly: true });
    const evidence = listEvidence(this.db, { confirmedOnly: true });
    const roles = facts.filter((f) => f.kind === 'role');
    const skills = facts.filter((f) => f.kind === 'skill');
    const relevant = matches
      .filter((m) => m.classification === 'STRONG_MATCH' || m.classification === 'TRANSFERABLE_EXPERIENCE')
      .map((m) => m.requirement);
    const projects = evidence.filter((e) => e.kind === 'project').slice(0, 3);
    const achievements = evidence.filter((e) => e.kind === 'achievement').slice(0, 5);
    const lines = [
      `TARGET ROLE: ${job.title}`,
      '',
      'SUMMARY',
      relevant.length
        ? `Confirmed experience relevant to this role: ${relevant.join(', ')}.`
        : 'This tailored draft contains only confirmed profile information.',
      '',
      'SKILLS',
    ];
    lines.push(skills.map((f) => String(f.value.name)).join(', ') || '[Add confirmed skills]');
    lines.push('', 'EXPERIENCE');
    for (const role of roles) {
      const v = role.value;
      lines.push(`${v.title}${v.employer ? ` — ${v.employer}` : ''} (${v.startYear}–${v.endYear ?? 'Present'})`);
      if (v.summary) lines.push(String(v.summary));
    }
    if (projects.length) {
      lines.push('', 'SELECTED PROJECTS');
      for (const project of projects) lines.push(`${project.value.name}: ${project.value.summary}`);
    }
    if (achievements.length) {
      lines.push('', 'CONFIRMED ACHIEVEMENTS');
      for (const achievement of achievements) lines.push(`• ${achievement.value.text}`);
    }
    return { kind: 'resume', content: lines.join('\n'), evidence: matches };
  }

  private coverLetter(
    job: JobRow,
    matches: RequirementMatch[],
  ): { kind: VariantKind; content: string; evidence: RequirementMatch[] } {
    const facts = listFacts(this.db, { approvedOnly: true });
    const roles = facts.filter((f) => f.kind === 'role');
    const strong = matches.filter((m) => m.classification === 'STRONG_MATCH').map((m) => m.requirement);
    const latest = roles.at(-1);
    const body = [
      `Dear ${job.employer} hiring team,`,
      '',
      `I am applying for the ${job.title} role.`,
      latest
        ? `My confirmed experience includes work as ${latest.value.title}${latest.value.employer ? ` at ${latest.value.employer}` : ''}.`
        : 'I have included only confirmed profile information in this application package.',
      strong.length
        ? `The role highlights ${strong.join(', ')}, which are listed in my confirmed profile.`
        : 'I would welcome the chance to discuss the experience documented in my application.',
      '',
      'Kind regards,',
    ].join('\n');
    return { kind: 'cover_letter', content: body, evidence: matches };
  }

  private insertEvidence(variantId: string, matches: RequirementMatch[]): void {
    const insert = this.db.prepare(
      'INSERT INTO document_variant_evidence (variant_id, claim_index, claim_text, evidence_ref, classification) VALUES (?, ?, ?, ?, ?)',
    );
    for (const [index, match] of matches.entries()) {
      for (const ref of match.evidenceRefs) insert.run(variantId, index, match.requirement, ref, match.classification);
    }
  }

  private currentVariants(applicationId: string): DocumentVariant[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM document_variants WHERE application_id = ? AND status != 'SUPERSEDED' ORDER BY kind, created_at DESC",
      )
      .all(applicationId) as VariantRow[];
    return rows.map((row) => {
      const entries = this.db
        .prepare(
          'SELECT claim_index, claim_text, evidence_ref, classification FROM document_variant_evidence WHERE variant_id = ? ORDER BY claim_index',
        )
        .all(row.id) as {
        claim_index: number;
        claim_text: string;
        evidence_ref: string;
        classification: EvidenceClassification;
      }[];
      const grouped = new Map<number, RequirementMatch>();
      for (const entry of entries) {
        const existing = grouped.get(entry.claim_index) ?? {
          requirement: entry.claim_text,
          classification: entry.classification,
          evidenceRefs: [],
          explanation: 'Confirmed profile evidence used in this generated variant.',
        };
        existing.evidenceRefs.push(entry.evidence_ref);
        grouped.set(entry.claim_index, existing);
      }
      return toVariant(row, [...grouped.values()]);
    });
  }

  private audit(action: string, subject: string, at: string): void {
    this.db
      .prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)')
      .run(at, 'career-strike', action, subject);
  }
}

export class PersonalizationError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID_CONTENT',
    message: string,
  ) {
    super(message);
  }
}
