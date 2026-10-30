import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { candidateContext } from '../career/context.js';
import { getJob } from '../career/jobs.js';
import type { Logger } from '../core/log.js';
import { nullLogger } from '../core/log.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import type { DocumentVault } from '../vault/documents.js';
import type { SecretStore } from '../vault/secrets.js';
import { buildDraft, factGuard, type FormQuestion, type GuardWarning, type Identity } from './drafts.js';
import { ApplicationPayload, disclosures, identityHash, missingRequired, payloadHash } from './payload.js';
import { allowedTransitions, type ApplicationState, canTransition, TransitionError } from './states.js';

export const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class ApplicationError extends Error {
  constructor(
    readonly code:
      | 'JOB_NOT_FOUND'
      | 'JOB_CLOSED'
      | 'ALREADY_EXISTS'
      | 'NOT_FOUND'
      | 'INCOMPLETE'
      | 'STALE_REVIEW'
      | 'WARNINGS_NOT_ACKNOWLEDGED'
      | 'NOT_EDITABLE'
      | 'INVALID_CHANGE'
      | 'APPROVAL_INVALID'
      | 'NOT_AUTOMATABLE'
      | 'DUPLICATE',
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

export interface ApprovalStatus {
  id: string;
  state: 'ACTIVE' | 'CONSUMED' | 'INVALIDATED' | 'EXPIRED' | 'REVOKED';
  version: number;
  payloadHash: string;
  issuedAt: string;
  expiresAt: string;
  stateReason: string | null;
}

export interface ApprovalCheck {
  valid: boolean;
  reason: string;
  approval: ApprovalStatus | null;
}

export interface ApplicationView {
  id: string;
  jobId: string;
  state: ApplicationState;
  mode: 'manual' | 'assisted' | 'automated';
  version: number;
  payload: ApplicationPayload;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
  job: { title: string; employer: string; status: string };
  versions: { version: number; createdBy: string; reason: string; createdAt: string; payloadHash: string }[];
  events: { from: string | null; to: string; actor: string; note: string | null; evidence: unknown; at: string }[];
  followUps: FollowUp[];
  /** Other applications for the same role (same employer, title and place), whatever their source. */
  duplicateRisk: { applicationId: string; state: ApplicationState; source: string }[];
  approval: ApprovalCheck;
  warnings: GuardWarning[];
  missingRequired: string[];
  disclosures: string[];
  allowedTransitions: readonly ApplicationState[];
}

export interface ApplicationSummary {
  id: string;
  jobId: string;
  state: ApplicationState;
  title: string;
  employer: string;
  version: number;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  applicationId: string;
  dueAt: string;
  note: string;
  status: 'OPEN' | 'DONE' | 'DISMISSED';
  createdAt: string;
  closedAt: string | null;
}

/** Outcomes recorded after submission, each with what the candidate observed. */
export type Outcome = 'RESPONSE_RECEIVED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN' | 'CLOSED';

export interface ChangeSet {
  fields?: { key: string; value: string | null }[];
  coverLetter?: string | null;
  resumeDocumentId?: string | null;
  method?: 'manual' | 'assisted';
}

interface AppRow {
  id: string;
  job_id: string;
  state: ApplicationState;
  mode: 'manual' | 'assisted' | 'automated';
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface ApprovalRow {
  id: string;
  application_id: string;
  version: number;
  payload_hash: string;
  destination: string;
  identity_hash: string;
  nonce: string;
  issued_at: string;
  expires_at: string;
  mac: string;
  state: ApprovalStatus['state'];
  state_reason: string | null;
  consumed_at: string | null;
}

export class ApplicationService {
  constructor(
    private readonly db: Db,
    private readonly secrets: SecretStore,
    private readonly vault: DocumentVault,
    private readonly questionsFor: (jobId: string) => Promise<FormQuestion[] | null>,
    private readonly logger: Logger = nullLogger,
    /** Which delivery method a job's application link allows; only the owned practice endpoint is automatable. */
    private readonly methodFor: (applyUrl: string | null) => 'manual' | 'test-ats' = () => 'manual',
  ) {}

  // ---- reading ----

  list(): ApplicationSummary[] {
    return (
      this.db
        .prepare(
          `SELECT a.id, a.job_id, a.state, a.current_version, a.updated_at, j.title, j.employer
           FROM applications a JOIN jobs j ON j.id = a.job_id ORDER BY a.updated_at DESC`,
        )
        .all() as { id: string; job_id: string; state: ApplicationState; current_version: number; updated_at: string; title: string; employer: string }[]
    ).map((r) => ({ id: r.id, jobId: r.job_id, state: r.state, title: r.title, employer: r.employer, version: r.current_version, updatedAt: r.updated_at }));
  }

  byJob(jobId: string): string | null {
    return (this.db.prepare('SELECT id FROM applications WHERE job_id = ?').pluck().get(jobId) as string | undefined) ?? null;
  }

  async get(id: string): Promise<ApplicationView | null> {
    const app = this.row(id);
    if (!app) return null;
    const { payload, hash } = this.version(id, app.current_version);
    const job = this.db.prepare('SELECT title, employer, status FROM jobs WHERE id = ?').get(app.job_id) as { title: string; employer: string; status: string };
    const profile = candidateContext(this.db).profile!;
    const texts = [payload.coverLetter ?? '', ...payload.fields.filter((f) => f.kind === 'long_text' && f.key !== 'cover_letter_text').map((f) => f.value ?? '')];
    const warnings = dedupe(texts.flatMap((t) => factGuard(t, profile)));
    return {
      id: app.id,
      jobId: app.job_id,
      state: app.state,
      mode: app.mode,
      version: app.current_version,
      payload,
      payloadHash: hash,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
      job,
      versions: (
        this.db
          .prepare('SELECT version, created_by, reason, created_at, payload_hash FROM application_versions WHERE application_id = ? ORDER BY version DESC')
          .all(id) as { version: number; created_by: string; reason: string; created_at: string; payload_hash: string }[]
      ).map((v) => ({ version: v.version, createdBy: v.created_by, reason: v.reason, createdAt: v.created_at, payloadHash: v.payload_hash })),
      events: (
        this.db.prepare('SELECT from_state, to_state, actor, note, evidence_json, at FROM application_events WHERE application_id = ? ORDER BY id').all(id) as {
          from_state: string | null;
          to_state: string;
          actor: string;
          note: string | null;
          evidence_json: string | null;
          at: string;
        }[]
      ).map((e) => ({ from: e.from_state, to: e.to_state, actor: e.actor, note: e.note, evidence: e.evidence_json ? JSON.parse(e.evidence_json) : null, at: e.at })),
      followUps: this.followUps(id),
      duplicateRisk: (
        this.db
          .prepare(
            `SELECT a.id, a.state, (SELECT group_concat(DISTINCT s.source) FROM job_sources s WHERE s.job_id = j.id) AS source
             FROM applications a JOIN jobs j ON j.id = a.job_id
             WHERE j.duplicate_key = (SELECT duplicate_key FROM jobs WHERE id = ?) AND a.id != ? AND a.state NOT IN ('CANCELLED', 'EXPIRED', 'DUPLICATE')`,
          )
          .all(app.job_id, id) as { id: string; state: ApplicationState; source: string | null }[]
      ).map((r) => ({ applicationId: r.id, state: r.state, source: r.source ?? 'manual' })),
      approval: await this.verifyApproval(id),
      warnings,
      missingRequired: missingRequired(payload),
      disclosures: disclosures(payload),
      allowedTransitions: allowedTransitions(app.state),
    };
  }

  // ---- drafting ----

  async create(jobId: string, actor: string): Promise<string> {
    const ctx = candidateContext(this.db);
    const job = getJob(this.db, jobId, ctx);
    if (!job) throw new ApplicationError('JOB_NOT_FOUND', 'That job does not exist.');
    if (job.status === 'CLOSED') throw new ApplicationError('JOB_CLOSED', 'This posting has closed, so there is nothing to apply to.');
    const existing = this.byJob(jobId);
    if (existing) throw new ApplicationError('ALREADY_EXISTS', 'You already have an application for this job.', { applicationId: existing });

    let questions: FormQuestion[] | null = null;
    try {
      questions = await this.questionsFor(jobId);
    } catch (err) {
      // The form could not be read; fall back to the standard fields rather than guessing.
      this.logger.warn('applications.questions-unavailable', { jobId, message: err instanceof Error ? err.message : String(err) });
    }
    const settings = getSettings(this.db);
    const resume = this.vault.list().find((d) => d.kind === 'resume') ?? null;
    const canonicalKey = this.db.prepare('SELECT canonical_key FROM jobs WHERE id = ?').pluck().get(jobId) as string;
    const { payload } = buildDraft(
      {
        job: { id: job.id, canonicalKey, employer: job.employer, title: job.title, applyUrl: job.applyUrl },
        questions,
        identity: identityFrom(settings),
        profile: ctx.profile!,
        fit: job.fitDetail ?? null,
        joiningAvailability: String(settings['candidate.joiningAvailability'] ?? 'unspecified'),
        resume,
      },
      this.methodFor(job.applyUrl),
    );

    const id = `app_${randomBytes(9).toString('base64url')}`;
    const at = new Date().toISOString();
    const reason = questions ? 'First draft from your approved profile and the employer’s published form' : 'First draft from your approved profile';
    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO applications (id, job_id, state, mode, current_version, created_at, updated_at) VALUES (?, ?, 'DRAFTED', ?, 1, ?, ?)")
        .run(id, jobId, payload.destination.method === 'test-ats' ? 'automated' : 'manual', at, at);
      this.insertVersion(id, 1, payload, 'career-strike', reason, at);
      this.event(id, null, 'DRAFTED', actor, reason, at);
    })();
    return id;
  }

  /**
   * Save a new version. Any change to what would be submitted invalidates an existing approval
   * and returns the application to DRAFTED: approval always covers exactly one version.
   */
  async update(id: string, changes: ChangeSet, actor: string, reason = 'Edited by you'): Promise<void> {
    const app = this.requireRow(id);
    if (!['DRAFTED', 'NEEDS_INFORMATION', 'READY_FOR_REVIEW', 'APPROVED', 'BLOCKED'].includes(app.state)) {
      throw new ApplicationError('NOT_EDITABLE', `An application in state ${app.state} can no longer be edited.`);
    }
    const { payload: current, hash: currentHash } = this.version(id, app.current_version);
    const next: ApplicationPayload = structuredClone(current);

    for (const change of changes.fields ?? []) {
      const field = next.fields.find((f) => f.key === change.key);
      if (!field) throw new ApplicationError('INVALID_CHANGE', `There is no field “${change.key}” on this application.`);
      if (field.kind === 'file') throw new ApplicationError('INVALID_CHANGE', 'Choose files with the document picker.');
      if (field.kind === 'choice' && change.value !== null && field.options.length && !field.options.includes(change.value)) {
        throw new ApplicationError('INVALID_CHANGE', `“${change.value}” is not one of the employer’s options.`);
      }
      field.value = change.value === null || change.value.trim() === '' ? null : change.value;
      field.source = field.value === null ? 'empty' : 'candidate';
      if (field.key === 'cover_letter_text') next.coverLetter = field.value;
    }
    if (changes.coverLetter !== undefined) {
      next.coverLetter = changes.coverLetter;
      const field = next.fields.find((f) => f.key === 'cover_letter_text');
      if (field) {
        field.value = changes.coverLetter;
        field.source = changes.coverLetter ? 'candidate' : 'empty';
      }
    }
    if (changes.resumeDocumentId !== undefined) {
      next.attachments = next.attachments.filter((a) => a.kind !== 'resume');
      const resumeField = next.fields.find((f) => f.kind === 'file' && /resume|cv/i.test(`${f.key} ${f.label}`));
      if (changes.resumeDocumentId) {
        const doc = this.vault.get(changes.resumeDocumentId);
        if (!doc) throw new ApplicationError('INVALID_CHANGE', 'That document does not exist.');
        next.attachments.push({ documentId: doc.id, kind: 'resume', filename: doc.filename, sha256: doc.sha256 });
        if (resumeField) Object.assign(resumeField, { value: doc.filename, source: 'document' });
      } else if (resumeField) Object.assign(resumeField, { value: null, source: 'empty' });
    }
    if (changes.method) {
      if (next.destination.method === 'test-ats') throw new ApplicationError('INVALID_CHANGE', 'Practice applications are always submitted automatically.');
      next.destination.method = changes.method;
    }

    const parsed = ApplicationPayload.safeParse(next);
    if (!parsed.success) throw new ApplicationError('INVALID_CHANGE', 'That change is not valid.', parsed.error.issues);
    if (payloadHash(parsed.data) === currentHash) return;

    const version = app.current_version + 1;
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.insertVersion(id, version, parsed.data, actor, reason, at);
      const mode = parsed.data.destination.method === 'test-ats' ? 'automated' : parsed.data.destination.method;
      this.db.prepare('UPDATE applications SET current_version = ?, mode = ?, updated_at = ? WHERE id = ?').run(version, mode, at, id);
      this.invalidateApprovals(id, `Version ${version} changed what would be submitted`, 'INVALIDATED');
      if (app.state === 'READY_FOR_REVIEW' || app.state === 'APPROVED') this.transition(id, app.state, 'DRAFTED', actor, 'Edited after review; needs a fresh review', at);
    })();
  }

  // ---- review ----

  markReady(id: string, actor: string): void {
    const app = this.requireRow(id);
    const { payload } = this.version(id, app.current_version);
    const missing = missingRequired(payload);
    if (missing.length) throw new ApplicationError('INCOMPLETE', `Fill in the required items first: ${missing.join(', ')}.`, { missing });
    if (!payload.destination.url) throw new ApplicationError('INCOMPLETE', 'This job has no official application link to send you to.');
    this.db.transaction(() => this.transition(id, app.state, 'READY_FOR_REVIEW', actor, 'Ready for your review', new Date().toISOString()))();
  }

  /** After a failed submission, start again from a draft. A new approval will be required. */
  redraft(id: string, actor: string): void {
    const app = this.requireRow(id);
    if (app.state !== 'SUBMISSION_FAILED') throw new TransitionError(app.state, 'DRAFTED');
    this.db.transaction(() => this.transition(id, app.state, 'DRAFTED', actor, 'Prepared again after a failed submission; needs a new approval', new Date().toISOString()))();
  }

  saveForLater(id: string, actor: string): void {
    const app = this.requireRow(id);
    this.db.transaction(() => this.transition(id, app.state, 'DRAFTED', actor, 'Saved for later', new Date().toISOString()))();
  }

  reject(id: string, actor: string, note: string | null): void {
    const app = this.requireRow(id);
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.invalidateApprovals(id, 'Application rejected at review', 'REVOKED');
      this.transition(id, app.state, 'CANCELLED', actor, note ? `Rejected at review: ${note}` : 'Rejected at review', at);
    })();
  }

  /**
   * Approve exactly the version and payload hash the candidate reviewed. The approval is bound by
   * an HMAC (key in the OS keychain) over the version, payload hash, destination and identity, and
   * can be used once. Only the dashboard can call this.
   */
  async approve(id: string, reviewed: { version: number; payloadHash: string; acknowledgeWarnings: boolean }, actor: string): Promise<ApprovalStatus> {
    const view = await this.get(id);
    if (!view) throw new ApplicationError('NOT_FOUND', 'Application not found.');
    if (!canTransition(view.state, 'APPROVED')) throw new TransitionError(view.state, 'APPROVED');
    if (reviewed.version !== view.version || reviewed.payloadHash !== view.payloadHash) {
      throw new ApplicationError('STALE_REVIEW', 'The application changed after you reviewed it. Review the current version.');
    }
    if (view.warnings.length > 0 && !reviewed.acknowledgeWarnings) {
      throw new ApplicationError('WARNINGS_NOT_ACKNOWLEDGED', 'Confirm the flagged statements are accurate before approving.', view.warnings);
    }
    const key = await this.secrets.getOrCreate('approval-key');
    const issued = new Date();
    const row = {
      id: `apv_${randomBytes(9).toString('base64url')}`,
      application_id: id,
      version: view.version,
      payload_hash: view.payloadHash,
      destination: destinationKey(view.payload),
      identity_hash: identityHash(view.payload),
      nonce: randomBytes(16).toString('hex'),
      issued_at: issued.toISOString(),
      expires_at: new Date(issued.getTime() + APPROVAL_TTL_MS).toISOString(),
    };
    const mac = computeMac(key, row);
    this.db.transaction(() => {
      this.invalidateApprovals(id, 'Superseded by a new approval', 'INVALIDATED');
      this.db
        .prepare(
          `INSERT INTO approvals (id, application_id, version, payload_hash, destination, identity_hash, nonce, issued_at, expires_at, mac, state)
           VALUES (@id, @application_id, @version, @payload_hash, @destination, @identity_hash, @nonce, @issued_at, @expires_at, @mac, 'ACTIVE')`,
        )
        .run({ ...row, mac });
      this.transition(id, view.state, 'APPROVED', actor, `Approved version ${view.version}`, row.issued_at);
    })();
    return (await this.verifyApproval(id)).approval!;
  }

  /**
   * Check that the active approval still covers exactly what would be submitted now. Used before
   * any submission; any doubt makes it invalid.
   */
  async verifyApproval(id: string, now = Date.now()): Promise<ApprovalCheck> {
    const app = this.row(id);
    if (!app) return { valid: false, reason: 'Application not found.', approval: null };
    const latest = this.db.prepare('SELECT * FROM approvals WHERE application_id = ? ORDER BY issued_at DESC, rowid DESC LIMIT 1').get(id) as
      | ApprovalRow
      | undefined;
    if (!latest) return { valid: false, reason: 'Not approved.', approval: null };
    const status = toStatus(latest);
    if (latest.state !== 'ACTIVE') return { valid: false, reason: `Approval is ${latest.state.toLowerCase()}${latest.state_reason ? `: ${latest.state_reason}` : ''}.`, approval: status };
    if (Date.parse(latest.expires_at) <= now) {
      this.db.prepare("UPDATE approvals SET state = 'EXPIRED', state_reason = 'Approval is older than 7 days' WHERE id = ? AND state = 'ACTIVE'").run(latest.id);
      return { valid: false, reason: 'Approval expired. Review and approve again.', approval: { ...status, state: 'EXPIRED' } };
    }
    const key = await this.secrets.getOrCreate('approval-key');
    if (!macMatches(key, latest)) return { valid: false, reason: 'Approval signature does not verify; it was not issued by this Career Strike.', approval: status };
    if (latest.version !== app.current_version) return { valid: false, reason: 'Approval covers an older version.', approval: status };
    // Re-hash the stored payload so a modified record cannot borrow an earlier approval.
    let current: { payload: ApplicationPayload; hash: string };
    try {
      current = this.version(id, app.current_version);
    } catch {
      return { valid: false, reason: 'The approved version is unreadable.', approval: status };
    }
    if (current.hash !== latest.payload_hash) return { valid: false, reason: 'What would be submitted differs from what was approved.', approval: status };
    if (destinationKey(current.payload) !== latest.destination) return { valid: false, reason: 'The destination differs from the approved one.', approval: status };
    if (identityHash(current.payload) !== latest.identity_hash) return { valid: false, reason: 'The identity differs from the approved one.', approval: status };
    return { valid: true, reason: 'Approval matches exactly what would be submitted.', approval: status };
  }

  // ---- submission and tracking ----

  /**
   * The candidate is about to submit on the employer's site. The approval is verified and consumed
   * in the same transaction (single use), so a second attempt cannot reuse it.
   */
  async startManualSubmission(id: string, actor: string): Promise<void> {
    const app = this.requireRow(id);
    if (this.version(id, app.current_version).payload.destination.method === 'test-ats') {
      throw new ApplicationError('INVALID_CHANGE', 'Practice applications are submitted automatically, not by hand.');
    }
    const check = await this.verifyApproval(id);
    if (!check.valid || !check.approval) throw new ApplicationError('APPROVAL_INVALID', `Cannot submit: ${check.reason}`);
    const at = new Date().toISOString();
    this.db.transaction(() => {
      const consumed = this.db
        .prepare("UPDATE approvals SET state = 'CONSUMED', consumed_at = ?, state_reason = 'Used for a manual submission' WHERE id = ? AND state = 'ACTIVE'")
        .run(at, check.approval!.id).changes;
      if (consumed !== 1) throw new ApplicationError('APPROVAL_INVALID', 'Cannot submit: this approval has already been used.');
      this.transition(id, app.state, 'NEEDS_MANUAL_ACTION', actor, `Submitting version ${app.current_version} on the employer’s site`, at, {
        approvalId: check.approval!.id,
        payloadHash: check.approval!.payloadHash,
      });
    })();
  }

  // ---- automated submission (owned practice endpoint only) ----

  /**
   * Begin an automated submission: verify the approval, refuse duplicates, then in one transaction
   * consume the approval, record the attempt (unique per approval) and enter SUBMISSION_IN_PROGRESS.
   * Delivery happens afterwards; its outcome is recorded with finishAttempt.
   */
  async beginAutomatedSubmission(
    id: string,
    endpoint: string,
    actor: string,
  ): Promise<{ attemptId: string; idempotencyKey: string; payload: ApplicationPayload; payloadHash: string }> {
    const app = this.requireRow(id);
    const { payload, hash } = this.version(id, app.current_version);
    if (payload.destination.method !== 'test-ats') {
      throw new ApplicationError('NOT_AUTOMATABLE', 'Real employers do not allow automated submission. Submit it on their site.');
    }
    const duplicate = this.db
      .prepare(
        `SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE j.duplicate_key = (SELECT duplicate_key FROM jobs WHERE id = ?) AND a.id != ?
           AND a.state IN ('SUBMISSION_IN_PROGRESS', 'SUBMITTED_CONFIRMED', 'SUBMISSION_UNCONFIRMED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER')`,
      )
      .pluck()
      .get(app.job_id, id) as string | undefined;
    if (duplicate) {
      this.db.transaction(() => {
        this.invalidateApprovals(id, 'Duplicate of an application already submitted', 'REVOKED');
        this.transition(id, app.state, 'DUPLICATE', 'career-strike', 'You already submitted an application for this role', new Date().toISOString(), { duplicateOf: duplicate });
      })();
      throw new ApplicationError('DUPLICATE', 'You have already submitted an application for this role, so this one was not sent.', { duplicateOf: duplicate });
    }
    const check = await this.verifyApproval(id);
    if (!check.valid || !check.approval) throw new ApplicationError('APPROVAL_INVALID', `Cannot submit: ${check.reason}`);
    const attemptId = `sub_${randomBytes(9).toString('base64url')}`;
    const at = new Date().toISOString();
    this.db.transaction(() => {
      const consumed = this.db
        .prepare("UPDATE approvals SET state = 'CONSUMED', consumed_at = ?, state_reason = 'Used for an automated submission' WHERE id = ? AND state = 'ACTIVE'")
        .run(at, check.approval!.id).changes;
      if (consumed !== 1) throw new ApplicationError('APPROVAL_INVALID', 'Cannot submit: this approval has already been used.');
      this.db
        .prepare("INSERT INTO submission_attempts (id, application_id, approval_id, endpoint, state, started_at) VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?)")
        .run(attemptId, id, check.approval!.id, endpoint, at);
      this.transition(id, app.state, 'SUBMISSION_IN_PROGRESS', actor, `Submitting version ${app.current_version} to ${new URL(endpoint).host}`, at, {
        attemptId,
        approvalId: check.approval!.id,
        payloadHash: hash,
      });
    })();
    // The approval id is the idempotency key: the endpoint can recognise any repeat of this attempt.
    return { attemptId, idempotencyKey: check.approval.id, payload, payloadHash: hash };
  }

  /** Record what delivery achieved. Only a verified receipt confirms; ambiguity stays unconfirmed. */
  finishAttempt(attemptId: string, outcome: { state: 'CONFIRMED'; receipt: unknown } | { state: 'UNCONFIRMED' | 'FAILED'; error: string }, actor = 'career-strike'): void {
    const attempt = this.db.prepare('SELECT application_id, state FROM submission_attempts WHERE id = ?').get(attemptId) as
      | { application_id: string; state: string }
      | undefined;
    if (!attempt) throw new ApplicationError('NOT_FOUND', 'Submission attempt not found.');
    const app = this.requireRow(attempt.application_id);
    const at = new Date().toISOString();
    const to: ApplicationState = outcome.state === 'CONFIRMED' ? 'SUBMITTED_CONFIRMED' : outcome.state === 'FAILED' ? 'SUBMISSION_FAILED' : 'SUBMISSION_UNCONFIRMED';
    const note =
      outcome.state === 'CONFIRMED'
        ? 'The endpoint returned a receipt, verified by looking it up'
        : outcome.state === 'FAILED'
          ? `Not submitted: ${outcome.error}`
          : `Outcome unknown: ${outcome.error}. It will not be resent automatically.`;
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE submission_attempts SET state = ?, ended_at = ?, receipt_json = ?, error = ? WHERE id = ?')
        .run(outcome.state, at, outcome.state === 'CONFIRMED' ? JSON.stringify(outcome.receipt) : null, outcome.state === 'CONFIRMED' ? null : outcome.error, attemptId);
      if (app.state !== to) this.transition(app.id, app.state, to, actor, note, at, outcome.state === 'CONFIRMED' ? { type: 'endpoint-receipt', receipt: outcome.receipt } : null);
    })();
  }

  /** The latest attempt for reconciliation: its idempotency key and endpoint. */
  latestAttempt(id: string): { id: string; approvalId: string; endpoint: string; state: string } | null {
    const row = this.db
      .prepare('SELECT id, approval_id, endpoint, state FROM submission_attempts WHERE application_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1')
      .get(id) as { id: string; approval_id: string; endpoint: string; state: string } | undefined;
    return row ? { id: row.id, approvalId: row.approval_id, endpoint: row.endpoint, state: row.state } : null;
  }

  /** After a restart, a submission that was in flight has an unknown outcome. It is never resumed. */
  recoverInterruptedSubmissions(): number {
    const rows = this.db.prepare("SELECT id FROM submission_attempts WHERE state = 'IN_PROGRESS'").pluck().all() as string[];
    for (const attemptId of rows) this.finishAttempt(attemptId, { state: 'UNCONFIRMED', error: 'the service stopped while it was being sent' });
    return rows.length;
  }

  /** Only the candidate's explicit confirmation (with what they saw) marks a manual submission as sent. */
  confirmSubmitted(id: string, evidence: { reference: string | null; submittedAt: string; note: string | null }, actor: string): void {
    const app = this.requireRow(id);
    if (app.state !== 'NEEDS_MANUAL_ACTION' && app.state !== 'SUBMISSION_UNCONFIRMED') throw new TransitionError(app.state, 'SUBMITTED_CONFIRMED');
    const at = new Date().toISOString();
    this.db.transaction(() =>
      this.transition(id, app.state, 'SUBMITTED_CONFIRMED', actor, 'You confirmed you submitted it', at, { type: 'candidate-confirmation', ...evidence }),
    )();
  }

  markUnconfirmed(id: string, note: string | null, actor: string): void {
    const app = this.requireRow(id);
    this.db.transaction(() =>
      this.transition(id, app.state, 'SUBMISSION_UNCONFIRMED', actor, note ? `Not sure it was sent: ${note}` : 'Not sure it was sent', new Date().toISOString()),
    )();
  }

  /** Record what happened after submission, with the candidate's description of the evidence. */
  recordOutcome(id: string, outcome: Outcome, evidence: { occurredAt: string; note: string | null }, actor: string): void {
    const app = this.requireRow(id);
    this.db.transaction(() => this.transition(id, app.state, outcome, actor, evidence.note ?? OUTCOME_NOTE[outcome], new Date().toISOString(), { type: 'candidate-report', ...evidence }))();
  }

  /** Unsent applications for postings that have closed can no longer be submitted. */
  expireForClosedJobs(actor = 'career-strike'): number {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.state FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE j.status = 'CLOSED' AND a.state IN ('DRAFTED', 'NEEDS_INFORMATION', 'READY_FOR_REVIEW', 'APPROVED', 'BLOCKED')`,
      )
      .all() as { id: string; state: ApplicationState }[];
    const at = new Date().toISOString();
    this.db.transaction(() => {
      for (const r of rows) {
        this.invalidateApprovals(r.id, 'The posting closed before it was submitted', 'REVOKED');
        this.transition(r.id, r.state, 'EXPIRED', actor, 'The employer took the posting down before it was submitted', at);
      }
    })();
    return rows.length;
  }

  // ---- follow-ups ----

  addFollowUp(applicationId: string, dueAt: string, note: string, actor: string): FollowUp {
    this.requireRow(applicationId);
    const id = `fu_${randomBytes(9).toString('base64url')}`;
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO follow_ups (id, application_id, due_at, note, status, created_at) VALUES (?, ?, ?, ?, 'OPEN', ?)").run(id, applicationId, dueAt, note, at);
      this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'follow-up.added', id);
    })();
    return this.followUps(applicationId).find((f) => f.id === id)!;
  }

  closeFollowUp(id: string, status: 'DONE' | 'DISMISSED', actor: string): boolean {
    const at = new Date().toISOString();
    const changed = this.db.prepare("UPDATE follow_ups SET status = ?, closed_at = ? WHERE id = ? AND status = 'OPEN'").run(status, at, id).changes;
    if (changed) this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, `follow-up.${status.toLowerCase()}`, id);
    return changed === 1;
  }

  /** Open follow-ups across applications, soonest first, with the job they concern. */
  openFollowUps(): (FollowUp & { title: string; employer: string })[] {
    return (
      this.db
        .prepare(
          `SELECT f.*, j.title, j.employer FROM follow_ups f JOIN applications a ON a.id = f.application_id JOIN jobs j ON j.id = a.job_id
           WHERE f.status = 'OPEN' ORDER BY f.due_at`,
        )
        .all() as (FollowUpRow & { title: string; employer: string })[]
    ).map((r) => ({ ...toFollowUp(r), title: r.title, employer: r.employer }));
  }

  private followUps(applicationId: string): FollowUp[] {
    return (this.db.prepare('SELECT * FROM follow_ups WHERE application_id = ? ORDER BY due_at').all(applicationId) as FollowUpRow[]).map(toFollowUp);
  }

  /** Counts by state for the dashboard. */
  counts(): Record<ApplicationState, number> {
    const rows = this.db.prepare('SELECT state, COUNT(*) AS n FROM applications GROUP BY state').all() as { state: ApplicationState; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.state, r.n])) as Record<ApplicationState, number>;
  }

  // ---- internals ----

  private row(id: string): AppRow | undefined {
    return this.db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as AppRow | undefined;
  }

  private requireRow(id: string): AppRow {
    const row = this.row(id);
    if (!row) throw new ApplicationError('NOT_FOUND', 'Application not found.');
    return row;
  }

  /** Load a version and recompute its hash from the stored JSON rather than trusting the stored hash. */
  private version(id: string, version: number): { payload: ApplicationPayload; hash: string } {
    const row = this.db.prepare('SELECT payload_json FROM application_versions WHERE application_id = ? AND version = ?').get(id, version) as
      | { payload_json: string }
      | undefined;
    if (!row) throw new ApplicationError('NOT_FOUND', 'Application version not found.');
    const payload = ApplicationPayload.parse(JSON.parse(row.payload_json));
    return { payload, hash: payloadHash(payload) };
  }

  private insertVersion(id: string, version: number, payload: ApplicationPayload, createdBy: string, reason: string, at: string): void {
    this.db
      .prepare(
        'INSERT INTO application_versions (application_id, version, payload_json, payload_hash, created_by, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, version, JSON.stringify(payload), payloadHash(payload), createdBy, reason, at);
  }

  private invalidateApprovals(id: string, reason: string, state: 'INVALIDATED' | 'REVOKED'): void {
    this.db.prepare("UPDATE approvals SET state = ?, state_reason = ? WHERE application_id = ? AND state = 'ACTIVE'").run(state, reason, id);
  }

  private transition(id: string, from: ApplicationState, to: ApplicationState, actor: string, note: string, at: string, evidence: unknown = null): void {
    if (!canTransition(from, to)) throw new TransitionError(from, to);
    const changed = this.db.prepare('UPDATE applications SET state = ?, updated_at = ? WHERE id = ? AND state = ?').run(to, at, id, from).changes;
    if (changed !== 1) throw new TransitionError(from, to);
    this.event(id, from, to, actor, note, at, evidence);
  }

  private event(id: string, from: ApplicationState | null, to: ApplicationState, actor: string, note: string, at: string, evidence: unknown = null): void {
    this.db
      .prepare('INSERT INTO application_events (application_id, from_state, to_state, actor, note, evidence_json, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, from, to, actor, note, evidence === null ? null : JSON.stringify(evidence), at);
  }
}

const OUTCOME_NOTE: Record<Outcome, string> = {
  RESPONSE_RECEIVED: 'The employer responded',
  INTERVIEW: 'Interview arranged',
  OFFER: 'Offer received',
  REJECTED: 'The employer said no',
  WITHDRAWN: 'You withdrew',
  CLOSED: 'Closed',
};

interface FollowUpRow {
  id: string;
  application_id: string;
  due_at: string;
  note: string;
  status: FollowUp['status'];
  created_at: string;
  closed_at: string | null;
}

function toFollowUp(r: FollowUpRow): FollowUp {
  return { id: r.id, applicationId: r.application_id, dueAt: r.due_at, note: r.note, status: r.status, createdAt: r.created_at, closedAt: r.closed_at };
}

export function identityFrom(settings: Record<string, unknown>): Identity {
  return {
    fullName: (settings['identity.fullName'] as string | null) ?? null,
    email: (settings['identity.email'] as string | null) ?? null,
    phone: (settings['identity.phone'] as string | null) ?? null,
    links: (settings['identity.profileLinks'] as string[] | undefined) ?? [],
  };
}

function destinationKey(payload: ApplicationPayload): string {
  return `${payload.destination.method}:${payload.destination.url ?? ''}`;
}

type MacFields = Pick<ApprovalRow, 'id' | 'application_id' | 'version' | 'payload_hash' | 'destination' | 'identity_hash' | 'nonce' | 'issued_at' | 'expires_at'>;

function computeMac(key: Buffer, r: MacFields): string {
  const material = JSON.stringify([r.id, r.application_id, r.version, r.payload_hash, r.destination, r.identity_hash, r.nonce, r.issued_at, r.expires_at]);
  return createHmac('sha256', key).update(material).digest('hex');
}

function macMatches(key: Buffer, r: ApprovalRow): boolean {
  const expected = Buffer.from(computeMac(key, r), 'hex');
  const actual = Buffer.from(r.mac, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function toStatus(r: ApprovalRow): ApprovalStatus {
  return { id: r.id, state: r.state, version: r.version, payloadHash: r.payload_hash, issuedAt: r.issued_at, expiresAt: r.expires_at, stateReason: r.state_reason };
}

function dedupe(warnings: GuardWarning[]): GuardWarning[] {
  const seen = new Set<string>();
  return warnings.filter((w) => !seen.has(w.message) && seen.add(w.message));
}
