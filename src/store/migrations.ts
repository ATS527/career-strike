export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Forward-only. Never edit an applied migration; add a new one.
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'foundation',
    sql: `
      CREATE TABLE settings (
        key            TEXT PRIMARY KEY,
        value_json     TEXT NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN ('PUBLIC', 'PERSONAL', 'SENSITIVE')),
        updated_at     TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        at          TEXT NOT NULL,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        subject     TEXT,
        detail_json TEXT
      );
      CREATE INDEX audit_events_at ON audit_events (at);
    `,
  },
  {
    version: 2,
    name: 'dashboard_sessions',
    sql: `
      -- Session ids are stored hashed; the raw id only exists in the browser's HttpOnly cookie.
      CREATE TABLE dashboard_sessions (
        id_hash      TEXT PRIMARY KEY,
        csrf_token   TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX dashboard_sessions_expires ON dashboard_sessions (expires_at);
    `,
  },
  {
    version: 3,
    name: 'opportunities_and_tasks',
    sql: `
      -- PUBLIC: postings as published by employers. Nothing candidate-specific lives here.
      CREATE TABLE jobs (
        id                 TEXT PRIMARY KEY,
        canonical_key      TEXT NOT NULL UNIQUE,
        duplicate_key      TEXT NOT NULL,
        duplicate_of       TEXT REFERENCES jobs (id) ON DELETE SET NULL,
        employer           TEXT NOT NULL,
        title              TEXT NOT NULL,
        location_text      TEXT,
        remote_policy      TEXT NOT NULL CHECK (remote_policy IN ('remote', 'hybrid', 'onsite', 'unknown')),
        employment_type    TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'unknown')),
        department         TEXT,
        salary_json        TEXT,
        description_json   TEXT NOT NULL,
        description_text   TEXT NOT NULL,
        apply_url          TEXT,
        posting_url        TEXT,
        published_at       TEXT,
        status             TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'UNVERIFIED')),
        first_seen_at      TEXT NOT NULL,
        last_seen_at       TEXT NOT NULL,
        last_verified_at   TEXT,
        closed_at          TEXT,
        unresolved_json    TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX jobs_duplicate_key ON jobs (duplicate_key);
      CREATE INDEX jobs_status ON jobs (status);

      -- PUBLIC: where each posting was found. One job can be listed by several sources.
      CREATE TABLE job_sources (
        job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'manual')),
        board         TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        source_url    TEXT,
        fetched_at    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        PRIMARY KEY (source, board, source_job_id)
      );
      CREATE INDEX job_sources_job ON job_sources (job_id);

      -- PERSONAL: which public boards the candidate monitors, and their health.
      CREATE TABLE source_boards (
        id                   TEXT PRIMARY KEY,
        source               TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby')),
        board                TEXT NOT NULL,
        added_at             TEXT NOT NULL,
        health               TEXT NOT NULL DEFAULT 'NEVER_RUN' CHECK (health IN ('NEVER_RUN', 'OK', 'DEGRADED', 'NOT_FOUND')),
        last_success_at      TEXT,
        last_error           TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        UNIQUE (source, board)
      );

      -- PERSONAL: the candidate's decision about a job.
      CREATE TABLE job_user_state (
        job_id      TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
        disposition TEXT NOT NULL CHECK (disposition IN ('none', 'shortlisted', 'excluded')),
        updated_at  TEXT NOT NULL,
        updated_by  TEXT NOT NULL
      );

      -- PERSONAL: durable record of supervised work. RUNNING requires a live owner process.
      CREATE TABLE tasks (
        id               TEXT PRIMARY KEY,
        kind             TEXT NOT NULL,
        dedupe_key       TEXT NOT NULL,
        trigger          TEXT NOT NULL,
        client           TEXT NOT NULL,
        params_json      TEXT NOT NULL,
        state            TEXT NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED')),
        created_at       TEXT NOT NULL,
        started_at       TEXT,
        ended_at         TEXT,
        heartbeat_at     TEXT,
        owner_pid        INTEGER,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        progress_json    TEXT,
        result_json      TEXT,
        error            TEXT
      );
      CREATE UNIQUE INDEX tasks_single_flight ON tasks (dedupe_key) WHERE state IN ('QUEUED', 'RUNNING');
      CREATE INDEX tasks_created ON tasks (created_at);
    `,
  },
  {
    version: 4,
    name: 'profile_and_requirements',
    sql: `
      -- SENSITIVE: facts about the candidate. Only approved facts are ever used for matching,
      -- drafting or disclosure. Facts entered by the candidate are approved when saved.
      CREATE TABLE profile_facts (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL CHECK (kind IN ('skill', 'role', 'education', 'certification', 'language')),
        value_json TEXT NOT NULL,
        source     TEXT NOT NULL CHECK (source IN ('user', 'document')),
        source_ref TEXT,
        approved   INTEGER NOT NULL CHECK (approved IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX profile_facts_kind ON profile_facts (kind);

      -- PUBLIC (derived from posting text only): requirements extracted with quoted evidence.
      ALTER TABLE jobs ADD COLUMN requirements_json TEXT;
      ALTER TABLE jobs ADD COLUMN requirements_version INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 5,
    name: 'applications_and_approvals',
    sql: `
      -- SENSITIVE: files in the private vault. The vault path is never stored here or exposed.
      CREATE TABLE documents (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL CHECK (kind IN ('resume', 'cover_letter', 'other')),
        filename    TEXT NOT NULL,
        mime        TEXT NOT NULL,
        size_bytes  INTEGER NOT NULL,
        sha256      TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );

      -- PERSONAL: one application per job; its state is the tracker's source of truth.
      CREATE TABLE applications (
        id             TEXT PRIMARY KEY,
        job_id         TEXT NOT NULL UNIQUE REFERENCES jobs (id),
        state          TEXT NOT NULL,
        mode           TEXT NOT NULL CHECK (mode IN ('manual', 'assisted', 'automated')),
        current_version INTEGER NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      -- SENSITIVE: every version of what would be submitted, with its hash and why it changed.
      CREATE TABLE application_versions (
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        version        INTEGER NOT NULL,
        payload_json   TEXT NOT NULL,
        payload_hash   TEXT NOT NULL,
        created_by     TEXT NOT NULL,
        reason         TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        PRIMARY KEY (application_id, version)
      );

      -- SENSITIVE: an approval binds one exact payload, destination and identity. Single use.
      CREATE TABLE approvals (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        version        INTEGER NOT NULL,
        payload_hash   TEXT NOT NULL,
        destination    TEXT NOT NULL,
        identity_hash  TEXT NOT NULL,
        nonce          TEXT NOT NULL,
        issued_at      TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        mac            TEXT NOT NULL,
        state          TEXT NOT NULL CHECK (state IN ('ACTIVE', 'CONSUMED', 'INVALIDATED', 'EXPIRED', 'REVOKED')),
        state_reason   TEXT,
        consumed_at    TEXT
      );
      CREATE UNIQUE INDEX approvals_one_active ON approvals (application_id) WHERE state = 'ACTIVE';

      -- PERSONAL: every state change with who made it and why.
      CREATE TABLE application_events (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        from_state     TEXT,
        to_state       TEXT NOT NULL,
        actor          TEXT NOT NULL,
        note           TEXT,
        evidence_json  TEXT,
        at             TEXT NOT NULL
      );
      CREATE INDEX application_events_app ON application_events (application_id, id);
    `,
  },
  {
    version: 6,
    name: 'follow_ups',
    sql: `
      -- PERSONAL: reminders the candidate set for an application.
      CREATE TABLE follow_ups (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        due_at         TEXT NOT NULL,
        note           TEXT NOT NULL,
        status         TEXT NOT NULL CHECK (status IN ('OPEN', 'DONE', 'DISMISSED')),
        created_at     TEXT NOT NULL,
        closed_at      TEXT
      );
      CREATE INDEX follow_ups_due ON follow_ups (status, due_at);
    `,
  },
  {
    version: 7,
    name: 'mcp_clients',
    sql: `
      -- PERSONAL: AI assistants connected over MCP and what the candidate allows each to see.
      -- Tokens are stored hashed; the token itself lives in an owner-only file for the MCP process.
      CREATE TABLE mcp_clients (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        token_hash   TEXT NOT NULL UNIQUE,
        scopes_json  TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at   TEXT
      );
      CREATE INDEX mcp_clients_name ON mcp_clients (name);
    `,
  },
  {
    version: 8,
    name: 'submission_attempts',
    sql: `
      -- SENSITIVE: each attempt to deliver an approved application. One attempt per approval:
      -- the approval id is the idempotency key, so a retry can never create a second submission.
      CREATE TABLE submission_attempts (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        approval_id    TEXT NOT NULL UNIQUE REFERENCES approvals (id),
        endpoint       TEXT NOT NULL,
        state          TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'CONFIRMED', 'UNCONFIRMED', 'FAILED')),
        started_at     TEXT NOT NULL,
        ended_at       TEXT,
        receipt_json   TEXT,
        error          TEXT
      );
      CREATE INDEX submission_attempts_app ON submission_attempts (application_id);

      -- Internal (not a user setting): the owned practice endpoint automated submission may target.
      CREATE TABLE practice_endpoint (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        origin     TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 9,
    name: 'interviews_and_practice',
    sql: `
      -- PERSONAL: interviews and assessments for an application.
      CREATE TABLE interviews (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        stage          TEXT NOT NULL,
        format         TEXT NOT NULL CHECK (format IN ('phone', 'video', 'onsite', 'take_home', 'other')),
        scheduled_at   TEXT NOT NULL,
        notes          TEXT,
        outcome        TEXT NOT NULL CHECK (outcome IN ('pending', 'passed', 'not_passed', 'cancelled')),
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX interviews_when ON interviews (scheduled_at);

      -- SENSITIVE: the candidate's practice log, with self-rated confidence.
      CREATE TABLE practice_sessions (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        topic_id       TEXT NOT NULL,
        notes          TEXT,
        confidence     INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
        minutes        INTEGER CHECK (minutes BETWEEN 1 AND 600),
        practiced_at   TEXT NOT NULL
      );
      CREATE INDEX practice_sessions_app ON practice_sessions (application_id, topic_id);
    `,
  },
  {
    version: 10,
    name: 'scheduling',
    sql: `
      -- PERSONAL: each schedule slot is claimed once. The primary key makes a second claim fail, so
      -- the same slot can never run twice, even if two processes race.
      CREATE TABLE schedule_slots (
        schedule   TEXT NOT NULL,
        slot       TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        claimed_by INTEGER NOT NULL,
        result     TEXT,
        PRIMARY KEY (schedule, slot)
      );
      ALTER TABLE tasks ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
      -- Scheduled fetches of a failing board wait until this time (bounded exponential backoff).
      ALTER TABLE source_boards ADD COLUMN next_attempt_at TEXT;
    `,
  },
  {
    version: 11,
    name: 'practice_source',
    sql: `
      -- Allow the owned practice board as a source. SQLite cannot alter a CHECK constraint, so the
      -- two tables are rebuilt with identical columns and data.
      CREATE TABLE source_boards_v11 (
        id                   TEXT PRIMARY KEY,
        source               TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'practice')),
        board                TEXT NOT NULL,
        added_at             TEXT NOT NULL,
        health               TEXT NOT NULL DEFAULT 'NEVER_RUN' CHECK (health IN ('NEVER_RUN', 'OK', 'DEGRADED', 'NOT_FOUND')),
        last_success_at      TEXT,
        last_error           TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        next_attempt_at      TEXT,
        UNIQUE (source, board)
      );
      INSERT INTO source_boards_v11 (id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at)
        SELECT id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at FROM source_boards;
      DROP TABLE source_boards;
      ALTER TABLE source_boards_v11 RENAME TO source_boards;

      CREATE TABLE job_sources_v11 (
        job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'manual', 'practice')),
        board         TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        source_url    TEXT,
        fetched_at    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        PRIMARY KEY (source, board, source_job_id)
      );
      INSERT INTO job_sources_v11 SELECT job_id, source, board, source_job_id, source_url, fetched_at, content_hash FROM job_sources;
      DROP TABLE job_sources;
      ALTER TABLE job_sources_v11 RENAME TO job_sources;
      CREATE INDEX job_sources_job ON job_sources (job_id);
    `,
  },
  {
    version: 12,
    name: 'strategy_learning',
    sql: `
      -- PERSONAL: suggestions derived from the candidate's own outcomes, and their decisions.
      CREATE TABLE strategy_proposals (
        id          TEXT PRIMARY KEY,
        rule        TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        rationale   TEXT NOT NULL,
        action_json TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'DISMISSED')),
        created_at  TEXT NOT NULL,
        decided_at  TEXT
      );
      -- PERSONAL: one snapshot of the metrics per day, for the learning history.
      CREATE TABLE strategy_snapshots (
        day          TEXT PRIMARY KEY,
        metrics_json TEXT NOT NULL
      );
    `,
  },
];
