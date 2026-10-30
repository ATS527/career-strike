import { candidateContext } from '../career/context.js';
import { getJob } from '../career/jobs.js';
import type { Db } from '../store/db.js';

/** Below this many cases in each group, no comparison or improvement claim is made. */
export const MIN_SAMPLE = 10;

const SUBMITTED = ['SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
const RESPONDED = ['RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER'];

export interface Rate {
  numerator: number;
  n: number;
  /** Null when n is zero; shown only together with n. */
  rate: number | null;
}

export interface SourceMetrics {
  source: string;
  found: number;
  closedOrStale: Rate;
  shortlisted: number;
  submitted: number;
  responded: Rate;
  interviewed: Rate;
}

export interface Metrics {
  generatedAt: string;
  totals: { found: number; shortlisted: number; submitted: number; responses: number; interviews: number; offers: number; rejections: number };
  responseRate: Rate;
  interviewRate: Rate;
  bySource: SourceMetrics[];
  daysToFirstResponse: { median: number | null; n: number };
  submittedPerWeek: { weekStart: string; count: number }[];
  recurringGaps: { skill: string; jobs: number }[];
}

const rate = (numerator: number, n: number): Rate => ({ numerator, n, rate: n === 0 ? null : numerator / n });

function reached(db: Db, appId: string, states: string[]): boolean {
  const ph = states.map(() => '?').join(',');
  return Boolean(db.prepare(`SELECT 1 FROM application_events WHERE application_id = ? AND to_state IN (${ph}) LIMIT 1`).get(appId, ...states));
}

/** Every number here is counted from stored jobs, applications and their recorded events. */
export function computeMetrics(db: Db, now = Date.now()): Metrics {
  const apps = db
    .prepare(
      `SELECT a.id, a.job_id, a.state, (SELECT MIN(s.source) FROM job_sources s WHERE s.job_id = a.job_id) AS source
       FROM applications a`,
    )
    .all() as { id: string; job_id: string; state: string; source: string }[];
  const submittedApps = apps.filter((a) => reached(db, a.id, SUBMITTED));
  const respondedApps = submittedApps.filter((a) => reached(db, a.id, RESPONDED));
  const interviewedApps = submittedApps.filter((a) => reached(db, a.id, ['INTERVIEW', 'OFFER']));
  const offers = submittedApps.filter((a) => reached(db, a.id, ['OFFER'])).length;
  const rejections = submittedApps.filter((a) => reached(db, a.id, ['REJECTED'])).length;

  const sources = db
    .prepare(
      `SELECT s.source,
         COUNT(DISTINCT j.id) AS found,
         COUNT(DISTINCT CASE WHEN j.status = 'CLOSED' OR (j.status = 'OPEN' AND j.last_verified_at < ?) THEN j.id END) AS gone,
         COUNT(DISTINCT CASE WHEN u.disposition = 'shortlisted' THEN j.id END) AS shortlisted
       FROM job_sources s JOIN jobs j ON j.id = s.job_id LEFT JOIN job_user_state u ON u.job_id = j.id
       GROUP BY s.source ORDER BY s.source`,
    )
    .all(new Date(now - 72 * 3600_000).toISOString()) as { source: string; found: number; gone: number; shortlisted: number }[];
  const bySource: SourceMetrics[] = sources.map((s) => {
    const sub = submittedApps.filter((a) => a.source === s.source);
    return {
      source: s.source,
      found: s.found,
      closedOrStale: rate(s.gone, s.found),
      shortlisted: s.shortlisted,
      submitted: sub.length,
      responded: rate(sub.filter((a) => respondedApps.includes(a)).length, sub.length),
      interviewed: rate(sub.filter((a) => interviewedApps.includes(a)).length, sub.length),
    };
  });

  // Days from the recorded submission to the first recorded response.
  const delays = respondedApps
    .map((a) => {
      const sub = db.prepare("SELECT MIN(at) FROM application_events WHERE application_id = ? AND to_state = 'SUBMITTED_CONFIRMED'").pluck().get(a.id) as string | null;
      const resp = db
        .prepare("SELECT MIN(at) FROM application_events WHERE application_id = ? AND to_state IN ('RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER', 'REJECTED')")
        .pluck()
        .get(a.id) as string | null;
      return sub && resp ? (Date.parse(resp) - Date.parse(sub)) / 864e5 : null;
    })
    .filter((d): d is number => d !== null)
    .sort((x, y) => x - y);
  const median = delays.length === 0 ? null : delays.length % 2 ? delays[(delays.length - 1) / 2]! : (delays[delays.length / 2 - 1]! + delays[delays.length / 2]!) / 2;

  const weeks: { weekStart: string; count: number }[] = [];
  const startOfWeek = (t: number): number => {
    const d = new Date(t);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5;
  };
  const thisWeek = startOfWeek(now);
  for (let i = 7; i >= 0; i--) {
    const from = thisWeek - i * 7 * 864e5;
    const to = from + 7 * 864e5;
    const count = db
      .prepare("SELECT COUNT(DISTINCT application_id) FROM application_events WHERE to_state = 'SUBMITTED_CONFIRMED' AND at >= ? AND at < ?")
      .pluck()
      .get(new Date(from).toISOString(), new Date(to).toISOString()) as number;
    weeks.push({ weekStart: new Date(from).toISOString().slice(0, 10), count });
  }

  // Required skills missing from the profile, across jobs the candidate cared about.
  const ctx = candidateContext(db);
  const interesting = db
    .prepare("SELECT job_id FROM job_user_state WHERE disposition = 'shortlisted' UNION SELECT job_id FROM applications")
    .pluck()
    .all() as string[];
  const gapCounts = new Map<string, number>();
  for (const id of interesting) {
    for (const skill of getJob(db, id, ctx)?.fitDetail?.missingRequiredSkills ?? []) gapCounts.set(skill, (gapCounts.get(skill) ?? 0) + 1);
  }

  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      found: (db.prepare('SELECT COUNT(*) FROM jobs WHERE duplicate_of IS NULL').pluck().get() as number) ?? 0,
      shortlisted: (db.prepare("SELECT COUNT(*) FROM job_user_state WHERE disposition = 'shortlisted'").pluck().get() as number) ?? 0,
      submitted: submittedApps.length,
      responses: respondedApps.length,
      interviews: interviewedApps.length,
      offers,
      rejections,
    },
    responseRate: rate(respondedApps.length, submittedApps.length),
    interviewRate: rate(interviewedApps.length, submittedApps.length),
    bySource,
    daysToFirstResponse: { median, n: delays.length },
    submittedPerWeek: weeks,
    recurringGaps: [...gapCounts.entries()].map(([skill, jobs]) => ({ skill, jobs })).sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill)).slice(0, 8),
  };
}

