// 列表视图规则：月份归类、年月筛选、排序模式。构建期、浏览器端和测试都读这一份，避免两套规则各自漂移。

const monthPattern = /^\d{4}-\d{2}$/;

export const sortModes = {
  quality: { label: '质量评分', hint: '按质量评分从高到低' },
  newest: { label: '最新发布', hint: '按原文发布时间从新到旧' },
  score: { label: '来源热度', hint: '按来源热度从高到低' },
};

export function sortMode(value) {
  return sortModes[value] ? value : 'quality';
}

// 月份优先看原文发布时间，缺发布时间才退回条目所属日报日期。
export function monthKey(entry) {
  const key = String(entry?.published ?? entry?.day ?? entry?.month ?? '').slice(0, 7);
  return monthPattern.test(key) ? key : '';
}

export function monthsFor(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = monthKey(entry);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, count]) => ({ key, year: key.slice(0, 4), month: key.slice(5, 7), count }));
}

export function yearsFor(entries) {
  return [...new Set(monthsFor(entries).map((entry) => entry.year))].sort((a, b) => (a < b ? 1 : -1));
}

export function matchesPeriod(entry, { month = '', year = '' } = {}) {
  const key = monthKey(entry);
  if (month) return key === month;
  if (year) return key.slice(0, 4) === year;
  return true;
}

function publishedKey(entry) {
  return String(entry.published ?? entry.day ?? '');
}

export function compareEntries(a, b, mode = 'quality') {
  const quality = (b.quality ?? 0) - (a.quality ?? 0);
  if (mode === 'newest') {
    return publishedKey(b).localeCompare(publishedKey(a)) || quality;
  }
  if (mode === 'score') {
    return (b.score ?? 0) - (a.score ?? 0) || quality;
  }
  return quality
    || (b.rank ?? 0) - (a.rank ?? 0)
    || publishedKey(b).localeCompare(publishedKey(a));
}

export function sortEntries(entries, mode = 'quality') {
  return [...entries].sort((a, b) => compareEntries(a, b, sortMode(mode)));
}
