-- AskHuman D1 schema (Phase 0)

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  plan       TEXT NOT NULL DEFAULT 'founding',
  inbox_key  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  key_hash     TEXT NOT NULL UNIQUE,
  label        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS targets (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind       TEXT NOT NULL CHECK (kind IN ('slack','discord','webhook')),
  url        TEXT NOT NULL,
  label      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asks (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  question     TEXT NOT NULL,
  context      TEXT,
  type         TEXT NOT NULL DEFAULT 'freeform' CHECK (type IN ('approve','choose','rate','freeform')),
  options_json TEXT,
  sla_seconds  INTEGER NOT NULL DEFAULT 3600,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','expired','cancelled')),
  answer_json  TEXT,
  answered_by  TEXT,
  answer_token TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at  TEXT,
  expires_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asks_account_status ON asks(account_id, status);

CREATE TABLE IF NOT EXISTS waitlist (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  ask_id     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_ask ON events(ask_id);
