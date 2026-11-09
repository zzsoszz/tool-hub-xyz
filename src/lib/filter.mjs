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
  const gate = qualityConfig.practicalGate ?? {};
  const stepMatcher = buildMatcher(gate.stepKeywords ?? []);
  const dataMatcher = buildMatcher(gate.dataKeywords ?? []);
  const actionCategories = new Set(gate.actionCategories ?? ['apps', 'tools', 'hardware', 'local', 'money']);
  const aliases = filters.categoryAliases ?? {};
  const subMatchers = (filters.subcategories ?? []).map((sub) => ({
    parent: sub.parent,
    id: sub.id,
    label: sub.label,
    hits: buildMatcher(sub.keywords ?? []),
  }));
  // 子类关键词比一级分类关键词更具体（sglang、comfyui 这类专有名词只写在子类里），
  // 定一级分类时也带上该分类下最强子类的命中数，否则框架类文章会被「实测/评测」抢走。
  function subcategorySignal(categoryId, text) {
    let best = 0;
    for (const sub of subMatchers) {
      if (sub.parent !== categoryId) continue;
      const score = sub.hits(text);
      if (score > best) best = score;
    }
    return best * 0.5;
  }

  function itemText(item) {
    return [item.title, item.summary, item.author, (item.categories ?? []).join(' '), item.sourceName, excerpt(item)]
      .filter(Boolean)
      .join(' \u2022 ');
  }

  // 正文比摘要更能说明「有没有干货」，但只取前 1500 字，避免远处的关键词主导判定。
  function excerpt(item) {
    return cleanText(item.content?.text ?? '', 1500);
  }

  // 分类只看文章内容本身：来源自己的栏目名和站点名不参与判断。
  function articleText(item) {
    return [item.title, item.zhTitle, item.summary, item.zhSummary, excerpt(item)]
      .filter(Boolean)
      .join(' \u2022 ');
  }

  // 复现步骤：正文里有代码块/有序步骤，或标题摘要直接写着怎么配、怎么装、怎么跑。
  function hasReproSteps(item) {
    const html = String(item.content?.html ?? '');
    if (/<(pre|code|ol)\b/i.test(html)) return true;
    const text = `${cleanText(item.title, 220)} \u2022 ${cleanText(item.summary ?? '', 1200)} \u2022 ${cleanText(item.content?.text ?? '', 2000)}`;
    if (stepMatcher(text) > 0) return true;
    return /^\s*(?:\$|npm |npx |pip |uv |docker |git |curl |wget |brew |python |uvx )\b/m.test(cleanText(item.content?.text ?? '', 3000));
  }

  // 可核查的数据：带单位的数字（tok/s、GB、ms、%、倍）或评测/跑分/成本这类词。
  function hasHardData(item) {
    const text = `${cleanText(item.title, 220)} \u2022 ${cleanText(item.summary ?? '', 1500)} \u2022 ${excerpt(item)}`;
    if (evidencePattern.test(text)) return true;
    return dataMatcher(text) > 0;
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
    return isPracticalTerm(articleText(item));
  }

  function actionability(item) {
    let hits = isActionTerm(articleText(item));
    if (actionCategories.has(item.category)) hits += 1;
    return hits;
  }

  function hasEvidence(item) {
    return hasHardData(item);
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
    const steps = hasReproSteps(item);

    // 只保留实践性内容：既给不出数据也给不出复现步骤的，直接淘汰。
    if (gate.requireDataOrSteps !== false && !evidence && !steps) {
      reasons.push('既没有数据也没有复现步骤');
      return { ok: false, score: Number(score.toFixed(2)), evidence, action, steps, reasons };
    }
    const minAction = Number(gate.minAction ?? 1);
    if (action < minAction) {
      reasons.push('缺乏可操作内容');
      return { ok: false, score: Number(score.toFixed(2)), evidence, action, steps, reasons };
    }
    const minPractical = Number(gate.minPractical ?? 1);
    if (practicality(item) < minPractical) {
      reasons.push('没有实践性线索');
      return { ok: false, score: Number(score.toFixed(2)), evidence, action, steps, reasons };
    }

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
    return { ok: score >= minimum, score: Number(score.toFixed(2)), evidence, action, steps, reasons };
  }

  function tagsFor(item) {
    const text = articleText(item);
    const scored = [];
    for (const tag of tagMatchers) {
      const hits = tag.hits(text);
      if (hits > 0) scored.push({ id: tag.id, label: tag.label, hits });
    }
    scored.sort((a, b) => b.hits - a.hits);
    return scored.slice(0, 4).map((tag) => tag.id);
  }

  function categorize(item) {
    const text = articleText(item);
    let best = null;
    let bestScore = 0;
    for (const category of categoryMatchers) {
      const score = category.hits(text) + subcategorySignal(category.id, text);
      if (score > bestScore) {
        bestScore = score;
        best = category;
      }
    }
    if (best && bestScore > 0) return best.id;
    // 文章里读不出倾向时，才退回来源声明的栏目（旧栏目名走别名映射）。
    const declared = aliases[item.declaredCategory] ?? item.declaredCategory;
    if (declared && categories.some((category) => category.id === declared)) return declared;
    return categories[categories.length - 1]?.id ?? 'bench';
  }

  // 子类同样只看文章内容；父类没有匹配到子类时留空，栏目页里归到「其他」。
  function subcategoryFor(item, categoryId) {
    const parent = categoryId ?? item.category ?? categorize(item);
    const text = articleText(item);
    let best = null;
    let bestScore = 0;
    for (const sub of subMatchers) {
      if (sub.parent !== parent) continue;
      const score = sub.hits(text);
      if (score > bestScore) {
        bestScore = score;
        best = sub;
      }
    }
    return best && bestScore > 0 ? best.id : null;
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

  return {
    relevance,
    isRelevant,
    categorize,
    subcategoryFor,
    subcategories: subMatchers.map(({ parent, id, label }) => ({ parent, id, label })),
    passesGuards,
    score,
    practicality,
    quality,
    actionability,
    hasEvidence,
    hasReproSteps,
    hasHardData,
    tagsFor,
    tags: tagMatchers.map(({ id, label }) => ({ id, label })),
    categories,
  };
}
