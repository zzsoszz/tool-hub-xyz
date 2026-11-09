import { fetchUrl } from './http.mjs';
import { cleanText, dayKey, summarize } from './normalize.mjs';
import { parseFeed } from './parse.mjs';
import { parseJsonFeed } from './adapters.mjs';

export function resolveSourceUrl(source, { now = new Date(), sinceDays = 7, timezone = 'Asia/Shanghai' } = {}) {
  if (!source.url.includes('{SINCE}')) return source.url;
  return source.url.replace('{SINCE}', dayKey(new Date(now.getTime() - sinceDays * 86_400_000), timezone));
}

export function parseSourceBody(source, body) {
  const trimmed = String(body ?? '').trimStart();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (source.kind === 'json' || (looksJson && !trimmed.startsWith('<'))) {
    return parseJsonFeed(JSON.parse(trimmed), source);
  }
  return parseFeed(body, source);
}

function engagement(item) {
  const metrics = item.metrics ?? {};
  return (item.excellent ? 100 : 0) + (metrics.points ?? 0) * 3 + (metrics.comments ?? 0) * 2 + Math.min(10, (metrics.views ?? 0) / 50);
}

// 论坛类源（NodeBB）列表接口只带最后一条回复的 teaser，正文缺失会被质量闸门淘汰；
// 这里为热度靠前的帖子补取主贴正文、投票与版主精选标记，让“有理有据/实操”判定成立。
export async function enrichForumTopics(items, source, options = {}) {
  if (source.adapter !== 'nodebb') return items;
  const limit = Number(source.enrichLimit ?? 8);
  const { fetchImpl = fetchUrl, ...fetchOptions } = options;
  const candidates = items
    .filter((item) => item.id)
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, limit);
  await Promise.all(candidates.map(async (item) => {
    const result = await fetchImpl(`https://lcz.me/api/topic/${item.id}`, {
      ...fetchOptions,
      timeoutMs: source.timeoutMs ?? options.timeoutMs ?? 20_000,
      retries: 1,
    });
    if (!result.ok) return;
    let payload;
    try {
      payload = JSON.parse(result.body);
    } catch {
      return;
    }
    const mainPost = (Array.isArray(payload.posts) ? payload.posts : [])[0];
    const body = summarize(mainPost?.content ?? '', 900);
    if (body.length >= 40) item.summary = body;
    if (payload.title) item.title = cleanText(payload.title, 220);
    item.metrics = {
      ...item.metrics,
      points: payload.votes ?? item.metrics?.points ?? 0,
      comments: Math.max(0, (payload.postcount ?? 1) - 1),
      views: payload.viewcount ?? item.metrics?.views ?? 0,
    };
    item.excellent = Boolean(payload.lczExcellent);
    if (Array.isArray(payload.tags) && payload.tags.length) {
      item.categories = payload.tags.map((tag) => cleanText(tag?.value ?? tag, 40));
    }
  }));
  return items;
}

export async function fetchSource(source, options = {}) {
  const url = resolveSourceUrl(source, options);
  const result = await fetchUrl(url, {
    ...options,
    timeoutMs: source.timeoutMs ?? options.timeoutMs ?? 15_000,
    retries: source.retries ?? options.retries ?? 2,
  });
  if (!result.ok) {
    return { source, url, ok: false, items: [], status: result.status, error: result.error };
  }
  try {
    const items = parseSourceBody(source, result.body);
    await enrichForumTopics(items, source, options);
    return { source, url, ok: true, items, status: result.status, error: null };
  } catch (error) {
    return { source, url, ok: false, items: [], status: result.status, error: `解析失败: ${error.message}` };
  }
}

export async function fetchAllSources(sources, { concurrency = 5, ...rest } = {}) {
  const queue = sources.map((_, index) => index);
  const results = new Array(sources.length);
  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
    for (;;) {
      const index = queue.shift();
      if (index === undefined) return;
      results[index] = await fetchSource(sources[index], rest);
    }
  });
  await Promise.all(workers);
  return results;
}
