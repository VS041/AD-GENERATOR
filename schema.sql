-- ============================================================
-- ad-generator · D1 schema
-- ============================================================
-- apply with:
--   wrangler d1 execute ad-generator-db --file=schema.sql            (local)
--   wrangler d1 execute ad-generator-db --remote --file=schema.sql   (production)
-- ============================================================

-- ----- generations: every attempted generation, success or fail -----
CREATE TABLE IF NOT EXISTS generations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint     TEXT NOT NULL,             -- sha256(ip + ua), 32 hex chars
  template        TEXT NOT NULL,             -- 'festival' | 'launch' | ...
  language        TEXT NOT NULL,             -- 'en' | 'hi'
  file_size       INTEGER,                   -- bytes
  file_type       TEXT,                      -- 'image/jpeg' | 'image/png'
  fal_request_id  TEXT,                      -- fal.ai request id (week 2)
  output_url      TEXT,                      -- R2 URL of final ad (week 2)
  status          TEXT NOT NULL,             -- 'pending' | 'success' | 'failed'
  error_code      TEXT,                      -- on failure
  cost_paise      INTEGER DEFAULT 0,         -- estimated cost · paise (1 INR = 100 paise)
  duration_ms     INTEGER,                   -- end-to-end time
  created_at      TEXT NOT NULL,             -- ISO 8601
  completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_gen_fingerprint ON generations(fingerprint);
CREATE INDEX IF NOT EXISTS idx_gen_created     ON generations(created_at);
CREATE INDEX IF NOT EXISTS idx_gen_status      ON generations(status);

-- ----- events: free-form log for ops · errors, alerts, kill-switch hits -----
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,        -- 'error' | 'killswitch' | 'abuse' | 'milestone'
  message     TEXT,
  payload     TEXT,                  -- JSON blob
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_type    ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- ----- daily_spend: rolling daily cost tracker · used by kill-switch -----
-- NOTE: the kill-switch is currently provider-side (fal.ai dashboard cap)
-- this table is here so we can add app-level monitoring later if you want
CREATE TABLE IF NOT EXISTS daily_spend (
  day              TEXT PRIMARY KEY,           -- 'YYYY-MM-DD'
  generations_ok   INTEGER NOT NULL DEFAULT 0,
  generations_fail INTEGER NOT NULL DEFAULT 0,
  total_paise      INTEGER NOT NULL DEFAULT 0
);
