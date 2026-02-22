-- 0001_init.sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;

-- core
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,              -- unix ms
  kind         TEXT NOT NULL,                 -- "chat:user" | "chat:ai" | "note" | ...
  text         TEXT NOT NULL,
  meta         TEXT DEFAULT '{}' CHECK (json_valid(meta)),
  source       TEXT DEFAULT 'tauri'
);

-- embeddings (one row per event)
CREATE TABLE IF NOT EXISTS embeddings (
  event_id     INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  model        TEXT NOT NULL,                 -- "bge-small-en-v1.5"
  dim          INTEGER NOT NULL,              -- e.g., 384 or 768
  vec          BLOB NOT NULL                  -- extension-specific binary
);

-- daily summaries
CREATE TABLE IF NOT EXISTS summaries (
  day          TEXT PRIMARY KEY,              -- "2025-10-28" (UTC)
  text         TEXT NOT NULL,
  tokens       INTEGER NOT NULL DEFAULT 0,
  from_ts      INTEGER NOT NULL,
  to_ts        INTEGER NOT NULL
);

-- Helpful covering indexes
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_kind_ts ON events(kind, ts);

-- Note: The vec_version() check and vec0 virtual table creation
-- are handled by the daemon at runtime using the sqlite-vec Python module.
-- The sqlite3 CLI doesn't have access to the Python-installed extension.
