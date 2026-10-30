import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../store/db.js';
import type { TaskSupervisor } from '../supervisor/tasks.js';
import type { DocumentVault } from '../vault/documents.js';
import { ApplicationError, type ApplicationService } from './service.js';

const DELIVERY_TIMEOUT_MS = 20_000;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Automated submission, restricted to the owned practice endpoint. Real employers' application
 * APIs need the employer's own credentials, so Career Strike never submits to them automatically.
 */
export class SubmissionEngine {
  constructor(
    private readonly db: Db,
    private readonly applications: ApplicationService,
    private readonly vault: DocumentVault,
    private readonly tasks: TaskSupervisor,
    private readonly fetchImpl: Fetch = (u, i) => fetch(u, i),
  ) {}

  practiceOrigin(): string | null {
    return (this.db.prepare('SELECT origin FROM practice_endpoint WHERE id = 1').pluck().get() as string | undefined) ?? null;
  }

  /** Only a loopback http origin can be registered: the endpoint must be one the candidate runs. */
  setPracticeOrigin(origin: string): string {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search) {
      throw new ApplicationError('INVALID_CHANGE', 'The practice endpoint must be an http://127.0.0.1:<port> address on this computer.');
    }
    this.db
      .prepare('INSERT INTO practice_endpoint (id, origin, created_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET origin = excluded.origin')
      .run(url.origin, new Date().toISOString());
    return url.origin;
  }

  methodFor(applyUrl: string | null): 'manual' | 'test-ats' {
    const origin = this.practiceOrigin();
    if (!origin || !applyUrl) return 'manual';
    try {
      return new URL(applyUrl).origin === origin ? 'test-ats' : 'manual';
    } catch {
      return 'manual';
    }
  }

  /** A clearly labelled practice job whose application goes to the practice endpoint. */
  createPracticeJob(): string {
    const origin = this.practiceOrigin();
    if (!origin) throw new ApplicationError('INVALID_CHANGE', 'Start the practice endpoint first (career-strike practice).');
    const id = `job_${randomBytes(9).toString('base64url')}`;
    const at = new Date().toISOString();
    const description = [
      { type: 'paragraph', text: 'This is a practice job. Applications go to a test endpoint running on this computer; nobody receives them.' },
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: 'Willingness to try Career Strike’s submission flow' },
    ];
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, location_text, remote_policy, employment_type, description_json,
            description_text, apply_url, posting_url, status, first_seen_at, last_seen_at, unresolved_json, requirements_json, requirements_version)
           VALUES (?, ?, ?, 'Career Strike practice endpoint (not an employer)', 'Practice application', 'This computer', 'remote', 'unknown', ?, ?, ?, NULL,
            'UNVERIFIED', ?, ?, ?, NULL, 0)`,
        )
        .run(id, `practice:${id}`, `practice:${id}`, JSON.stringify(description), description.map((d) => d.text).join('\n'), `${origin}/applications`, at, at, JSON.stringify(['Practice job: not a real employer.']));
      this.db
        .prepare("INSERT INTO job_sources (job_id, source, board, source_job_id, source_url, fetched_at, content_hash) VALUES (?, 'manual', 'practice', ?, NULL, ?, ?)")
        .run(id, id, at, id);
    })();
    return id;
  }

  /** Submit an approved practice application as a supervised task. */
  async submit(applicationId: string, actor: string) {
    const origin = this.practiceOrigin();
    const view = await this.applications.get(applicationId);
    if (!view) throw new ApplicationError('NOT_FOUND', 'Application not found.');
    const endpoint = view.payload.destination.url;
    if (view.payload.destination.method !== 'test-ats' || !origin || !endpoint || new URL(endpoint).origin !== origin || new URL(endpoint).pathname !== '/applications') {
      throw new ApplicationError('NOT_AUTOMATABLE', 'Only practice applications can be submitted automatically. Submit real applications on the employer’s site.');
    }
    // Read and verify every file before anything is committed: a changed file must never be sent.
    const attachments = view.payload.attachments.map((a) => {
      let bytes: Buffer | null;
      try {
        bytes = this.vault.read(a.documentId);
      } catch {
        bytes = null;
      }
      if (!bytes || createHash('sha256').update(bytes).digest('hex') !== a.sha256) {
        throw new ApplicationError('INVALID_CHANGE', `The file ${a.filename} is missing or changed after you approved it, so nothing was sent.`);
      }
      return { filename: a.filename, sha256: a.sha256, contentBase64: bytes.toString('base64') };
    });
    const begun = await this.applications.beginAutomatedSubmission(applicationId, endpoint, actor);
    const body = {
      jobRef: begun.payload.job.canonicalKey,
      payloadHash: begun.payloadHash,
      applicant: begun.payload.identity,
      answers: begun.payload.fields.filter((f) => f.kind !== 'file').map((f) => ({ key: f.key, value: f.value })),
      coverLetter: begun.payload.coverLetter,
      attachments,
    };
    return this.tasks.start(
      { kind: `submit:${applicationId}`, dedupeKey: `submit:${applicationId}`, trigger: 'approved-submission', client: actor, params: { applicationId } },
      async (ctx) => {
        ctx.progress({ step: 'sending' });
        const outcome = await this.deliver(endpoint, begun.idempotencyKey, body);
        this.applications.finishAttempt(begun.attemptId, outcome);
        return { outcome: outcome.state };
      },
    );
  }

  private async deliver(endpoint: string, idempotencyKey: string, body: unknown) {
    let res: Response;
    try {
      res = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
    } catch (err) {
      // No response: the endpoint may or may not have received it.
      return { state: 'UNCONFIRMED' as const, error: `no response (${err instanceof Error ? err.message : String(err)})` };
    }
    if (res.status >= 400 && res.status < 500) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      return { state: 'FAILED' as const, error: data.message ?? data.error ?? `rejected with HTTP ${res.status}` };
    }
    if (!res.ok) return { state: 'UNCONFIRMED' as const, error: `the endpoint answered HTTP ${res.status}` };
    const data = (await res.json().catch(() => null)) as { receipt?: { receiptId?: string } } | null;
    const receiptId = data?.receipt?.receiptId;
    if (!receiptId) return { state: 'UNCONFIRMED' as const, error: 'the endpoint returned no receipt' };
    // A receipt counts only once it can be looked up independently.
    return this.lookup(`${new URL(endpoint).origin}/applications/${encodeURIComponent(receiptId)}`, idempotencyKey);
  }

  private async lookup(url: string, idempotencyKey: string) {
    try {
      const res = await this.fetchImpl(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS) });
      if (res.status === 404) return { state: 'FAILED' as const, error: 'the endpoint has no record of it' };
      if (!res.ok) return { state: 'UNCONFIRMED' as const, error: `the receipt could not be checked (HTTP ${res.status})` };
      const data = (await res.json()) as { receipt?: { idempotencyKey?: string } };
      if (data.receipt?.idempotencyKey !== idempotencyKey) return { state: 'UNCONFIRMED' as const, error: 'the receipt does not match this submission' };
      return { state: 'CONFIRMED' as const, receipt: data.receipt };
    } catch (err) {
      return { state: 'UNCONFIRMED' as const, error: `the receipt could not be checked (${err instanceof Error ? err.message : String(err)})` };
    }
  }

  /**
   * Resolve an unconfirmed submission by asking the endpoint about this attempt's idempotency key.
   * Never resends: if the endpoint has no record, the attempt failed and needs a fresh approval.
   */
  async reconcile(applicationId: string, actor: string): Promise<'CONFIRMED' | 'FAILED' | 'UNCONFIRMED'> {
    const view = await this.applications.get(applicationId);
    if (!view) throw new ApplicationError('NOT_FOUND', 'Application not found.');
    if (view.state !== 'SUBMISSION_UNCONFIRMED') throw new ApplicationError('INVALID_CHANGE', 'Only an unconfirmed submission can be reconciled.');
    const attempt = this.applications.latestAttempt(applicationId);
    if (!attempt || attempt.state !== 'UNCONFIRMED') throw new ApplicationError('INVALID_CHANGE', 'There is no automated attempt to reconcile; confirm it yourself instead.');
    const outcome = await this.lookup(`${new URL(attempt.endpoint).origin}/applications/by-key/${encodeURIComponent(attempt.approvalId)}`, attempt.approvalId);
    if (outcome.state === 'UNCONFIRMED') return 'UNCONFIRMED';
    this.applications.finishAttempt(attempt.id, outcome.state === 'CONFIRMED' ? { state: 'CONFIRMED', receipt: outcome.receipt } : { state: 'FAILED', error: 'the endpoint never received it' }, actor);
    return outcome.state;
  }
}
