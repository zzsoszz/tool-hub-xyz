-- 论坛数据表（Cloudflare D1）
-- 初始化：npx wrangler d1 execute tool-hub --remote --file=src/schema.sql

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  parent INTEGER,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comments_item ON comments (item, hidden, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS votes (
  item TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_votes_item ON votes (item);
