import { fetchUrl } from './http.mjs';
import { cleanText, dayKey, parseDate } from './normalize.mjs';
import { parseFeed } from './parse.mjs';
import { parseJsonFeed } from './adapters.mjs';
import { extractArticleBody, markdownToHtml, sanitizeArticle } from './content.mjs';

export function resolveSourceUrl(source, { now = new Date(), sinceDays = 7, timezone = 'Asia/Shanghai' } = {}) {
  if (!source.url.includes('{SINCE}')) return source.url;
  return source.url.replace('{SINCE}', dayKey(new Date(now.getTime() - sinceDays * 86_400_000), timezone));
}

const PAGE_SIZE = 20;

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 一个信息源可以按关键词或仓库列表展开成多次检索：URL 里写 {QUERY} / {REPO} 占位，源本身只配一条。
export function sourceKeywords(source, searchKeywords = []) {
  const declared = source.keywordsFrom ? searchKeywords : source.keywords;
  const list = Array.isArray(declared) ? declared.map((keyword) => String(keyword ?? '').trim()).filter(Boolean) : [];
  return list.slice(0, Number(source.maxQueries ?? 10));
}

export function sourceUrls(source, { now = new Date(), sinceDays = 7, timezone = 'Asia/Shanghai', searchKeywords = [] } = {}) {
  const since = dayKey(new Date(now.getTime() - sinceDays * 86_400_000), timezone);
  const cap = Number(source.maxQueries ?? 10);
  if (source.url.includes('{REPO}')) {
    return (Array.isArray(source.repos) ? source.repos : []).slice(0, cap).map((repo) => source.url.replaceAll('{REPO}', repo).replaceAll('{SINCE}', since));
  }
  if (source.url.includes('{QUERY}')) {
    return sourceKeywords(source, searchKeywords)
      .map((keyword) => source.url.replaceAll('{QUERY}', encodeURIComponent(keyword)).replaceAll('{SINCE}', since));
  }
  return [resolveSourceUrl(source, { now, sinceDays, timezone })];
}

function pageUrl(url, page) {
  if (page <= 1) return url;
  return `${url}${url.includes('?') ? '&' : '?'}page=${page}`;
}

// 论坛栏目按「最后回复时间」倒序排列，本页最活跃的帖子掉出窗口时，后面的页只会更旧。
function newestActivity(topics) {
  let newest = null;
  for (const topic of topics ?? []) {
    const date = parseDate(topic?.lastposttimeISO ?? topic?.timestampISO ?? topic?.lastposttime ?? topic?.timestamp);
    if (date && (!newest || date > newest)) newest = date;
  }
  return newest;
}

export async function fetchCategoryPages(source, baseUrl, { fetchImpl = fetchUrl, timeoutMs, retries, windowHours, now = new Date() } = {}) {
  const maxPages = Math.max(1, Number(source.pages ?? 1));
  const cutoff = new Date(now.getTime() - Number(source.windowHours ?? windowHours ?? 48) * 3_600_000);
  const items = [];
  let pages = 0;
  let error = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchImpl(pageUrl(baseUrl, page), {
      timeoutMs: source.timeoutMs ?? timeoutMs ?? 15_000,
      retries: source.retries ?? retries ?? 2,
    });
    if (!result.ok) {
      error = result.error;
      break;
    }
    let payload;
    try {
      payload = JSON.parse(result.body);
    } catch (parseError) {
      error = `解析失败: ${parseError.message}`;
      break;
    }
    const pageItems = parseJsonFeed(payload, source);
    pages += 1;
    items.push(...pageItems);
    if (pageItems.length < PAGE_SIZE) break;
    if (payload.pagination?.next?.active === false) break;
    const newest = newestActivity(payload.topics);
    if (newest && newest < cutoff) break;
  }
  return { items, pages, ok: pages > 0, error: pages ? null : error };
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

function keywordPriority(item, keywordPattern) {
  return keywordPattern && keywordPattern.test(`${item.title ?? ''} ${item.summary ?? ''}`) ? 1 : 0;
}

// 补正文的取址规则：默认抓原文页面；GitHub 这类仓库条目改抓 raw README，
// 一次 10 KB 的纯文本请求换掉 400 KB 的仓库页 HTML，正文更干净。
function bodyTarget(item, source) {
  const template = source.bodyUrl;
  if (!template) return item.url;
  const repo = new URL(item.url).pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  if (!repo) return null;
  return template.replaceAll('{REPO}', repo);
}

