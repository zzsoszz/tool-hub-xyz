import { createHash } from 'node:crypto';

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
  const filtered = section?.categories ? pool.filter((item) => section.categories.includes(item.category)) : pool;
  return filtered.slice(0, limit);
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
