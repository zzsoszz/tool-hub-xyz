import { fetchUrl } from './http.mjs';
import { dayKey } from './normalize.mjs';
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

export async function fetchSource(source, options = {}) {
  const url = resolveSourceUrl(source, options);
  const result = await fetchUrl(url, options);
  if (!result.ok) {
    return { source, url, ok: false, items: [], status: result.status, error: result.error };
  }
  try {
    const items = parseSourceBody(source, result.body);
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
