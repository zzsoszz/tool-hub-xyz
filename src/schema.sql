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

-- 管理员下架的条目：构建期与运行时都按这张表剔除内容。
CREATE TABLE IF NOT EXISTS hidden_items (
  slug TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'admin',
  hidden_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hidden_items_time ON hidden_items (hidden_at DESC);

-- 管理员登录尝试（含失败次数），用于按 IP 限流；只存哈希，不存明文 IP。
CREATE TABLE IF NOT EXISTS admin_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_attempts ON admin_attempts (ip_hash, ok, created_at);
