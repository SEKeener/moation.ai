-- moation.ai corpus
-- One row per observed use of the word, deduped on (source, external_id).

CREATE TABLE IF NOT EXISTS mentions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,          -- hn | bluesky | reddit | news | github | mastodon | x
  external_id   TEXT NOT NULL,          -- stable id within that source
  url           TEXT NOT NULL,
  author        TEXT,
  title         TEXT,
  excerpt       TEXT NOT NULL,          -- short quoted snippet, never the full post
  created_at    TEXT NOT NULL,          -- ISO8601, when the mention was published
  first_seen_at TEXT NOT NULL,          -- ISO8601, when our collector saw it
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_created ON mentions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_source  ON mentions (source, created_at DESC);

-- Hourly snapshots of the seed tweet's engagement. X has no free search, but the
-- syndication endpoint gives us the origin post's numbers for nothing.
-- The syndication endpoint exposes favorite_count and conversation_count only.
-- Retweet and quote counts are not available without the paid API.
CREATE TABLE IF NOT EXISTS seed_metrics (
  captured_at    TEXT PRIMARY KEY,
  favorite_count INTEGER,
  reply_count    INTEGER
);

-- Collector run log. Lets the homepage prove it is actually alive when the feed
-- is empty, which at the start it will be.
CREATE TABLE IF NOT EXISTS runs (
  started_at TEXT PRIMARY KEY,
  ok         INTEGER NOT NULL,
  found      INTEGER NOT NULL,   -- new mentions inserted this run
  scanned    INTEGER NOT NULL,   -- candidate items examined before strict matching
  detail     TEXT                -- JSON: per-source status
);

-- Exhibits: instances of the BEHAVIOR, not the word. Each one is a named move
-- converting one transient edge into the next. Seeded from data/exhibits.json.
CREATE TABLE IF NOT EXISTS exhibits (
  slug      TEXT PRIMARY KEY,
  name      TEXT NOT NULL,        -- the coined name of the move
  actor     TEXT NOT NULL,        -- company, person, or agent
  kind      TEXT NOT NULL,        -- company | person | agent
  from_edge TEXT NOT NULL,        -- capital|talent|compute|data|distribution|technology
  to_edge   TEXT NOT NULL,
  era       TEXT,
  summary   TEXT NOT NULL,
  source_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_exhibits_edges ON exhibits (from_edge, to_edge);
