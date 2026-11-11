import { dayKey, titleKey, urlKey } from './normalize.mjs';

export function normalizeSeen(raw) {
  const entries = raw?.entries ?? {};
  const seen = new Map();
  for (const [key, day] of Object.entries(entries)) {
    if (typeof key === 'string' && typeof day === 'string') seen.set(key, day);
  }
  return seen;
}

export function itemKeys(item) {
  return [urlKey(item.url), titleKey(item.title)].filter(Boolean);
}

// markSeen 决定一条条目是不是「真的处理过了」：窗口外的存档条目只用来兜底，
// 把它们一律记成已见过，会让 seen.json 被整站历史灌满，之后几天什么都采不到。
export function filterNewItems(items, seen, { day, markSeen = () => true }) {
  const fresh = [];
  const duplicates = [];
  const batch = new Set();
  for (const item of items) {
    const keys = itemKeys(item);
    if (!keys.length) {
      duplicates.push(item);
      continue;
    }
    if (keys.some((key) => seen.has(key)) || keys.some((key) => batch.has(key))) {
      duplicates.push(item);
      continue;
    }
    for (const key of keys) {
      batch.add(key);
      if (markSeen(item)) seen.set(key, day);
    }
    fresh.push(item);
  }
  return { fresh, duplicates };
}

export function pruneSeen(seen, { retentionDays = 45, timezone = 'Asia/Shanghai', now = new Date(), limit = 8000 } = {}) {
  const cutoff = dayKey(new Date(now.getTime() - retentionDays * 86_400_000), timezone);
  for (const [key, day] of seen) {
    if (day < cutoff) seen.delete(key);
  }
  if (seen.size <= limit) return cutoff;
  const keep = [...seen.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).slice(0, limit);
  seen.clear();
  for (const [key, day] of keep) seen.set(key, day);
  return cutoff;
}

export function serializeSeen(seen) {
  const sorted = [...seen.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  return { version: 1, count: sorted.length, entries: Object.fromEntries(sorted) };
}
