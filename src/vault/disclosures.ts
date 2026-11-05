import { createHash, randomBytes } from 'node:crypto';
import { approvedProfile, listFacts } from '../career/profile.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';

// What an AI assistant may ask to see, one category at a time. Contact details, documents and
// application contents are deliberately not disclosable: an assistant never needs them to help.
export const DISCLOSABLE = {
  'profile.skills': 'Your approved skills, with years and level',
  'profile.experience': 'Your job titles, employers and years',
  'profile.education': 'Your qualifications',
  'profile.certifications': 'Your certifications',
  'profile.languages': 'Languages you speak',
  'profile.linkedin': 'Your LinkedIn profile address',
  'preferences.roles': 'The roles you are looking for',
  'preferences.location': 'Your country, where you can work, and remote preference',
  'preferences.salary': 'Your salary expectation',
  'preferences.availability': 'When you can start',
} as const;

export type DisclosableField = keyof typeof DISCLOSABLE;
export const DISCLOSABLE_FIELDS = Object.keys(DISCLOSABLE) as [DisclosableField, ...DisclosableField[]];

/** How long a request waits for the candidate, and how long an approved release waits for pickup. */
export const PENDING_FOR_MS = 24 * 3600_000;
export const DELIVER_WITHIN_MS = 3600_000;
const MAX_PENDING_PER_CLIENT = 5;

export type DisclosureState = 'PENDING' | 'APPROVED' | 'DECLINED' | 'DELIVERED' | 'EXPIRED';

export interface Disclosure {
  id: string;
  clientId: string;
  provider: string;
  purpose: string;
  requested: DisclosableField[];
  approved: DisclosableField[] | null;
  state: DisclosureState;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  deliveredAt: string | null;
}

interface Row {
  id: string;
  client_id: string;
  provider: string;
  purpose: string;
  requested_json: string;
  approved_json: string | null;
  content_json: string | null;
  content_hash: string | null;
  state: DisclosureState;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  delivered_at: string | null;
}

const toDisclosure = (r: Row): Disclosure => ({
  id: r.id,
  clientId: r.client_id,
  provider: r.provider,
  purpose: r.purpose,
  requested: JSON.parse(r.requested_json) as DisclosableField[],
  approved: r.approved_json ? (JSON.parse(r.approved_json) as DisclosableField[]) : null,
  state: r.state,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  decidedAt: r.decided_at,
  deliveredAt: r.delivered_at,
});

export class DisclosureError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'NOT_PENDING'
      | 'PREVIEW_CHANGED'
      | 'NOTHING_SELECTED'
      | 'NOT_REQUESTED'
      | 'TOO_MANY_PENDING'
      | 'WAITING'
      | 'DECLINED'
      | 'ALREADY_DELIVERED'
      | 'EXPIRED',
    message: string,
  ) {
    super(message);
  }
}

/** The exact values a field would release, read from approved facts and settings at this moment. */
export function resolveFields(db: Db, fields: readonly DisclosableField[]): Record<string, unknown> {
  const profile = approvedProfile(db);
  const facts = listFacts(db, { approvedOnly: true });
  const s = getSettings(db);
  const of = (kind: string) => facts.filter((f) => f.kind === kind).map((f) => f.value);
  const values: Record<DisclosableField, () => unknown> = {
    'profile.skills': () => profile.skills.map(({ name, years, level }) => ({ name, years, level })),
    'profile.experience': () =>
      profile.roles.map(({ title, employer, startYear, endYear }) => ({ title, employer, startYear, endYear })),
    'profile.education': () => of('education'),
    'profile.certifications': () => of('certification'),
    'profile.languages': () => of('language'),
    'profile.linkedin': () => (s['candidate.linkedinUrl'] as string | null) ?? null,
    'preferences.roles': () => s['search.preferredRoles'],
    'preferences.location': () => ({
      country: s['candidate.country'],
      eligibleCountries: s['search.eligibleCountries'],
      remotePreference: s['search.remotePreference'],
    }),
    'preferences.salary': () => s['candidate.salaryExpectation'],
    'preferences.availability': () => s['candidate.joiningAvailability'],
  };
  return Object.fromEntries(fields.map((f) => [f, values[f]()]));
}

