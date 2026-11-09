import { cleanText } from './normalize.mjs';

const ASCII_ONLY = /^[\x00-\x7F]+$/;
const TIER_WEIGHT = { 1: 6, 2: 3, 3: 1 };

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(keywords) {
  const patterns = [];
  const plain = [];
  for (const keyword of keywords) {
    const value = String(keyword).trim();
    if (!value) continue;
    if (ASCII_ONLY.test(value)) {
      const core = value.replace(/\b$/u, '');
      patterns.push(new RegExp(`(?<![a-z0-9])${escapeForRegex(core)}(?![a-z0-9])`, 'iu'));
    } else {
      plain.push(value.toLowerCase());
    }
  }
  return (text) => {
    const haystack = text.toLowerCase();
    let hits = 0;
    for (const pattern of patterns) if (pattern.test(haystack)) hits += 1;
    for (const value of plain) if (haystack.includes(value)) hits += 1;
    return hits;
  };
}

export function createFilter(filters) {
  const categories = filters.categories ?? [];
  const isNoise = buildMatcher(filters.noiseKeywords ?? []);
  const isRelevantTerm = buildMatcher(filters.relevantKeywords ?? []);
  const categoryMatchers = categories.map((category) => ({
    id: category.id,
    label: category.label,
    hits: buildMatcher(category.keywords ?? []),
  }));

  function itemText(item) {
    return [item.title, item.summary, item.author, (item.categories ?? []).join(' '), item.sourceName]
      .filter(Boolean)
      .join(' \u2022 ');
  }

  function relevance(item) {
    const text = itemText(item);
    if (isNoise(text) > 0 && isRelevantTerm(text) === 0) return 0;
    const matched = isRelevantTerm(text);
    if (item.trustCategory) return matched + 1;
    return matched;
  }

  function isRelevant(item) {
    const text = itemText(item);
    if (isNoise(text) > 0 && isRelevantTerm(text) === 0) return false;
    return item.trustCategory || relevance(item) > 0;
  }

  function categorize(item) {
    const text = itemText(item);
    let best = null;
    let bestScore = 0;
    for (const category of categoryMatchers) {
      const score = category.hits(text) + (category.id === item.declaredCategory ? 1.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = category;
      }
    }
    if (best) return best.id;
    return item.declaredCategory ?? categories[categories.length - 1]?.id ?? 'products';
  }

  function passesGuards(item, source) {
    const minimums = source?.minMetrics;
    if (!minimums) return true;
    const metrics = item.metrics ?? {};
    return Object.entries(minimums).every(([key, minimum]) => (metrics[key] ?? 0) >= minimum);
  }

  function score(item, now = new Date()) {
    const tier = TIER_WEIGHT[item.tier] ?? 2;
    const publishedAt = item.published ? new Date(item.published) : now;
    const hoursOld = Math.min(Math.max((now.getTime() - publishedAt.getTime()) / 3_600_000, 0), 96);
    const recency = 8 * (1 - hoursOld / 96);
    const metrics = item.metrics ?? {};
    const signal = (metrics.points ?? 0) + (metrics.stars ?? 0) + (metrics.upvotes ?? 0) + (metrics.comments ?? 0);
    const buzz = Math.min(6, Math.log10(1 + signal) * 3);
    const relevanceBonus = Math.min(4, relevance(item) * 1.2);
    const title = cleanText(item.title, 220).toLowerCase();
    const freshnessWord = /(release|launch|announc|introduc|发布|上线|开源|宣布)/i.test(title) ? 2 : 0;
    return Number((tier + recency + buzz + relevanceBonus + freshnessWord).toFixed(2));
  }

  return { relevance, isRelevant, categorize, passesGuards, score, categories };
}
