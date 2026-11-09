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

// 条目正文里的第一张配图，用于首页图文卡片；图标/头像类小图不算配图。
export function itemImage(item) {
  const html = String(item?.content?.html ?? '');
  for (const match of html.matchAll(/<img\s+src="([^"]+)"/g)) {
    const src = match[1].replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(src)) continue;
    if (/(logo|icon|avatar|badge|emoji|favicon)/i.test(src)) continue;
    return src;
  }
  return null;
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
