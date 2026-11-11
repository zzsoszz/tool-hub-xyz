// 采集之后、发布之前的独立质量审查：硬规则先跑，再换一个模型做人工式复核，两边都放行才允许发布。
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFilter } from './lib/filter.mjs';
import { itemSlug } from './lib/items.mjs';
import { cleanText } from './lib/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
// 实测可用的文本生成模型：@cf/meta/llama-3.3-70b-instruct 在该账号没有路由（HTTP 400 No route for that URI）。
const DEFAULT_MODEL = '@cf/meta/llama-3.1-70b-instruct';
// 70B 冷启动首次调用常常超时，退回小模型兜底，避免审查 job 因为冷启动/网络红掉。
const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export const REVIEW_RULES = {
  minItems: 3,
  minBodyChars: 120,
  minSummaryChars: 40,
  maxTags: 4,
  agentMaxItems: 12,
  agentBatch: 6,
  agentChars: 900,
  agentExcerptChars: 600,
};

export function agentEndpoint(config, model) {
  if (config.provider === 'cloudflare') {
    return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`;
  }
  return `${config.base}/chat/completions`;
}

export function reviewConfig(env = process.env) {
  const model = env.REVIEW_MODEL || DEFAULT_MODEL;
  const cloudflareKey = env.CLOUDFLARE_API_TOKEN ?? '';
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? '';
  if (cloudflareKey && accountId) {
    const config = {
      enabled: true,
      provider: 'cloudflare',
      model,
      fallbackModel: env.REVIEW_FALLBACK_MODEL || FALLBACK_MODEL,
      key: cloudflareKey,
      accountId,
      base: '',
    };
    return { ...config, endpoint: agentEndpoint(config, model) };
  }
  const openaiKey = env.REVIEW_API_KEY ?? env.TRANSLATE_API_KEY ?? '';
  if (openaiKey) {
    const base = (env.REVIEW_API_BASE || env.TRANSLATE_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    const openaiModel = env.REVIEW_MODEL || 'gpt-4o-mini';
    return {
      enabled: true,
      provider: 'openai',
      model: openaiModel,
      fallbackModel: env.REVIEW_FALLBACK_MODEL || openaiModel,
      key: openaiKey,
      accountId: '',
      base,
      endpoint: `${base}/chat/completions`,
    };
  }
  return { enabled: false, provider: null, model, fallbackModel: FALLBACK_MODEL, key: '', accountId: '', base: '', endpoint: '' };
}

export const SYSTEM_PROMPT = [
  '你是独立质量审查员，和生成这些条目的采集程序不是同一个模型，你的任务是拦下不该发布的内容。',
  '站点只保留实践性内容：有实测数据或有复现步骤，普通人能照着做。',
  '你看到的是摘要加正文开头摘录，摘录被截断是正常的；长度、标签缺失、摘要过短都由硬规则处理，不要把这些当 fail 理由。',
  '必须判 fail：只有新闻转述，既没有数据也没有步骤；标签与内容明显不符或标签重复；分类/子类明显不对。',
  '其余判 pass。',
  '输出：每条一行，写成「序号|pass|一句话理由」或「序号|fail|一句话理由」，序号从 1 开始且与输入一致。',
  '不要输出 JSON、代码块、标题或任何额外文字。',
].join('');

export function parseVerdicts(text) {
  const verdicts = new Map();
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine
      .replace(/[*`#>]/g, '')
      .replace(/[｜∣]/g, '|')
      .replace(/^\s*[-+•]\s*/, '')
      .trim();
    const match = /^(\d{1,3})[\s.、)）|]*(pass|fail|通过|不通过|放行|拦截)(?![a-z0-9])\s*[|:：]?\s*(.*)$/i.exec(line);
    if (!match) continue;
    const index = Number(match[1]);
    if (index < 1 || verdicts.has(index)) continue;
    const failed = /fail|不通过|拦截/i.test(match[2]);
    verdicts.set(index, { verdict: failed ? 'fail' : 'pass', reason: cleanText(match[3] ?? '', 200) });
  }
  return verdicts;
}

