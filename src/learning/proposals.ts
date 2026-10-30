import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import { getSettings, setSetting } from '../store/settings.js';
import type { Metrics } from './metrics.js';

/**
 * The only changes a strategy proposal can make. Anything else — code, security, consent,
 * identity, approvals, AI access — is outside this list and cannot be proposed or applied.
 */
export const ProposalAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-monitoring'), hours: z.enum(['6', '12', '24']) }).strict(),
  z.object({ type: z.literal('add-preferred-role'), role: z.string().trim().min(1).max(100) }).strict(),
  z.object({ type: z.literal('study-skill'), skill: z.string().trim().min(1).max(80) }).strict(),
]);
export type ProposalAction = z.infer<typeof ProposalAction>;

export interface Proposal {
  id: string;
  rule: string;
  title: string;
  rationale: string;
  action: ProposalAction;
  status: 'OPEN' | 'ACCEPTED' | 'DISMISSED';
  createdAt: string;
  decidedAt: string | null;
}

interface Row {
  id: string;
  rule: string;
  title: string;
  rationale: string;
  action_json: string;
  status: Proposal['status'];
  created_at: string;
  decided_at: string | null;
}

const toProposal = (r: Row): Proposal => ({
  id: r.id,
  rule: r.rule,
  title: r.title,
  rationale: r.rationale,
  action: ProposalAction.parse(JSON.parse(r.action_json)),
  status: r.status,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

export class ProposalError extends Error {}

export class StrategyProposals {
  constructor(private readonly db: Db) {}

  /** Derive proposals from metrics and settings. Each idea is proposed once; dismissed stays dismissed. */
  refresh(m: Metrics): void {
    const settings = getSettings(this.db);
    const candidates: { rule: string; title: string; rationale: string; action: ProposalAction }[] = [];
    const boards = this.db.prepare('SELECT COUNT(*) FROM source_boards').pluck().get() as number;
    if (settings['monitoring.discoveryIntervalHours'] === '0' && boards > 0) {
      candidates.push({
        rule: 'monitoring-off',
        title: 'Check your job boards automatically once a day',
        rationale: `You monitor ${boards} job board${boards === 1 ? '' : 's'} but only fetch them by hand, so new postings and closures can be missed.`,
        action: { type: 'set-monitoring', hours: '24' },
      });
    }
    for (const gap of m.recurringGaps.filter((g) => g.jobs >= 3)) {
      candidates.push({
        rule: 'recurring-gap',
        title: `Plan to learn ${gap.skill}`,
        rationale: `${gap.skill} is listed as required in ${gap.jobs} jobs you shortlisted or applied to, and it is not in your profile.`,
        action: { type: 'study-skill', skill: gap.skill },
      });
    }
    // A title family that keeps getting interviews but is not among the preferred roles.
    const interviewTitles = this.db
      .prepare(
        `SELECT j.title FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE EXISTS (SELECT 1 FROM application_events e WHERE e.application_id = a.id AND e.to_state IN ('INTERVIEW', 'OFFER'))`,
      )
      .pluck()
      .all() as string[];
    const preferred = ((settings['search.preferredRoles'] as string[]) ?? []).map((r) => r.toLowerCase());
    const counts = new Map<string, number>();
    for (const t of interviewTitles) {
      const family = t.replace(/\b(senior|sr\.?|junior|jr\.?|staff|principal|lead|ii|iii)\b/gi, '').replace(/\s+/g, ' ').trim();
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    for (const [family, n] of counts) {
      if (n >= 2 && !preferred.some((p) => family.toLowerCase().includes(p))) {
        candidates.push({
          rule: 'interviewing-role',
          title: `Add “${family}” to your preferred roles`,
          rationale: `${n} applications for ${family} roles reached interviews, but it is not one of your preferred roles.`,
          action: { type: 'add-preferred-role', role: family },
        });
      }
    }
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO strategy_proposals (id, rule, fingerprint, title, rationale, action_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)",
    );
    const at = new Date().toISOString();
    for (const c of candidates) {
      const fingerprint = createHash('sha256').update(`${c.rule}:${JSON.stringify(c.action)}`).digest('hex');
      insert.run(`prop_${randomBytes(9).toString('base64url')}`, c.rule, fingerprint, c.title, c.rationale, JSON.stringify(c.action), at);
    }
  }

  list(): Proposal[] {
    return (this.db.prepare('SELECT * FROM strategy_proposals ORDER BY created_at DESC, rowid DESC').all() as Row[]).map(toProposal);
  }

  /** Apply an accepted proposal. The action is re-validated against the allowlist at this point. */
  decide(id: string, decision: 'ACCEPTED' | 'DISMISSED'): Proposal {
    const row = this.db.prepare('SELECT * FROM strategy_proposals WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new ProposalError('Proposal not found.');
    if (row.status !== 'OPEN') throw new ProposalError('This proposal has already been decided.');
    const parsed = ProposalAction.safeParse(JSON.parse(row.action_json));
    if (!parsed.success) throw new ProposalError('This proposal asks for a change Career Strike does not allow.');
    const at = new Date().toISOString();
    this.db.transaction(() => {
      if (decision === 'ACCEPTED') {
        const a = parsed.data;
        if (a.type === 'set-monitoring') setSetting(this.db, 'monitoring.discoveryIntervalHours', a.hours, 'strategy-proposal');
        if (a.type === 'add-preferred-role') {
          const roles = (getSettings(this.db)['search.preferredRoles'] as string[]) ?? [];
          if (!roles.includes(a.role)) setSetting(this.db, 'search.preferredRoles', [...roles, a.role], 'strategy-proposal');
        }
        // study-skill changes no setting: it becomes part of the learning history.
      }
      this.db.prepare('UPDATE strategy_proposals SET status = ?, decided_at = ? WHERE id = ?').run(decision, at, id);
      this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, 'dashboard', `strategy.${decision.toLowerCase()}`, id);
    })();
    return toProposal(this.db.prepare('SELECT * FROM strategy_proposals WHERE id = ?').get(id) as Row);
  }

  snapshot(m: Metrics): void {
    this.db.prepare('INSERT OR REPLACE INTO strategy_snapshots (day, metrics_json) VALUES (?, ?)').run(m.generatedAt.slice(0, 10), JSON.stringify({ totals: m.totals, responseRate: m.responseRate }));
  }

  history(): { day: string; totals: Metrics['totals']; responseRate: Metrics['responseRate'] }[] {
    return (this.db.prepare('SELECT * FROM strategy_snapshots ORDER BY day DESC LIMIT 60').all() as { day: string; metrics_json: string }[]).map((r) => ({
      day: r.day,
      ...(JSON.parse(r.metrics_json) as { totals: Metrics['totals']; responseRate: Metrics['responseRate'] }),
    }));
  }
}
