import { createHash } from 'node:crypto';
import { monthKey, sortEntries } from './listview.mjs';

export function itemSlug(item) {
  const seed = String(item?.id ?? item?.url ?? item?.title ?? '');
  return createHash('sha1').update(seed).digest('hex').slice(0, 12);
}

export function rankCompare(a, b) {
  const rankGap = (b.rank ?? 0) - (a.rank ?? 0);
  if (rankGap !== 0) return rankGap;
  const qualityGap = (b.quality ?? 0) - (a.quality ?? 0);
  if (qualityGap !== 0) return qualityGap;
  return (b.score ?? 0) - (a.score ?? 0);
}

// 期号与「第几次上榜」是构建期从已发布的日报序列里算出来的，不写进采集数据。
// digests 必须按 day 倒序（最新在前）：最早一期编号为 1，之后每天加一。
// 序号在「下架剔除」之后才算，否则名次轨会和页面上真正显示的行错位。
export function stampIssues(digests) {
  const firstIssueBySlug = new Map();
  for (const digest of [...digests].reverse()) {
    digest.issue = digests.length - digests.indexOf(digest);
    const items = (digest.categories ?? []).flatMap((group) => group.items ?? []);
    items.sort(rankCompare);
    items.forEach((item, index) => {
      const slug = item.slug ?? itemSlug(item);
      const seenAt = firstIssueBySlug.get(slug);
      if (seenAt === undefined) firstIssueBySlug.set(slug, digest.issue);
      const firstIssue = firstIssueBySlug.get(slug);
      item.position = index + 1;
      item.issue = digest.issue;
      item.firstSeenIssue = firstIssue;
      item.isNew = firstIssue === digest.issue;
      item.issueCount = digest.issue - firstIssue + 1;
    });
  }
  return digests.length;
}

// 正文属性是转义过的，判断之前先还原成真实文本。
function unescapeAttribute(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// 上游 alt 常常只是文件名（image.jpeg），这种 alt 什么也没说，列表配图会退回用标题。
const FILENAME_ALT = /\.[a-z]{3,4}$/i;

// 不算配图的东西：标志 / 头像 / 徽章 / 表情 / 默认占位图，以及「100x100」这类小方块尺寸后缀。
// 按整段匹配，所以 site-logo.png 与 402x226 的封面不会被误伤。
const NOT_AN_ILLUSTRATION = [
  /(^|[^a-z])(logo|icon|avatar|badge|emoji|favicon|sprite|gravatar|placeholder|profile|portrait|silhouette|noavatar|nopic|default|head)([^a-z]|$)/i,
  /(?<!\d)(?:[1-9]\d?|1\d\d|2[0-5]\d)x(?:[1-9]\d?|1\d\d|2[0-5]\d)(?!\d)/,
];

// GitHub 的 README 图走 camo：真地址十六进制编码在路径里，不解码看不出它是 shields.io 徽章还是插图。
function decamouflaged(src) {
  const hex = src.match(/camo\.githubusercontent\.com\/[0-9a-f]{16,}\/([0-9a-f]{8,})/i)?.[1];
  if (!hex || hex.length % 2) return '';
  const decoded = Buffer.from(hex, 'hex').toString('utf8');
  return /^https?:\/\//i.test(decoded) ? decoded : '';
}

// 条目正文里的第一张配图：本地副本与外链都算，图标/头像类小图不算配图。
// archivedOnly 是给列表用的：列表配图只认站内的本地副本，外链热链要么被源站按防盗链拒掉、要么整站搬家，
// 列表里留一个加载不出来的图比不留图更糟。条目页正文仍按原样，缺副本时宁可热链也不留坏图。
export function itemIllustration(item, { archivedOnly = false } = {}) {
  for (const match of String(item?.content?.html ?? '').matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0];
    const src = unescapeAttribute(tag.match(/\bsrc="([^"]*)"/)?.[1] ?? '');
    if (!src) continue;
    if (!/^(https?:\/\/|\/images\/)/i.test(src)) continue;
    if (archivedOnly && !src.startsWith('/images/')) continue;
    const haystack = `${src} ${decamouflaged(src)}`;
    if (NOT_AN_ILLUSTRATION.some((pattern) => pattern.test(haystack))) continue;
    const alt = unescapeAttribute(tag.match(/\balt="([^"]*)"/)?.[1] ?? '').trim();
    return { src, alt, hasAlt: alt.length >= 3 && !FILENAME_ALT.test(alt) };
  }
  return null;
}