export function agentPrompt(items, rules = REVIEW_RULES) {
  return items.map((item, index) => [
    `${index + 1}. 标题：${cleanText(item.zhTitle ?? item.title, 200)}`,
    `   摘要：${cleanText(item.zhSummary ?? item.summary ?? '', rules.agentChars ?? REVIEW_RULES.agentChars)}`,
    `   正文摘录：${cleanText(item.excerpt ?? '', rules.agentExcerptChars ?? REVIEW_RULES.agentExcerptChars) || '（没有正文）'}`,
    `   正文长度：${item.bodyChars} 字 · 分类：${item.category ?? '未分类'}${item.subcategory ? `/${item.subcategory}` : ''} · 标签：${(item.tags ?? []).join(', ') || '（无）'}`,
    `   来源：${item.sourceName ?? ''} · 域名：${item.domain ?? ''}`,
  ].join('\n')).join('\n\n');
}

export async function askAgent(items, config, timeoutMs, model = config.model, rules = REVIEW_RULES) {
  const prompt = agentPrompt(items, rules);
      const body = config.provider === 'cloudflare'
        ? { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], max_tokens: 90 * items.length + 200 }
    : { model, temperature: 0.2, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }] };
  const response = await fetch(agentEndpoint(config, model), {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`审查模型返回 HTTP ${response.status} ${detail}`);
  }
  const payload = await response.json();
  const message = payload?.result?.message ?? payload?.choices?.[0]?.message ?? null;
  const content = message?.content ?? payload?.result?.response ?? message?.reasoning_content ?? '';
  if (!content) throw new Error('审查模型没有返回判定');
  return { verdicts: parseVerdicts(content), raw: typeof content === 'string' ? content : JSON.stringify(content) };
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// 复核模型只有摘要可看时，会把「摘录被截断」当成「正文太短」误拦，所以给它一段正文开头。
function bodyExcerpt(raw, chars) {
  const text = String(raw.content?.text ?? String(raw.content?.html ?? '').replace(/<[^>]*>/g, ' '));
  return cleanText(text, chars);
}

// 硬规则是不可被模型推翻的单向闸门：模型只能追加拦截，不能放行硬失败。
export function hardReview(digest, filter, rules = REVIEW_RULES) {
  const knownCategories = new Set((filter.categories ?? []).map((category) => category.id));
  const knownTags = new Set((filter.tags ?? []).map((tag) => tag.id));
  const knownSubcategories = new Set((filter.subcategories ?? []).map((sub) => `${sub.parent}/${sub.id}`));
  const rows = [];
  const seenUrl = new Map();
  const seenTitle = new Map();

  for (const group of digest.categories ?? []) {
    for (const raw of group.items ?? []) {
      const slug = raw.slug ?? itemSlug(raw);
      const bodyChars = Number(raw.content?.chars ?? raw.bodyChars ?? 0);
      const summary = String(raw.zhSummary ?? raw.summary ?? '');
      const tags = raw.tags ?? [];
      const fails = [];
      const warnings = [];

      if (bodyChars < rules.minBodyChars) fails.push(`内容过少（正文 ${bodyChars} 字，要求至少 ${rules.minBodyChars} 字）`);
      if (summary.length < rules.minSummaryChars) fails.push(`内容过少（摘要 ${summary.length} 字，要求至少 ${rules.minSummaryChars} 字）`);
      // 标签是关键词匹配出来的元数据，一条实践性内容完全可能一个标签词都不命中；
      // 把它当硬规则拦掉只会白白占掉当天的配额（实测一天里 7 条因此被拦）。
      if (!tags.length) warnings.push('没有命中任何标签');
      if (tags.length > rules.maxTags) fails.push(`标签异常（${tags.length} 个，最多 ${rules.maxTags} 个）`);
      if (new Set(tags).size !== tags.length) fails.push('标签异常（存在重复标签）');
      const unknownTags = tags.filter((tag) => !knownTags.has(tag));
      if (unknownTags.length) fails.push(`标签异常（${unknownTags.join(', ')} 不在标签表里）`);

      if (!raw.category || !knownCategories.has(raw.category)) fails.push(`分类异常（${raw.category ?? '空'}）`);
      if (raw.subcategory && !knownSubcategories.has(`${raw.category}/${raw.subcategory}`)) fails.push(`子类异常（${raw.category}/${raw.subcategory}）`);

      const expectedTags = filter.tagsFor(raw);
      if (tags.length && expectedTags.length && !expectedTags.some((tag) => tags.includes(tag))) {
        warnings.push(`标签与正文重算结果不符（期望 ${expectedTags.join(', ') || '无'}）`);
      }
      if (!raw.zhTitle && raw.lang !== 'zh') warnings.push('标题未翻译');
      if (raw.zhSummary && !raw.content) warnings.push('没有正文，只有摘要');

      if (!raw.url || !domainOf(raw.url)) fails.push('原文链接无效');
      const titleKey = String(raw.zhTitle ?? raw.title ?? '').trim().toLowerCase();
      if (seenUrl.has(raw.url)) fails.push(`与条目 ${seenUrl.get(raw.url)} 重复（同一链接）`);
      else seenUrl.set(raw.url, slug);
      if (titleKey && seenTitle.has(titleKey)) fails.push(`与条目 ${seenTitle.get(titleKey)} 重复（同一标题）`);
      else seenTitle.set(titleKey, slug);

      const verdict = filter.quality(raw);
      if (!verdict.ok) fails.push(`实践性闸门不通过（${verdict.reasons.slice(0, 2).join('、') || '未达质量线'}）`);

      rows.push({
        slug,
        title: cleanText(raw.zhTitle ?? raw.title ?? '', 200),
        category: raw.category ?? null,
        subcategory: raw.subcategory ?? null,
        tags,
        bodyChars,
        excerpt: bodyExcerpt(raw, rules.agentExcerptChars ?? REVIEW_RULES.agentExcerptChars),
        quality: Number(raw.quality ?? verdict.score ?? 0),
        practical: Number(raw.practical ?? 0),
        sourceName: raw.sourceName ?? '',
        domain: domainOf(raw.url),
        hard: fails,
        warnings,
      });
    }
  }

  const digestIssues = [];
  if (rows.length < rules.minItems) digestIssues.push(`本期只有 ${rows.length} 条，少于 ${rules.minItems} 条下限`);
  return { rows, digestIssues };
}