// 有些信息源只给标题（HF 博客的 feed 连摘要都没有），这类条目既判断不了质量，也没法写导读。
// 对配置了 fetchBody 的源，按“新→旧、热度次之”补取原文正文，抓取顺序执行，不并发打对方站点。
export async function fetchMissingBodies(items, source, options = {}) {
  if (source.fetchBody !== true) return items;
  const limit = Number(source.bodyFetchLimit ?? 6);
  const { fetchImpl = fetchUrl, ...fetchOptions } = options;
  const maxChars = Number(source.bodyMaxChars ?? 4000);
  const pool = items.filter((item) => !item.content && /^https?:/i.test(String(item.url ?? '')));
  const sorted = pool
    .sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')) || engagement(b) - engagement(a));
  // 补正文的预算很紧：先只看那些「门槛都过了、只差正文」的条目，
  // 否则预算会花在必被质量闸门淘汰的存档条目上，入选的条目反而没有正文。
  const worth = typeof options.worthEnriching === 'function' ? options.worthEnriching : null;
  const preferred = worth ? sorted.filter((item) => worth(item, source)) : [];
  const ranked = preferred.length ? preferred : sorted;
  // 关键词检索会把同一个仓库返好几遍，正文预算只花在一次上。
  const targets = new Set();
  const candidates = [];
  for (const item of ranked) {
    if (candidates.length >= limit) break;
    const target = bodyTarget(item, source);
    if (!target || targets.has(target)) continue;
    targets.add(target);
    candidates.push({ item, target });
  }
  for (const { item, target } of candidates) {
    const result = await fetchImpl(target, {
      ...fetchOptions,
      timeoutMs: source.bodyTimeoutMs ?? options.timeoutMs ?? 20_000,
      retries: 0,
    });
    if (!result.ok) continue;
    const looksHtml = /html/i.test(result.contentType ?? '') || /<\s*(html|body|article|main)\b/i.test(String(result.body).slice(0, 512));
    const article = looksHtml
      ? extractArticleBody(result.body, { baseUrl: item.url, maxChars })
      : sanitizeArticle(markdownToHtml(String(result.body ?? '')), { baseUrl: item.url, maxChars });
    if (!article) continue;
    item.content = article;
    // 正文拿到了不一定导读就更好：只有更长的开头才值得盖掉 feed 原来的摘要。
    const lead = cleanText(article.lead, 320);
    if (lead.length > String(item.summary ?? '').length) item.summary = lead;
  }
  return items;
}

// 论坛类源（NodeBB）列表接口只带最后一条回复的 teaser，正文缺失会被质量闸门淘汰；
// 这里为热度靠前的帖子补取主贴正文、投票与版主精选标记，让“有理有据/实操”判定成立。
export async function enrichForumTopics(items, source, options = {}) {
  if (source.adapter !== 'nodebb') return items;
  const limit = Number(source.enrichLimit ?? 8);
  const { fetchImpl = fetchUrl, ...fetchOptions } = options;
  // 翻页之后候选多出几十条，补正文的预算优先给生态关键词（strata、comfyui 这类）和真正聊出内容的帖子。
  const keywords = sourceKeywords(source, options.searchKeywords);
  const keywordPattern = keywords.length ? new RegExp(keywords.map(escapeForRegex).join('|'), 'i') : null;
  // 发布日掉出窗口的帖子后面也会被丢掉，别为它们花补正文的请求。
  const cutoffMs = Date.now() - Number(source.windowHours ?? 48) * 3_600_000;
  const inWindow = (item) => !item.published || new Date(item.published).getTime() >= cutoffMs;
  const candidates = items
    .filter((item) => item.id && inWindow(item))
    .sort((a, b) => keywordPriority(b, keywordPattern) - keywordPriority(a, keywordPattern) || engagement(b) - engagement(a))
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
    const content = sanitizeArticle(mainPost?.content ?? '', { baseUrl: item.url });
    if (content) {
      item.content = content;
      item.summary = cleanText(content.lead, 320);
    }
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

function limitItems(items, source) {
  const cap = Number(source.maxItems ?? 0);
  return cap > 0 && items.length > cap ? items.slice(0, cap) : items;
}

export async function fetchSource(source, options = {}) {
  const urls = sourceUrls(source, options);
  if (!urls.length) {
    return { source, url: source.url, ok: false, items: [], status: 0, error: '检索关键词为空', queries: 0 };
  }
  const items = [];
  const errors = [];
  let succeeded = 0;
  for (const url of urls) {
    if (source.adapter === 'nodebb') {
      const page = await fetchCategoryPages(source, url, options);
      items.push(...limitItems(page.items, source));
      if (page.ok) succeeded += 1;
      else errors.push(page.error ?? '抓取失败');
      continue;
    }
    const result = await fetchUrl(url, {
      timeoutMs: source.timeoutMs ?? options.timeoutMs ?? 15_000,
      retries: source.retries ?? options.retries ?? 2,
    });
    if (!result.ok) {
      errors.push(result.error ?? `HTTP ${result.status}`);
      continue;
    }
    try {
      items.push(...limitItems(parseSourceBody(source, result.body), source));
      succeeded += 1;
    } catch (error) {
      errors.push(`解析失败: ${error.message}`);
    }
  }
  if (!succeeded) {
    return { source, url: urls[0], ok: false, items: [], status: 0, error: errors[0] ?? '所有检索均失败', queries: urls.length };
  }
  await enrichForumTopics(items, source, options);
  await fetchMissingBodies(items, source, options);
  return { source, url: urls[0], ok: true, items, status: 200, error: errors.length ? `${errors.length}/${urls.length} 次检索失败` : null, queries: urls.length };
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
