export const currentSchemaVersion = 1;

export const initialSchema = `
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
    password_hash TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    username TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique ON app_users (lower(email));
  CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_unique ON app_users (lower(username));

  CREATE TABLE IF NOT EXISTS task_cards (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS board_settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES task_cards(id),
    data TEXT NOT NULL,
    sequence BIGSERIAL NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS task_events_card_sequence ON task_events (card_id, sequence);
  CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES task_cards(id),
    data TEXT NOT NULL,
    sequence BIGSERIAL NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS task_comments_card_sequence ON task_comments (card_id, sequence);
  CREATE TABLE IF NOT EXISTS task_files (
    sha256 TEXT PRIMARY KEY,
    bytes BYTEA NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_imports (
    source TEXT PRIMARY KEY,
    digest TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_chat_links (
    task_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sqlite_imports (
    source_key TEXT PRIMARY KEY,
    source_sha256 TEXT NOT NULL,
    summary TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;