export async function mergeHidden(filePath, blocked, day, daySlugs = []) {
  const current = JSON.parse(await readFile(filePath, 'utf8').catch(() => '{}'));
  // 按天存审查下架：重跑同一天会覆盖当天旧结论，避免模型偶发误判永久累积；其他天保持不变。
  // 旧格式只有扁平 machine 列表、没有按天记录：先挂到 legacy 键下，否则重跑某一天会把旧下架结论整批冲掉。
  const storedByDay = current.machineByDay ?? (current.machine?.length ? { legacy: current.machine } : {});
  const byDay = { ...storedByDay };
  // 本次审查重新判定的是这一天的全部条目：先把它们从别的桶里摘掉（尤其是没有日期归属的 legacy），
  // 否则旧规则拦下的条目会永久留在下架桶里，规则改了也救不回来。
  const reviewed = new Set(daySlugs);
  if (reviewed.size) {
    for (const [key, slugs] of Object.entries(byDay)) {
      if (key === day) continue;
      const kept = slugs.filter((slug) => !reviewed.has(slug));
      if (kept.length === slugs.length) continue;
      if (kept.length) byDay[key] = kept;
      else delete byDay[key];
    }
  }
  byDay[day] = blocked;
  const machine = [...new Set(Object.values(byDay).flat())];
  const admin = [...new Set(current.admin ?? [])];
  const slugs = [...new Set([...admin, ...machine])];
  const stillHidden = new Set(slugs);
  const recovered = [...new Set(Object.values(storedByDay).flat())].filter((slug) => !stillHidden.has(slug)).length;
  // 结论没变时不重写文件，避免每天只因为时间戳产生一次无意义提交。
  const wrote = JSON.stringify(byDay) !== JSON.stringify(storedByDay);
  if (wrote) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify({ updatedAt: new Date().toISOString(), slugs, admin, machine, machineByDay: byDay }, null, 2)}\n`);
  }
  return { slugs, recovered, wrote };
}

async function latestDay(digestDir) {
  const names = (await readdir(digestDir).catch(() => [])).filter((file) => file.endsWith('.json')).sort();
  return names.at(-1)?.replace(/\.json$/, '') ?? null;
}

export async function runReview({ day, apply = false, allowNoAgent = false, dataDir = path.join(ROOT, 'data'), timeoutMs = 150_000, log = console.log } = {}) {
  const filters = JSON.parse(await readFile(path.join(ROOT, 'config', 'filters.json'), 'utf8'));
  const rules = { ...REVIEW_RULES, ...(filters.quality?.review ?? {}) };
  const filter = createFilter(filters);
  const targetDay = day ?? await latestDay(path.join(dataDir, 'digests'));
  if (!targetDay) return { passed: false, reasons: ['找不到日报数据'], blocked: [], survivors: 0 };

  const digest = JSON.parse(await readFile(path.join(dataDir, 'digests', `${targetDay}.json`), 'utf8'));
  const { rows, digestIssues } = hardReview(digest, filter, rules);

  const config = reviewConfig();
  let agentNote = '';
  const agentVerdicts = new Map();
  const agentProblems = [];
  const usedModels = new Set();
  if (config.enabled) {
    const pool = rows.filter((row) => !row.hard.length).slice(0, rules.agentMaxItems);
    const batchSize = rules.agentBatch ?? REVIEW_RULES.agentBatch;
    for (let start = 0; start < pool.length; start += batchSize) {
      const chunk = pool.slice(start, start + batchSize);
      const last = start + chunk.length;
      let verdicts = new Map();
      for (let attempt = 1; attempt <= 2 && verdicts.size === 0; attempt += 1) {
        const model = attempt === 1 ? config.model : (config.fallbackModel || config.model);
        try {
          verdicts = (await askAgent(chunk, config, timeoutMs, model, rules)).verdicts;
          if (verdicts.size) usedModels.add(model);
        } catch (error) {
          agentProblems.push(`${start + 1}-${last} 第 ${attempt} 次（${model}）调用失败：${error.message}`);
        }
      }
      chunk.forEach((row, index) => {
        const verdict = verdicts.get(index + 1);
        if (verdict) agentVerdicts.set(row.slug, verdict);
      });
      if (!verdicts.size) agentProblems.push(`${start + 1}-${last} 输出无法解析`);
    }
    const models = usedModels.size ? [...usedModels].join(' → ') : config.model;
    agentNote = `${config.provider}/${models}：复核 ${pool.length} 条，解析到 ${agentVerdicts.size} 条判定`;
    for (const problem of agentProblems) agentNote += ` · ${problem}`;
  } else {
    agentNote = allowNoAgent ? '未配置审查模型凭据，已按 --allow-no-agent 跳过模型复核' : '未配置审查模型凭据（CLOUDFLARE_API_TOKEN 或 REVIEW_API_KEY）';
  }

  const reasons = [...digestIssues];
  if (!config.enabled && !allowNoAgent) reasons.push('独立审查没有跑：缺少审查模型凭据');
  if (config.enabled && agentVerdicts.size === 0) reasons.push('审查模型没有给出可用判定');

  for (const row of rows) {
    const agent = agentVerdicts.get(row.slug);
    row.agent = agent ?? null;
    row.blocked = [...row.hard];
    if (agent?.verdict === 'fail') row.blocked = [...row.blocked, `模型复核不通过（${agent.reason || '未给理由'}）`];
  }

  const blockedRows = rows.filter((row) => row.blocked.length);
  const survivors = rows.length - blockedRows.length;
  const blocked = blockedRows.map((row) => row.slug);
  if (blockedRows.length) log(`拦下 ${blockedRows.length} 条：`);
  for (const row of blockedRows) log(`  - ${row.slug} ${row.title}：${row.blocked.join('；')}`);
  for (const row of rows.filter((entry) => entry.warnings.length)) log(`  ! ${row.slug} ${row.title}：${row.warnings.join('；')}`);
  if (survivors < rules.minItems) reasons.push(`放行 ${survivors} 条，少于 ${rules.minItems} 条下限`);

  const passed = reasons.length === 0;
  const report = {
    day: targetDay,
    reviewedAt: new Date().toISOString(),
    reviewer: config.enabled ? `${config.provider}/${config.model}` : '仅硬规则',
    note: agentNote,
    rules,
    passed,
    reasons,
    total: rows.length,
    blocked,
    survivors,
    items: rows,
  };
  const reportPath = path.join(dataDir, 'reviews', `${targetDay}.json`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (apply) {
    const { slugs, recovered, wrote } = await mergeHidden(path.join(dataDir, 'hidden.json'), blocked, targetDay, rows.map((row) => row.slug));
    if (wrote) {
      log(`已更新 data/hidden.json：拦下 ${blocked.length} 条${recovered ? `，救回 ${recovered} 条` : ''}（合计下架 ${slugs.length} 条）`);
    }
  }
  log(`review ${targetDay}: ${passed ? '通过' : '不通过'}（放行 ${survivors}/${rows.length} 条）· ${agentNote}`);
  for (const reason of reasons) log(`  × ${reason}`);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const dayArg = args.find((arg) => arg.startsWith('--day='))?.split('=')[1];
  const dataDir = args.find((arg) => arg.startsWith('--data='))?.split('=')[1];
  const report = await runReview({
    day: dayArg,
    apply: args.includes('--apply'),
    allowNoAgent: args.includes('--allow-no-agent'),
    ...(dataDir ? { dataDir: path.resolve(dataDir) } : {}),
  });
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'review.mjs')) await main();
