// Every stored column has a data class. Export, deletion, logging and AI disclosure decisions are
// made against these classes; a test fails when a migration adds a column that is not listed here.
//
//   PUBLIC     published by an employer or harmless to share (posting text, board names)
//   INTERNAL   operational metadata with no candidate content (task states, timestamps, versions)
//   PERSONAL   about the candidate's search but not identifying on its own (dispositions, application states)
//   SENSITIVE  identity, profile, documents and anything written for an employer
//   SECRET     credentials and their hashes; never exported, logged or shown

export const DATA_CLASSES = ['PUBLIC', 'INTERNAL', 'PERSONAL', 'SENSITIVE', 'SECRET'] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export interface ColumnClass {
  class: DataClass;
  /** Columns this one is computed from; its class must be at least the strictest of them. */
  derivedFrom?: readonly string[];
}

const c = (cls: DataClass, derivedFrom?: readonly string[]): ColumnClass => (derivedFrom ? { class: cls, derivedFrom } : { class: cls });
const all = (cls: DataClass, columns: readonly string[]): Record<string, ColumnClass> => Object.fromEntries(columns.map((k) => [k, c(cls)]));

const PROFILE = ['profile_facts.value_json'];
const IDENTITY = ['settings.value_json'];

export const CLASSIFICATION: Readonly<Record<string, Readonly<Record<string, ColumnClass>>>> = {
  schema_migrations: all('INTERNAL', ['version', 'name', 'applied_at']),
  audit_events: {
    ...all('INTERNAL', ['id', 'at', 'action']),
    actor: c('PERSONAL'),
    // Subjects are ids and kinds only; values are never audited.
    subject: c('PERSONAL'),
    detail_json: c('PERSONAL'),
  },
  settings: {
    ...all('INTERNAL', ['key', 'classification', 'updated_at']),
    // Per-row class is in the classification column; the column as a whole is the strictest row.
    value_json: c('SENSITIVE'),
  },
  dashboard_sessions: { ...all('SECRET', ['id_hash', 'csrf_token']), ...all('INTERNAL', ['created_at', 'expires_at', 'last_seen_at']) },
  mcp_clients: {
    ...all('INTERNAL', ['id', 'name', 'scopes_json', 'created_at', 'last_seen_at', 'revoked_at']),
    token_hash: c('SECRET'),
  },

  jobs: {
    ...all('PUBLIC', [
      'id', 'canonical_key', 'duplicate_key', 'duplicate_of', 'employer', 'title', 'location_text', 'remote_policy', 'employment_type',
      'department', 'salary_json', 'description_json', 'description_text', 'apply_url', 'posting_url', 'published_at', 'status', 'unresolved_json', 'market_json',
    ]),
    ...all('INTERNAL', ['first_seen_at', 'last_seen_at', 'last_verified_at', 'closed_at', 'requirements_version']),
    requirements_json: c('PUBLIC', ['jobs.description_json']),
  },
  job_sources: all('PUBLIC', ['job_id', 'source', 'board', 'source_job_id', 'source_url', 'fetched_at', 'content_hash']),
  source_boards: {
    ...all('PUBLIC', ['id', 'source', 'board']),
    ...all('INTERNAL', ['added_at', 'health', 'last_success_at', 'last_error', 'consecutive_failures', 'next_attempt_at']),
  },
  job_user_state: { job_id: c('PUBLIC'), disposition: c('PERSONAL'), ...all('INTERNAL', ['updated_at', 'updated_by']) },
  tasks: {
    ...all('INTERNAL', ['id', 'kind', 'dedupe_key', 'trigger', 'client', 'state', 'created_at', 'started_at', 'ended_at', 'heartbeat_at', 'owner_pid', 'cancel_requested', 'attempt', 'error']),
    // Discovery tasks carry board ids and fetch counts only.
    ...all('PUBLIC', ['params_json', 'progress_json', 'result_json']),
  },
  schedule_slots: all('INTERNAL', ['schedule', 'slot', 'claimed_at', 'claimed_by', 'result']),

  profile_facts: { ...all('INTERNAL', ['id', 'kind', 'source', 'approved', 'created_at', 'updated_at']), value_json: c('SENSITIVE'), source_ref: c('SENSITIVE') },
  profile_evidence: { ...all('INTERNAL', ['id', 'kind', 'source', 'confirmed', 'created_at', 'updated_at']), value_json: c('SENSITIVE'), source_ref: c('SENSITIVE') },
  documents: {
    ...all('INTERNAL', ['id', 'kind', 'mime', 'size_bytes', 'created_at']),
    // A filename often contains the candidate's name; the hash identifies a private file.
    ...all('SENSITIVE', ['filename', 'sha256']),
  },

  applications: { ...all('INTERNAL', ['id', 'mode', 'current_version', 'created_at', 'updated_at']), job_id: c('PERSONAL'), state: c('PERSONAL') },
  application_versions: {
    ...all('INTERNAL', ['application_id', 'version', 'created_by', 'created_at']),
    payload_json: c('SENSITIVE', [...PROFILE, ...IDENTITY, 'documents.filename', 'jobs.description_json']),
    payload_hash: c('SENSITIVE', ['application_versions.payload_json']),
    reason: c('PERSONAL'),
  },
  job_description_snapshots: {
    ...all('INTERNAL', ['id', 'job_id', 'description_hash', 'completeness', 'created_at']),
    requirements_json: c('SENSITIVE', ['jobs.description_json']),
  },
  document_variants: {
    ...all('INTERNAL', ['id', 'application_id', 'snapshot_id', 'kind', 'format', 'locale', 'status', 'created_at']),
    ...all('SENSITIVE', ['content', 'content_hash', 'profile_fingerprint', 'based_on_variant_id']),
  },
  document_variant_evidence: {
    ...all('INTERNAL', ['variant_id', 'claim_index', 'classification']),
    ...all('SENSITIVE', ['claim_text', 'evidence_ref']),
  },
  application_events: {
    ...all('INTERNAL', ['id', 'application_id', 'actor', 'at']),
    ...all('PERSONAL', ['from_state', 'to_state', 'note']),
    evidence_json: c('PERSONAL'),
  },
  approvals: {
    ...all('INTERNAL', ['id', 'application_id', 'version', 'issued_at', 'expires_at', 'state', 'state_reason', 'consumed_at', 'nonce']),
    payload_hash: c('SENSITIVE', ['application_versions.payload_hash']),
    identity_hash: c('SENSITIVE', IDENTITY),
    destination: c('PUBLIC'),
    mac: c('SECRET'),
  },
  submission_attempts: {
    ...all('INTERNAL', ['id', 'application_id', 'approval_id', 'state', 'started_at', 'ended_at', 'error']),
    endpoint: c('PUBLIC'),
    receipt_json: c('PERSONAL'),
  },
  practice_endpoint: all('INTERNAL', ['id', 'origin', 'created_at']),
  follow_ups: { ...all('INTERNAL', ['id', 'application_id', 'due_at', 'status', 'created_at', 'closed_at']), note: c('PERSONAL') },
  interviews: {
    ...all('INTERNAL', ['id', 'application_id', 'stage', 'format', 'scheduled_at', 'created_at', 'updated_at']),
    ...all('PERSONAL', ['notes', 'outcome']),
  },
  practice_sessions: {
    ...all('INTERNAL', ['id', 'application_id', 'topic_id', 'practiced_at']),
    ...all('PERSONAL', ['notes', 'confidence', 'minutes']),
  },

  disclosures: {
    ...all('INTERNAL', ['id', 'client_id', 'provider', 'requested_json', 'approved_json', 'state', 'created_at', 'expires_at', 'decided_at', 'delivered_at']),
    // Written by the assistant; it may describe the candidate's plans.
    purpose: c('PERSONAL'),
    content_json: c('SENSITIVE', [...PROFILE, ...IDENTITY]),
    content_hash: c('SENSITIVE', ['disclosures.content_json']),
  },
  strategy_proposals: {
    ...all('INTERNAL', ['id', 'rule', 'fingerprint', 'status', 'created_at', 'decided_at']),
    // Gap and role proposals name skills missing from the profile and roles that reached interview.
    ...Object.fromEntries(['title', 'rationale', 'action_json'].map((k) => [k, c('SENSITIVE', [...PROFILE, 'applications.state', 'jobs.title'])])),
  },
  strategy_snapshots: { day: c('INTERNAL'), metrics_json: c('SENSITIVE', [...PROFILE, 'applications.state', 'application_events.to_state']) },
};