export interface Observation {
  kind: 'comparison' | 'insufficient';
  text: string;
}

/**
 * What may honestly be said. Comparisons need at least MIN_SAMPLE submissions in each group and
 * are described as patterns in the candidate's own data, never as causes. Nothing is inferred
 * from silence: no response is not treated as a verdict on the résumé.
 */
export function observations(m: Metrics): Observation[] {
  const out: Observation[] = [];
  const comparable = m.bySource.filter((s) => s.responded.n >= MIN_SAMPLE);
  if (comparable.length >= 2) {
    const sorted = [...comparable].sort((a, b) => (b.responded.rate ?? 0) - (a.responded.rate ?? 0));
    const best = sorted[0]!;
    const worst = sorted.at(-1)!;
    if ((best.responded.rate ?? 0) - (worst.responded.rate ?? 0) >= 0.15) {
      out.push({
        kind: 'comparison',
        text: `Applications to roles found on ${best.source} got responses ${pct(best.responded)} of the time (n=${best.responded.n}), compared with ${pct(worst.responded)} on ${worst.source} (n=${worst.responded.n}). This is a pattern in your own applications, not proof of cause.`,
      });
    }
  } else {
    out.push({
      kind: 'insufficient',
      text: `Too few submitted applications to compare sources yet: Career Strike needs at least ${MIN_SAMPLE} per source (you have ${m.bySource.map((s) => `${s.source}: ${s.submitted}`).join(', ') || 'none'}).`,
    });
  }
  if (m.totals.submitted > 0 && m.totals.responses === 0) {
    out.push({
      kind: 'insufficient',
      text: `No responses recorded yet for ${m.totals.submitted} submitted application${m.totals.submitted === 1 ? '' : 's'}. Silence is common and is not evidence about your résumé.`,
    });
  }
  return out;
}

const pct = (r: Rate): string => `${Math.round((r.rate ?? 0) * 100)}%`;
