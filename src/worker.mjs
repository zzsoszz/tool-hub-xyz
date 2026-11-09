import { buildCommentTree, COMMENT_LIMITS, isValidSlug, validateComment } from './lib/forum.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

async function hashIp(ip, salt) {
  const seed = `${salt ?? 'tool-hub'}|${ip ?? 'unknown'}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function timingSafeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function slugList(raw) {
  return String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isValidSlug)
    .slice(0, 80);
}

async function itemIndex(env) {
  try {
    const response = await env.ASSETS.fetch(new Request('https://assets/data/items.json'));
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

async function countsFor(db, slugs) {
  const result = {};
  if (!slugs.length) return result;
  const placeholders = slugs.map(() => '?').join(', ');
  const comments = await db
    .prepare(`SELECT item, COUNT(*) AS total FROM comments WHERE hidden = 0 AND item IN (${placeholders}) GROUP BY item`)
    .bind(...slugs).all();
  const votes = await db
    .prepare(`SELECT item, COUNT(*) AS total FROM votes WHERE item IN (${placeholders}) GROUP BY item`)
    .bind(...slugs).all();
  for (const slug of slugs) {
    result[slug] = { comments: 0, votes: 0 };
  }
  for (const row of comments.results ?? []) result[row.item] = { ...result[row.item], comments: row.total };
  for (const row of votes.results ?? []) result[row.item] = { ...result[row.item], votes: row.total };
  return result;
}

function publicComment(row) {
  return {
    id: row.id,
    item: row.item,
    parent: row.parent ?? null,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
    depth: row.depth ?? 0,
  };
}

async function listComments(db, slug) {
  const rows = await db
    .prepare('SELECT id, item, parent, author, body, created_at FROM comments WHERE item = ? AND hidden = 0 ORDER BY id ASC')
    .bind(slug).all();
  return buildCommentTree(rows.results ?? []).map(publicComment);
}

async function createComment(request, env, slug) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return fail('请求体不是合法 JSON');
  }
  const draft = validateComment({ ...payload, item: slug });
  if (!draft.ok) return fail(draft.errors[0] ?? '留言不符合要求', 422, { errors: draft.errors });

  const ipHash = await hashIp(clientIp(request), env.COMMENT_SALT);
  const now = new Date();
  const windowStart = new Date(now.getTime() - 3_600_000).toISOString();
  const stats = await dbStats(db(env), ipHash, windowStart);
  const last = stats.last?.created_at ?? null;
  const recentCount = stats.recent?.total ?? 0;
  const intervalMs = Number(env.COMMENT_MIN_INTERVAL_MS ?? COMMENT_LIMITS.minIntervalMs);
  const perHour = Number(env.COMMENT_PER_HOUR ?? COMMENT_LIMITS.maxPerHour);
  const gap = now.getTime() - new Date(last ?? 0).getTime();
  if (last && gap < intervalMs) return fail(`太快了，请 ${Math.ceil((intervalMs - gap) / 1000)} 秒后再发`, 429, { retryAfter: Math.ceil((intervalMs - gap) / 1000) });
  if (recentCount >= perHour) return fail('本小时留言次数已用完，请稍后再来', 429, { retryAfter: 3600 });

  if (draft.parent) {
    const parent = await db(env)
      .prepare('SELECT id, item FROM comments WHERE id = ? AND hidden = 0')
      .bind(draft.parent)
      .first();
    if (!parent || parent.item !== slug) return fail('回复的留言不存在');
  }

  const createdAt = now.toISOString();
  const inserted = await db(env)
    .prepare('INSERT INTO comments (item, parent, author, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(slug, draft.parent, draft.author, draft.body, createdAt, ipHash)
    .run();
  return json({
    ok: true,
    comment: { id: Number(inserted.meta?.last_row_id ?? 0), item: slug, parent: draft.parent, author: draft.author, body: draft.body, createdAt, depth: 0 },
  }, 201);
}

function db(env) {
  if (!env.DB) throw new Error('D1 绑定 DB 缺失');
  return env.DB;
}

async function dbStats(database, ipHash, windowStart) {
  const last = await database
    .prepare('SELECT created_at FROM comments WHERE ip_hash = ? ORDER BY created_at DESC LIMIT 1')
    .bind(ipHash)
    .first();
  const recent = await database
    .prepare('SELECT COUNT(*) AS total FROM comments WHERE ip_hash = ? AND created_at >= ?')
    .bind(ipHash, windowStart).first();
  return { last, recent };
}

async function vote(request, slug, env) {
  const ipHash = await hashIp(clientIp(request), env.COMMENT_SALT);
  await db(env)
    .prepare('INSERT OR IGNORE INTO votes (item, ip_hash, created_at) VALUES (?, ?, ?)')
    .bind(slug, ipHash, new Date().toISOString())
    .run();
  const total = await db(env).prepare('SELECT COUNT(*) AS total FROM votes WHERE item = ?').bind(slug).first();
  return json({ ok: true, item: slug, votes: total?.total ?? 0 });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (request.method === 'GET' && path === '/api/counts') {
      const slugs = slugList(url.searchParams.get('items'));
      if (!slugs.length) return json({ ok: true, counts: {} });
      return json({ ok: true, counts: await countsFor(db(env), slugs) });
    }

    if (request.method === 'GET' && path === '/api/comments') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
      const rows = await db(env)
        .prepare('SELECT id, item, parent, author, body, created_at FROM comments WHERE hidden = 0 ORDER BY created_at DESC LIMIT ?')
        .bind(limit).all();
      const slugs = [...new Set((rows.results ?? []).map((row) => row.item))];
      const index = slugs.length ? await itemIndex(env) : {};
      const counts = slugs.length ? await countsFor(db(env), slugs) : {};
      return json({
        ok: true,
        comments: (rows.results ?? []).map((row) => ({
          ...publicComment(row),
          itemTitle: index[row.item]?.title ?? null,
          itemUrl: index[row.item]?.url ?? null,
          replies: counts[row.item]?.comments ?? 0,
        })),
      });
    }

    const commentMatch = path.match(/^\/api\/comments\/([0-9a-f]{12})$/);
    if (commentMatch) {
      const slug = commentMatch[1];
      if (request.method === 'GET') return json({ ok: true, comments: await listComments(db(env), slug) });
      if (request.method === 'POST') return await createComment(request, env, slug);
    }

    const voteMatch = path.match(/^\/api\/votes\/([0-9a-f]{12})$/);
    if (voteMatch && request.method === 'POST') return await vote(request, voteMatch[1], env);

    const moderationMatch = path.match(/^\/api\/comments\/(\d+)$/);
    if (moderationMatch && request.method === 'DELETE') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      if (!env.MODERATION_TOKEN || !timingSafeEqual(token, env.MODERATION_TOKEN)) {
        return fail('需要管理员令牌', 401);
      }
      const updated = await db(env)
        .prepare('UPDATE comments SET hidden = 1 WHERE id = ?')
        .bind(Number(moderationMatch[1]))
        .run();
      return json({ ok: true, changed: updated.meta?.changes ?? 0 });
    }
  } catch (error) {
    return fail(`论坛服务异常：${error.message}`, 500);
  }

  return fail('接口不存在', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return fail('论坛后端未配置 D1 数据库', 503);
      return handleApi(request, env);
    }
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};
