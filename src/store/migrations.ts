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
];
