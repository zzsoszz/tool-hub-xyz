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
  const isPracticalTerm = buildMatcher(filters.practicalKeywords ?? []);
  const qualityConfig = filters.quality ?? {};
  const isThin = buildMatcher(qualityConfig.thinKeywords ?? []);
  const isSubstantive = buildMatcher(qualityConfig.substantiveKeywords ?? []);
  const isActionTerm = buildMatcher(qualityConfig.actionableKeywords ?? filters.practicalKeywords ?? []);
  const evidencePattern = new RegExp(
    [
      ...(qualityConfig.evidenceKeywords ?? []).map(escapeForRegex),
      '\\d+\\s*(?:toks?/s|tokens?/s|tok/s|gb|mb|ms|秒|分钟|%|倍|w|k)',
    ].join('|'),
    'i',
  );
  const categoryMatchers = categories.map((category) => ({
    id: category.id,
    label: category.label,
    hits: buildMatcher(category.keywords ?? []),
  }));
  const tagMatchers = (filters.tags ?? []).map((tag) => ({
    id: tag.id,
    label: tag.label,
    hits: buildMatcher(tag.keywords ?? []),
  }));

  function itemText(item) {
    return [item.title, item.summary, item.author, (item.categories ?? []).join(' '), item.sourceName, excerpt(item)]
      .filter(Boolean)
      .join(' \u2022 ');
  }

  // 正文比摘要更能说明「有没有干货」，但只取前 1500 字，避免远处的关键词主导判定。
  function excerpt(item) {
    return cleanText(item.content?.text ?? '', 1500);
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

  function practicality(item) {
    const text = itemText(item);
    const hits = isPracticalTerm(text);
    const moneyOrLocal = item.category === 'money' || item.category === 'local' ? 1 : 0;
    return hits + moneyOrLocal;
  }

  function actionability(item) {
    const text = `${cleanText(item.title, 220)} \u2022 ${cleanText(item.summary ?? '', 1200)} \u2022 ${excerpt(item)}`;
    let hits = isActionTerm(text);
    if (['tools', 'local', 'money', 'apps'].includes(item.category)) hits += 1;
    return hits;
  }

  function hasEvidence(item) {
    const text = `${cleanText(item.title, 220)} \u2022 ${cleanText(item.summary ?? '', 1500)} \u2022 ${excerpt(item)}`;
    return evidencePattern.test(text);
  }

  // 带配图（实测截图、图表）的条目对人类更友好，评分上给一点偏好。
  function hasIllustration(item) {
    return /<img\s/i.test(String(item.content?.html ?? ''));
  }

  function quality(item, source) {
    const title = cleanText(item.title, 220);
    const summary = cleanText(item.summary ?? '', 4000);
    const bodyChars = Math.max(summary.length, cleanText(item.content?.text ?? '', 4000).length);
    const metrics = item.metrics ?? {};
    const reasons = [];
    const tier = item.tier ?? source?.tier;
    let score = { 1: 3, 2: 2, 3: 1 }[tier] ?? 2;
    const action = actionability({ ...item, category: item.category ?? categorize(item) });
    const evidence = hasEvidence(item);

    const levels = qualityConfig.summaryLevels ?? [220, 120, 60];
    if (bodyChars >= levels[0]) score += 3;
    else if (bodyChars >= levels[1]) score += 2;
    else if (bodyChars >= levels[2]) score += 1;
    else reasons.push('正文太短');

    const substance = isSubstantive(`${title} \u2022 ${summary}`);
    if (substance) score += Math.min(3, substance);
    else reasons.push('看不出论证/干货');

    const signal = (metrics.points ?? 0) + (metrics.stars ?? 0) + (metrics.upvotes ?? 0) + (metrics.comments ?? 0);
    if (signal >= 200) score += 3;
    else if (signal >= 60) score += 2;
    else if (signal >= 15) score += 1;
    if (evidence) score += 2;
    else reasons.push('没有具体数据');
    if (item.excellent) score += 3;
    const illustrated = qualityConfig.illustrationBonus ? (hasIllustration(item) ? qualityConfig.illustrationBonus : 0) : 0;
    score += illustrated;

    if (isThin(`${title} \u2022 ${summary}`)) {
      score -= 3;
      reasons.push('疑似推广或水帖');
    }
    if (title.length < (qualityConfig.minTitleChars ?? 10)) {
      score -= 3;
      reasons.push('标题过短');
    }

    const floors = (qualityConfig.sourceFloors ?? {})[item.sourceId] ?? source?.quality ?? null;
    if (floors) {
      for (const [key, minimum] of Object.entries(floors)) {
        const value = key === 'summaryChars' ? bodyChars : Number(metrics[key] ?? 0);
        if (value < minimum) {
          score -= 2;
          reasons.push(`${key} < ${minimum}`);
        }
      }
    }

    const minimum = qualityConfig.minQuality ?? 6;
    if (action === 0 && score < minimum + (qualityConfig.pureNewsBonus ?? 2)) {
      reasons.push('纯资讯且不够深');
      return { ok: false, score: Number(score.toFixed(2)), evidence, action, reasons };
    }
    return { ok: score >= minimum, score: Number(score.toFixed(2)), evidence, action, reasons };
  }

  function tagsFor(item) {
    const text = itemText(item);
    const scored = [];
    for (const tag of tagMatchers) {
      const hits = tag.hits(text);
      if (hits > 0) scored.push({ id: tag.id, label: tag.label, hits });
    }
    scored.sort((a, b) => b.hits - a.hits);
    return scored.slice(0, 4).map((tag) => tag.id);
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
    const practicalBonus = Math.min(5, practicality(item) * 1.2);
    const title = cleanText(item.title, 220).toLowerCase();
    const freshnessWord = /(release|launch|announc|introduc|发布|上线|开源|宣布)/i.test(title) ? 2 : 0;
    return Number((tier + recency + buzz + relevanceBonus + practicalBonus + freshnessWord).toFixed(2));
  }

  return { relevance, isRelevant, categorize, passesGuards, score, practicality, quality, actionability, hasEvidence, tagsFor, tags: tagMatchers.map(({ id, label }) => ({ id, label })), categories };
}
