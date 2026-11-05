import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ApplicationError, type ApplicationService } from '../applications/service.js';
import { candidateContext } from '../career/context.js';
import { getJob } from '../career/jobs.js';
import type { Db } from '../store/db.js';
import { type PrepTopic, prepTopics } from './topics.js';

export const InterviewInput = z
  .object({
    stage: z.string().trim().min(1, 'Name the stage, e.g. phone screen').max(100),
    format: z.enum(['phone', 'video', 'onsite', 'take_home', 'other']),
    scheduledAt: z.iso.datetime({ offset: true }).or(z.iso.date()),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();

export const InterviewUpdate = z
  .object({
    outcome: z.enum(['pending', 'passed', 'not_passed', 'cancelled']).optional(),
    scheduledAt: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const PracticeInput = z
  .object({
    topicId: z.string().min(1).max(120),
    confidence: z.number().int().min(1).max(5),
    minutes: z.number().int().min(1).max(600).nullable().default(null),
    notes: z.string().trim().max(5000).nullable().default(null),
  })
  .strict();

export interface Interview {
  id: string;
  applicationId: string;
  stage: string;
  format: string;
  scheduledAt: string;
  notes: string | null;
  outcome: 'pending' | 'passed' | 'not_passed' | 'cancelled';
  title?: string;
  employer?: string;
}

export interface TopicProgress extends PrepTopic {
  sessions: number;
  lastConfidence: number | null;
  lastPracticedAt: string | null;
}

interface InterviewRow {
  id: string;
  application_id: string;
  stage: string;
  format: string;
  scheduled_at: string;
  notes: string | null;
  outcome: Interview['outcome'];
  title?: string;
  employer?: string;
}

const toInterview = (r: InterviewRow): Interview => ({
  id: r.id,
  applicationId: r.application_id,
  stage: r.stage,
  format: r.format,
  scheduledAt: r.scheduled_at,
  notes: r.notes,
  outcome: r.outcome,
  ...(r.title ? { title: r.title, employer: r.employer } : {}),
});

/** States in which an interview can exist: the application was actually submitted. */
const INTERVIEWABLE = new Set(['SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER']);

export class InterviewService {
  constructor(
    private readonly db: Db,
    private readonly applications: ApplicationService,
  ) {}

  async prep(applicationId: string) {
    const app = await this.applications.get(applicationId);
    if (!app) throw new ApplicationError('NOT_FOUND', 'Application not found.');
    const job = getJob(this.db, app.jobId, candidateContext(this.db));
    if (!job) throw new ApplicationError('JOB_NOT_FOUND', 'The job for this application no longer exists.');
    const topics = prepTopics({
      title: job.title,
      employer: job.employer,
      requirements: job.requirements,
      fit: job.fitDetail ?? null,
    });
    const stats = this.db
      .prepare(
        `SELECT topic_id, COUNT(*) AS n, MAX(practiced_at) AS last_at,
           (SELECT confidence FROM practice_sessions p2 WHERE p2.application_id = p.application_id AND p2.topic_id = p.topic_id ORDER BY practiced_at DESC, rowid DESC LIMIT 1) AS last_conf
         FROM practice_sessions p WHERE application_id = ? GROUP BY topic_id`,
      )
      .all(applicationId) as { topic_id: string; n: number; last_at: string; last_conf: number }[];
    const byTopic = new Map(stats.map((s) => [s.topic_id, s]));
    const progress: TopicProgress[] = topics.map((t) => ({
      ...t,
      sessions: byTopic.get(t.id)?.n ?? 0,
      lastConfidence: byTopic.get(t.id)?.last_conf ?? null,
      lastPracticedAt: byTopic.get(t.id)?.last_at ?? null,
    }));
    const sessions = (
      this.db
        .prepare('SELECT * FROM practice_sessions WHERE application_id = ? ORDER BY practiced_at DESC LIMIT 50')
        .all(applicationId) as {
        id: string;
        topic_id: string;
        notes: string | null;
        confidence: number;
        minutes: number | null;
        practiced_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      notes: r.notes,
      confidence: r.confidence,
      minutes: r.minutes,
      practicedAt: r.practiced_at,
    }));
    return {
      application: { id: app.id, state: app.state, title: job.title, employer: job.employer },
      topics: progress,
      sessions,
      interviews: this.forApplication(applicationId),
    };
  }

  async logPractice(applicationId: string, input: z.infer<typeof PracticeInput>): Promise<void> {
    const { topics } = await this.prep(applicationId);
    if (!topics.some((t) => t.id === input.topicId))
      throw new ApplicationError('INVALID_CHANGE', 'That topic is not part of this preparation.');
    this.db
      .prepare(
        'INSERT INTO practice_sessions (id, application_id, topic_id, notes, confidence, minutes, practiced_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        `prac_${randomBytes(9).toString('base64url')}`,
        applicationId,
        input.topicId,
        input.notes,
        input.confidence,
        input.minutes,
        new Date().toISOString(),
      );
  }

  async schedule(applicationId: string, input: z.infer<typeof InterviewInput>, actor: string): Promise<Interview> {
    const app = await this.applications.get(applicationId);
    if (!app) throw new ApplicationError('NOT_FOUND', 'Application not found.');
    if (!INTERVIEWABLE.has(app.state)) {
      throw new ApplicationError(
        'INVALID_CHANGE',
        'Interviews can be recorded once the application has been submitted.',
      );
    }
    const id = `int_${randomBytes(9).toString('base64url')}`;
    const at = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO interviews (id, application_id, stage, format, scheduled_at, notes, outcome, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
        )
        .run(id, applicationId, input.stage, input.format, input.scheduledAt, input.notes, at, at);
      // An interview being arranged is itself the evidence for the INTERVIEW stage.
      if (app.state !== 'OFFER')
        this.applications.recordOutcome(
          applicationId,
          'INTERVIEW',
          { occurredAt: at.slice(0, 10), note: `Interview arranged: ${input.stage}` },
          actor,
        );
    })();
    return this.forApplication(applicationId).find((i) => i.id === id)!;
  }

  update(id: string, input: z.infer<typeof InterviewUpdate>): Interview | null {
    const row = this.db.prepare('SELECT * FROM interviews WHERE id = ?').get(id) as InterviewRow | undefined;
    if (!row) return null;
    this.db
      .prepare('UPDATE interviews SET outcome = ?, scheduled_at = ?, notes = ?, updated_at = ? WHERE id = ?')
      .run(
        input.outcome ?? row.outcome,
        input.scheduledAt ?? row.scheduled_at,
        input.notes === undefined ? row.notes : input.notes,
        new Date().toISOString(),
        id,
      );
    return toInterview(this.db.prepare('SELECT * FROM interviews WHERE id = ?').get(id) as InterviewRow);
  }

  forApplication(applicationId: string): Interview[] {
    return (
      this.db
        .prepare('SELECT * FROM interviews WHERE application_id = ? ORDER BY scheduled_at')
        .all(applicationId) as InterviewRow[]
    ).map(toInterview);
  }

  /** Pending interviews from yesterday onwards, soonest first, with their job. */
  upcoming(now = Date.now()): Interview[] {
    const since = new Date(now - 24 * 3600_000).toISOString().slice(0, 10);
    return (
      this.db
        .prepare(
          `SELECT i.*, j.title, j.employer FROM interviews i JOIN applications a ON a.id = i.application_id JOIN jobs j ON j.id = a.job_id
           WHERE i.outcome = 'pending' AND i.scheduled_at >= ? ORDER BY i.scheduled_at`,
        )
        .all(since) as InterviewRow[]
    ).map(toInterview);
  }
}