export function itemImage(item) {
  return itemIllustration(item)?.src ?? null;
}

export function flattenItems(digests) {
  const seen = new Set();
  const items = [];
  for (const digest of digests) {
    for (const group of digest.categories ?? []) {
      for (const item of group.items ?? []) {
        const slug = itemSlug(item);
        if (seen.has(slug)) continue;
        seen.add(slug);
        items.push({ ...item, slug, day: digest.day });
      }
    }
  }
  items.sort(rankCompare);
  return items;
}

export function itemsIndex(items) {
  const index = {};
  for (const item of items) {
    index[item.slug] = {
      title: item.zhTitle ?? item.title,
      originalTitle: item.zhTitle ? item.title : null,
      url: item.url,
      source: item.sourceName,
      day: item.day,
      category: item.category,
      tags: item.tags ?? [],
      summary: item.summary ?? null,
      text: item.content?.text ?? null,
      published: item.published ?? null,
      score: item.score ?? 0,
      quality: item.quality ?? 0,
      rank: item.rank ?? 0,
      practical: item.practical ?? 0,
      subcategory: item.subcategory ?? null,
      month: monthKey(item),
    };
  }
  return index;
}

export function itemsForSection(items, section, { lookbackDays = 7, now = new Date(), limit = 60 } = {}) {
  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000);
  const pool = items.filter((item) => {
    const stamp = item.published ?? `${item.day}T00:00:00Z`;
    return new Date(stamp) >= cutoff;
  });
  const categories = section?.categories ?? [];
  const facets = section?.tags ?? [];
  const filtered = categories.length || facets.length
    ? pool.filter((item) => categories.includes(item.category) || facets.some((tag) => (item.tags ?? []).includes(tag)))
    : pool;
  return filtered.slice(0, limit);
}

// 子类只看已归入该栏目的条目，避免同一篇文章在两个栏目里各算一次子类。
export function itemsForSubsection(items, section, sub, options = {}) {
  const scoped = itemsForSection(items, section, { ...options, limit: options.limit ?? 200 });
  return scoped.filter((item) => item.subcategory === sub.id);
}

export function subsectionsFor(section, subcategories = []) {
  return (subcategories ?? []).filter((sub) => sub.parent === section.id);
}

export function archivePeriods(items) {
  const buckets = new Map();
  for (const item of items) {
    // 与列表页的年月筛选同源：优先原文发布时间，缺发布时间才退回日报日期。
    const key = monthKey(item) || String(item.day ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => ({ key, year: key.slice(0, 4), month: key.slice(5, 7), items: sortEntries(list, 'quality') }));
}

export function archiveYears(periods) {
  const years = new Map();
  for (const period of periods) {
    if (!years.has(period.year)) years.set(period.year, []);
    years.get(period.year).push(period);
  }
  return [...years.entries()].map(([year, list]) => ({
    year,
    count: list.reduce((sum, period) => sum + period.items.length, 0),
    periods: list,
  }));
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function searchItems(items, query, { limit = 30 } = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle.length < 2) return [];
  const terms = needle.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const item of items) {
    const haystack = [item.zhTitle, item.title, item.zhSummary, item.summary, item.sourceName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const hits = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    if (hits === 0) continue;
    scored.push({ item, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || (b.item.score ?? 0) - (a.item.score ?? 0));
  return scored.slice(0, limit).map((entry) => entry.item);
}