const canonical = (v: unknown): string => JSON.stringify(v);
export const contentHash = (content: Record<string, unknown>): string =>
  createHash('sha256').update(canonical(content)).digest('hex');

/**
 * Single-use disclosures to AI assistants. An assistant asks for categories with a purpose; the
 * candidate sees the exact values, may narrow them, and approves once. The assistant can collect
 * that snapshot one time; afterwards only the consent record (who, why, which fields, hash) remains.
 */
export class Disclosures {
  constructor(private readonly db: Db) {}

  private audit(actor: string, action: string, subject: string, detail: unknown = null): void {
    this.db
      .prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), actor, action, subject, detail === null ? null : JSON.stringify(detail));
  }

  private row(id: string): Row | undefined {
    return this.db.prepare('SELECT * FROM disclosures WHERE id = ?').get(id) as Row | undefined;
  }

  /** Expire stale requests and uncollected releases, deleting any content they held. */
  expire(now = new Date()): void {
    const at = now.toISOString();
    const stale = this.db
      .prepare("SELECT id FROM disclosures WHERE state IN ('PENDING', 'APPROVED') AND expires_at <= ?")
      .pluck()
      .all(at) as string[];
    this.db.transaction(() => {
      for (const id of stale) {
        this.db.prepare("UPDATE disclosures SET state = 'EXPIRED', content_json = NULL WHERE id = ?").run(id);
        this.audit('system', 'disclosure.expired', id);
      }
    })();
  }

  request(client: { id: string; name: string }, purpose: string, fields: DisclosableField[]): Disclosure {
    this.expire();
    const pending = this.db
      .prepare("SELECT COUNT(*) FROM disclosures WHERE client_id = ? AND state = 'PENDING'")
      .pluck()
      .get(client.id) as number;
    if (pending >= MAX_PENDING_PER_CLIENT) {
      throw new DisclosureError(
        'TOO_MANY_PENDING',
        `There are already ${pending} requests waiting for the candidate. Wait for them to be answered.`,
      );
    }
    const id = `dsc_${randomBytes(9).toString('base64url')}`;
    const now = Date.now();
    const unique = [...new Set(fields)];
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO disclosures (id, client_id, provider, purpose, requested_json, state, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)",
        )
        .run(
          id,
          client.id,
          client.name,
          purpose,
          JSON.stringify(unique),
          new Date(now).toISOString(),
          new Date(now + PENDING_FOR_MS).toISOString(),
        );
      this.audit(`ai:${client.name}`, 'disclosure.requested', id, { fields: unique });
    })();
    return toDisclosure(this.row(id)!);
  }

  list(): Disclosure[] {
    this.expire();
    return (this.db.prepare('SELECT * FROM disclosures ORDER BY created_at DESC LIMIT 100').all() as Row[]).map(
      toDisclosure,
    );
  }

  /** What approving would release now, for the candidate to read before deciding. */
  preview(id: string): { disclosure: Disclosure; values: Record<string, unknown>; previewHash: string } {
    this.expire();
    const row = this.row(id);
    if (!row) throw new DisclosureError('NOT_FOUND', 'No such request.');
    const disclosure = toDisclosure(row);
    const values = resolveFields(this.db, disclosure.requested);
    return { disclosure, values, previewHash: contentHash(values) };
  }

  /**
   * Approve a subset of the requested fields. `previewHash` is the hash of the preview the candidate
   * was shown; if anything in it changed since, nothing is released.
   */
  approve(id: string, fields: DisclosableField[], previewHash: string, actor: string): Disclosure {
    this.expire();
    const row = this.row(id);
    if (!row) throw new DisclosureError('NOT_FOUND', 'No such request.');
    if (row.state !== 'PENDING')
      throw new DisclosureError('NOT_PENDING', `This request is ${row.state.toLowerCase()}.`);
    const requested = JSON.parse(row.requested_json) as DisclosableField[];
    const chosen = requested.filter((f) => fields.includes(f));
    if (fields.some((f) => !requested.includes(f)))
      throw new DisclosureError('NOT_REQUESTED', 'Only fields the assistant asked for can be shared.');
    if (chosen.length === 0)
      throw new DisclosureError('NOTHING_SELECTED', 'Choose at least one item to share, or decline.');
    // The preview covered every requested field; if any of it changed, the candidate saw stale values.
    if (contentHash(resolveFields(this.db, requested)) !== previewHash) {
      throw new DisclosureError(
        'PREVIEW_CHANGED',
        'Your information changed after the preview was shown. Review it again.',
      );
    }
    const content = resolveFields(this.db, chosen);
    const hash = contentHash(content);
    const at = new Date();
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE disclosures SET state = 'APPROVED', approved_json = ?, content_json = ?, content_hash = ?, decided_at = ?, expires_at = ? WHERE id = ?",
        )
        .run(
          JSON.stringify(chosen),
          canonical(content),
          hash,
          at.toISOString(),
          new Date(at.getTime() + DELIVER_WITHIN_MS).toISOString(),
          id,
        );
      this.audit(actor, 'disclosure.approved', id, {
        provider: row.provider,
        purpose: row.purpose,
        fields: chosen,
        contentHash: hash,
      });
    })();
    return toDisclosure(this.row(id)!);
  }

  decline(id: string, actor: string): Disclosure {
    const row = this.row(id);
    if (!row) throw new DisclosureError('NOT_FOUND', 'No such request.');
    if (row.state !== 'PENDING')
      throw new DisclosureError('NOT_PENDING', `This request is ${row.state.toLowerCase()}.`);
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE disclosures SET state = 'DECLINED', decided_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
      this.audit(actor, 'disclosure.declined', id);
    })();
    return toDisclosure(this.row(id)!);
  }

  /** The assistant collects an approved release exactly once; the content is then deleted. */
  collect(
    id: string,
    client: { id: string; name: string },
  ): { content: Record<string, unknown>; disclosure: Disclosure } {
    this.expire();
    const row = this.row(id);
    // Another assistant's request does not exist as far as this one is concerned.
    if (!row || row.client_id !== client.id)
      throw new DisclosureError('NOT_FOUND', `No request ${id} from this assistant.`);
    if (row.state === 'PENDING')
      throw new DisclosureError(
        'WAITING',
        'The candidate has not answered yet. Ask them to review the request in the Career Strike dashboard (Settings → AI assistants).',
      );
    if (row.state === 'DECLINED') throw new DisclosureError('DECLINED', 'The candidate declined to share this.');
    if (row.state === 'DELIVERED')
      throw new DisclosureError(
        'ALREADY_DELIVERED',
        'This was already delivered once. Sharing is single-use: make a new request if needed.',
      );
    if (row.state === 'EXPIRED')
      throw new DisclosureError('EXPIRED', 'This request expired. Make a new request if needed.');
    const content = JSON.parse(row.content_json!) as Record<string, unknown>;
    const at = new Date().toISOString();
    let won = false;
    this.db.transaction(() => {
      won =
        this.db
          .prepare(
            "UPDATE disclosures SET state = 'DELIVERED', delivered_at = ?, content_json = NULL WHERE id = ? AND state = 'APPROVED'",
          )
          .run(at, id).changes === 1;
      if (won) this.audit(`ai:${client.name}`, 'disclosure.delivered', id, { contentHash: row.content_hash });
    })();
    if (!won) throw new DisclosureError('ALREADY_DELIVERED', 'This was already delivered once.');
    return { content, disclosure: toDisclosure(this.row(id)!) };
  }

  pendingCount(): number {
    this.expire();
    return this.db.prepare("SELECT COUNT(*) FROM disclosures WHERE state = 'PENDING'").pluck().get() as number;
  }
}