const rank = (cls: DataClass): number => DATA_CLASSES.indexOf(cls);

export function classOf(table: string, column: string): DataClass | null {
  return CLASSIFICATION[table]?.[column]?.class ?? null;
}

/** The strictest of several classes: what a record combining them must be treated as. */
export function strictest(classes: readonly DataClass[]): DataClass {
  return classes.reduce<DataClass>((a, b) => (rank(b) > rank(a) ? b : a), 'PUBLIC');
}

/** Columns whose class is weaker than something they are derived from, or derived from an unknown column. */
export function derivationViolations(): string[] {
  const problems: string[] = [];
  for (const [table, columns] of Object.entries(CLASSIFICATION)) {
    for (const [column, spec] of Object.entries(columns)) {
      for (const source of spec.derivedFrom ?? []) {
        const [t, col] = source.split('.') as [string, string];
        const sourceClass = classOf(t, col);
        if (!sourceClass) problems.push(`${table}.${column} is derived from unknown ${source}`);
        else if (rank(spec.class) < rank(sourceClass)) problems.push(`${table}.${column} is ${spec.class} but derived from ${source} (${sourceClass})`);
      }
    }
  }
  return problems;
}

/** Tables whose rows are the candidate's career data (removed by delete, included in export). */
export function careerTables(): string[] {
  return Object.entries(CLASSIFICATION)
    .filter(([, cols]) => Object.values(cols).some((s) => rank(s.class) >= rank('PERSONAL') && s.class !== 'SECRET'))
    .map(([t]) => t);
}
