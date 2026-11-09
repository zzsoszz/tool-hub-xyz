import { buildCommentTree, COMMENT_LIMITS, isValidSlug, validateComment } from './lib/forum.mjs';
import {
  clearSessionCookieHeader,
  createSessionToken,
  loginAllowed,
  normalizeReason,
  normalizeSlug,
  parseCookies,
  readSessionToken,
  sameOriginAndCsrf,
  SESSION_COOKIE,
  sessionCookieHeader,
  timingSafeEqual,
} from './lib/admin.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
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

function slugList(raw) {
  return String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isValidSlug)
    .slice(0, 80);
}

function sessionSecret(env) {
  const secret = env.SESSION_SECRET ?? env.MODERATION_TOKEN ?? '';
  if (!secret) throw new Error('缺少 SESSION_SECRET 或 MODERATION_TOKEN');
  return secret;
}

async function sessionState(env, request) {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!token) return { valid: false, reason: 'missing' };
  return await readSessionToken(sessionSecret(env), token);
}

async function recentLoginFailures(database, ipHash, windowStart) {
  const row = await database
    .prepare('SELECT COUNT(*) AS total FROM admin_attempts WHERE ip_hash = ? AND ok = 0 AND created_at >= ?')
    .bind(ipHash, windowStart)
    .first();
  return row?.total ?? 0;
}

async function recordLoginAttempt(database, ipHash, ok) {
  await database
    .prepare('INSERT INTO admin_attempts (ip_hash, ok, created_at) VALUES (?, ?, ?)')
    .bind(ipHash, ok ? 1 : 0, new Date().toISOString())
    .run();
}

function guardRequest(request) {
  const guard = sameOriginAndCsrf(request);
  if (guard.ok) return guard;
  return { ok: false, message: guard.reason === 'csrf' ? '请求缺少站内标识头，请从页面上操作' : '跨站请求被拒绝', status: 403 };
}

async function adminLogin(request, env) {
  const guard = guardRequest(request);
  if (!guard.ok) return fail(guard.message, guard.status);
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return fail('站点还没配置管理员账号', 503);

  const ipHash = await hashIp(clientIp(request), env.COMMENT_SALT);
  const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();
  const failures = await recentLoginFailures(db(env), ipHash, windowStart);
  if (!loginAllowed({ failures })) return fail('登录失败次数太多，请 15 分钟后再试', 429, { retryAfter: 900 });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return fail('请求体不是合法 JSON');
  }
  const userOk = timingSafeEqual(String(payload?.user ?? ''), env.ADMIN_USER);
  const passwordOk = timingSafeEqual(String(payload?.password ?? ''), env.ADMIN_PASSWORD);
  await recordLoginAttempt(db(env), ipHash, userOk && passwordOk);
  if (!userOk || !passwordOk) return fail('账号或密码不对', 401);

  const token = await createSessionToken(sessionSecret(env), { user: env.ADMIN_USER });
  return json({ ok: true, user: env.ADMIN_USER }, 200, { 'set-cookie': sessionCookieHeader(token) });
}

function adminLogout() {
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookieHeader() });
}

async function hiddenSlugs(database) {
  const rows = await database.prepare('SELECT slug FROM hidden_items ORDER BY hidden_at DESC').all();
  return (rows.results ?? []).map((row) => row.slug);
}

async function isHidden(env, slug) {
  return Boolean(await db(env).prepare('SELECT slug FROM hidden_items WHERE slug = ?').bind(slug).first());
}

async function setItemHidden(request, env, slug, hidden) {
  const guard = guardRequest(request);
  if (!guard.ok) return fail(guard.message, guard.status);
  const session = await sessionState(env, request);
  if (!session.valid) return fail(session.reason === 'expired' ? '登录已过期，请重新登录' : '需要管理员登录', 401);

  let reason = '';
  if (hidden) {
    const payload = await request.json().catch(() => ({}));
    reason = normalizeReason(payload?.reason);
  }
  const entry = (await itemIndex(env))[slug] ?? {};
  if (hidden) {
    await db(env)
      .prepare('INSERT OR REPLACE INTO hidden_items (slug, url, title, reason, actor, hidden_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(slug, entry.url ?? '', entry.title ?? '', reason, session.user, new Date().toISOString())
      .run();
  } else {
    await db(env).prepare('DELETE FROM hidden_items WHERE slug = ?').bind(slug).run();
  }
  return json({ ok: true, slug, hidden, hiddenSlugs: await hiddenSlugs(db(env)) });
}

function hiddenItemPage(slug) {
  return new Response(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>条目已下架 · tool-hub.xyz</title><link rel="stylesheet" href="/styles.css"></head>
<body><main><section class="lede"><h1>这条内容已下架</h1>
<p class="lede-meta">编号 ${slug} 已被管理员撤下，不再展示。</p>
<p class="lede-more"><a href="/">返回今日日报</a><a href="/archive">看归档</a></p></section></main></body></html>`, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
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
    if (request.method === 'GET' && path === '/api/admin/session') {
      const session = await sessionState(env, request);
      return json({ ok: true, admin: session.valid, user: session.user ?? null });
    }
    if (request.method === 'POST' && path === '/api/admin/login') return await adminLogin(request, env);
    if (request.method === 'POST' && path === '/api/admin/logout') return adminLogout();

    if (request.method === 'GET' && path === '/api/hidden') {
      return json({ ok: true, slugs: await hiddenSlugs(db(env)) }, 200, { 'cache-control': 'public, max-age=30' });
    }

    const hideMatch = path.match(/^\/api\/items\/([0-9a-f]{12})\/(hide|unhide)$/);
    if (hideMatch && request.method === 'POST') {
      const slug = normalizeSlug(hideMatch[1]);
      if (!slug) return fail('条目编号无效', 404);
      return await setItemHidden(request, env, slug, hideMatch[2] === 'hide');
    }

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
    // 已下架的条目即使还留在上一版静态页面里，也要当场挡掉。
    if (env.DB && request.method === 'GET') {
      const itemSlug = normalizeSlug(url.pathname.match(/^\/item\/([0-9a-f]{12})$/)?.[1]);
      if (itemSlug && await isHidden(env, itemSlug)) return hiddenItemPage(itemSlug);
      if (url.pathname === '/data/items.json') {
        const index = await itemIndex(env);
        const hidden = new Set(await hiddenSlugs(db(env)));
        const visible = Object.fromEntries(Object.entries(index).filter(([slug]) => !hidden.has(slug)));
        return json(visible, 200, { 'cache-control': 'public, max-age=120' });
      }
    }
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};
