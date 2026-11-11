import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createFilter } from '../../src/lib/filter.mjs';
import { agentEndpoint, agentPrompt, hardReview, mergeHidden, parseVerdicts, REVIEW_RULES, reviewConfig, runReview, SYSTEM_PROMPT } from '../../src/review.mjs';

const filters = await readFile(path.resolve(import.meta.dirname, '../../config/filters.json'), 'utf8').then((text) => JSON.parse(text));
const filter = createFilter(filters);

function item(overrides = {}) {
  return {
    id: `https://example.com/${overrides.slug ?? Math.random().toString(16).slice(2)}`,
    url: `https://example.com/${overrides.slug ?? Math.random().toString(16).slice(2)}`,
    title: 'How to run a 12B model on a 16GB GPU with llama.cpp',
    zhTitle: '在 16GB 显卡上用 llama.cpp 跑 12B 模型的实测步骤',
    summary: 'A step-by-step benchmark: 12 tokens/s at Q4, 38 tokens/s at Q3, with the exact command line and flags.',
    zhSummary: '给出完整命令行与参数：Q4 量化 12 tokens/s，Q3 量化 38 tokens/s，并附实测对比数据。',
    sourceName: 'Reddit',
    sourceId: 'reddit-local-llama',
    lang: 'en',
    published: '2026-11-08T10:00:00.000Z',
    category: 'hardware',
    subcategory: 'gpu',
    tags: ['lowspec', 'benchmark'],
    metrics: { points: 420, comments: 60 },
    content: { chars: 3200, html: '<p>第一步：执行 <code>llama-server -m model.Q4</code>。</p>' },
    ...overrides,
  };
}

function digest(items) {
  const groups = new Map();
  for (const entry of items) {
    const id = entry.category ?? 'apps';
    if (!groups.has(id)) groups.set(id, { id, label: id, items: [] });
    groups.get(id).items.push(entry);
  }
  return {
    day: '2026-11-08',
    counts: { published: items.length },
    categories: [...groups.values()],
  };
}

function review(items, rules = REVIEW_RULES) {
  return hardReview(digest(items), filter, rules);
}

test('healthyPracticalItemPassesHardRules', () => {
  const { rows, digestIssues } = review([item({ slug: 'good' })]);
  assert.deepEqual(rows[0].hard, []);
  assert.equal(rows.length, 1);
  assert.equal(digestIssues.length > 0, true);
});

test('thinBodyIsBlockedAsContentTooSmall', () => {
  const { rows } = review([item({ slug: 'thin', content: { chars: 30, html: '<p>短</p>' } })]);
  assert.ok(rows[0].hard.some((reason) => reason.startsWith('内容过少')), rows[0].hard.join('；'));
});

test('itemsWithoutAnyTagWarnButStillPassHardRules', () => {
  const missing = review([item({ slug: 'notag', tags: [] })]);
  assert.deepEqual(missing.rows[0].hard, []);
  assert.ok(missing.rows[0].warnings.some((reason) => reason.includes('没有命中任何标签')));
});

test('abnormalTagsAreBlocked', () => {
  const unknown = review([item({ slug: 'badtag', tags: ['lowspec', '不存在标签'] })]);
  assert.ok(unknown.rows[0].hard.some((reason) => reason.includes('不在标签表里')));

  const duplicated = review([item({ slug: 'dup', tags: ['lowspec', 'lowspec'] })]);
  assert.ok(duplicated.rows[0].hard.some((reason) => reason.includes('重复标签')));

  const tooMany = review([item({ slug: 'many', tags: ['lowspec', 'benchmark', 'local', 'agent', 'free'] })]);
  assert.ok(tooMany.rows[0].hard.some((reason) => reason.includes('最多')));
});

test('duplicateLinksAndUnknownCategoryAreBlocked', () => {
  const first = item({ slug: 'sameurl', url: 'https://example.com/dup' });
  const second = item({ slug: 'sameurl2', url: 'https://example.com/dup' });
  const { rows } = review([first, second]);
  assert.ok(rows[1].hard.some((reason) => reason.includes('同一链接')));

  const badCategory = review([item({ slug: 'badcat', category: 'news', subcategory: null })]);
  assert.ok(badCategory.rows[0].hard.some((reason) => reason.includes('分类异常')));

  const badSub = review([item({ slug: 'badsub', subcategory: '不存在的子类' })]);
  assert.ok(badSub.rows[0].hard.some((reason) => reason.includes('子类异常')));
});

test('pureNewsWithoutDataOrStepsFailsPracticalGate', () => {
  const { rows } = review([item({
    slug: 'news',
    title: 'Company announces new model training plan',
    zhTitle: '某公司宣布新的模型训练计划',
    zhSummary: '公司表示将在明年推出新版本，强调团队规模扩大、算力投入增加，但没有给出可复现的配置、数字或操作步骤。',
    summary: 'The company said it will release a new version next year and that the team has grown.',
    metrics: {},
    content: { chars: 2400, html: '<p>公司表示明年推出新版本。</p>' },
    tags: ['agent'],
    subcategory: null,
  })]);
  assert.ok(rows[0].hard.some((reason) => reason.startsWith('实践性闸门')), rows[0].hard.join('；'));
});

test('parseVerdictsReadsLineProtocolAndIgnoresNoise', () => {
  const verdicts = parseVerdicts('1|pass|有实测数据\n2|fail|标签和内容不符\n随便一句话\n1|pass|重复行忽略');
  assert.equal(verdicts.size, 2);
  assert.equal(verdicts.get(1).verdict, 'pass');
  assert.equal(verdicts.get(2).reason, '标签和内容不符');
});

test('reviewAgentSeesABodyExcerptNotOnlyTheSummary', () => {
  const { rows } = review([item({
    slug: 'excerpt',
    content: { chars: 4200, html: '', text: '第一步：执行 llama-server -m model.Q4 --port 8080，然后记录 tokens/s。' },
  })]);
  const prompt = agentPrompt(rows, REVIEW_RULES);
  assert.ok(rows[0].excerpt.startsWith('第一步：执行 llama-server'), rows[0].excerpt);
  assert.ok(prompt.includes('正文摘录：第一步：执行 llama-server'), prompt);
});

test('reviewAgentFallsBackToHtmlWhenThereIsNoPlainTextBody', () => {
  const { rows } = review([item({ slug: 'html-only', content: { chars: 800, html: '<p>实测 tokens/s 对比表格。</p>' } })]);
  assert.equal(rows[0].excerpt, '实测 tokens/s 对比表格。');
});

test('reviewAgentIsNotToldToBlockOnLengthOrMissingTags', () => {
  assert.ok(!SYSTEM_PROMPT.includes('正文太短'), SYSTEM_PROMPT);
  assert.ok(SYSTEM_PROMPT.includes('长度、标签缺失'), SYSTEM_PROMPT);
});

test('reviewBlocksAreStoredPerDaySoReReviewingConverges', async () => {
  const dir = path.resolve(import.meta.dirname, '../../.tmp-review3');
  await rm(dir, { recursive: true, force: true });
  const file = path.join(dir, 'hidden.json');
  await mergeHidden(file, ['a1', 'a2'], '2026-11-08');
  await mergeHidden(file, ['b1'], '2026-11-09');
  await mergeHidden(file, [], '2026-11-08');
  const hidden = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(hidden.machine, ['b1']);
  assert.deepEqual(hidden.machineByDay, { '2026-11-08': [], '2026-11-09': ['b1'] });
  await rm(dir, { recursive: true, force: true });
});

test('mergeHiddenKeepsLegacyBlocksWithoutDayRecords', async () => {
  const dir = path.resolve(import.meta.dirname, '../../.tmp-review4');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'hidden.json');
  await writeFile(file, JSON.stringify({ slugs: ['old1', 'old2'], admin: ['adm1'], machine: ['old1', 'old2'] }));
  await mergeHidden(file, ['new1'], '2026-11-10');
  const hidden = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(hidden.machine, ['old1', 'old2', 'new1']);
  assert.deepEqual(hidden.machineByDay, { legacy: ['old1', 'old2'], '2026-11-10': ['new1'] });
  assert.deepEqual(hidden.admin, ['adm1']);
  await rm(dir, { recursive: true, force: true });
});

test('mergeHiddenMovesReReviewedItemsOutOfTheLegacyBucket', async () => {
  const dir = path.resolve(import.meta.dirname, '../../.tmp-review5');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'hidden.json');
  await writeFile(file, JSON.stringify({ slugs: ['old1', 'old2'], admin: ['adm1'], machine: ['old1', 'old2'] }));
  // old2 今天被重新审查并放行，old1 没有出现在本期条目里。
  const merged = await mergeHidden(file, ['new1'], '2026-11-11', ['old2', 'new1']);
  const hidden = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(hidden.machineByDay, { legacy: ['old1'], '2026-11-11': ['new1'] });
  assert.deepEqual(hidden.machine, ['old1', 'new1']);
  assert.deepEqual(hidden.slugs, ['adm1', 'old1', 'new1']);
  assert.deepEqual(merged, { slugs: ['adm1', 'old1', 'new1'], recovered: 1, wrote: true });
  await rm(dir, { recursive: true, force: true });
});

test('reviewAgentRetriesOnASmallerModelEndpoint', () => {
  const config = reviewConfig({ CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'acct' });
  assert.equal(config.model, '@cf/meta/llama-3.1-70b-instruct');
  assert.equal(config.fallbackModel, '@cf/meta/llama-3.1-8b-instruct');
  assert.equal(
    agentEndpoint(config, config.model),
    'https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/meta/llama-3.1-70b-instruct',
  );
  assert.ok(agentEndpoint(config, config.fallbackModel).endsWith('/ai/run/@cf/meta/llama-3.1-8b-instruct'));
});

test('runReviewBlocksPublishingWithoutAgentCredentials', async () => {
  const dataDir = path.resolve(import.meta.dirname, '../../.tmp-review/data');
  await rm(path.dirname(dataDir), { recursive: true, force: true });
  await mkdir(path.join(dataDir, 'digests'), { recursive: true });
  const items = Array.from({ length: 6 }, (_unused, index) => item({
    slug: `ok${index}`,
    url: `https://example.com/practical-${index}`,
    id: `https://example.com/practical-${index}`,
    title: `How to run model ${index + 1} on a 16GB GPU with llama.cpp`,
    zhTitle: `在 16GB 显卡上跑第 ${index + 1} 个模型的实测步骤`,
    zhSummary: `给出第 ${index + 1} 组的完整命令行与参数：Q4 量化 12 tokens/s，Q3 量化 38 tokens/s，并附实测对比数据。`,
  }));
  await writeFile(path.join(dataDir, 'digests', '2026-11-08.json'), JSON.stringify(digest(items)));
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousOpenAi = process.env.REVIEW_API_KEY;
  const previousTranslate = process.env.TRANSLATE_API_KEY;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.REVIEW_API_KEY;
  delete process.env.TRANSLATE_API_KEY;
  try {
    const strict = await runReview({ day: '2026-11-08', dataDir, log: () => {} });
    assert.equal(strict.passed, false);
    assert.ok(strict.reasons.some((reason) => reason.includes('独立审查没有跑')));

    const lenient = await runReview({ day: '2026-11-08', dataDir, allowNoAgent: true, log: () => {} });
    assert.equal(lenient.passed, true);
    assert.equal(lenient.survivors, 6);

    const report = JSON.parse(await readFile(path.join(dataDir, 'reviews', '2026-11-08.json'), 'utf8'));
    assert.equal(report.day, '2026-11-08');
    assert.equal(report.total, 6);
  } finally {
    if (previousToken) process.env.CLOUDFLARE_API_TOKEN = previousToken;
    if (previousAccount) process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousOpenAi) process.env.REVIEW_API_KEY = previousOpenAi;
    if (previousTranslate) process.env.TRANSLATE_API_KEY = previousTranslate;
    await rm(path.dirname(dataDir), { recursive: true, force: true });
  }
});

test('runReviewBlocksTooFewSurvivingItems', async () => {
  const dataDir = path.resolve(import.meta.dirname, '../../.tmp-review2/data');
  await rm(path.dirname(dataDir), { recursive: true, force: true });
  await mkdir(path.join(dataDir, 'digests'), { recursive: true });
  const items = [item({ slug: 't1', content: { chars: 10, html: '<p>短</p>' } }), item({ slug: 't2', content: { chars: 10, html: '<p>短</p>' } })];
  await writeFile(path.join(dataDir, 'digests', '2026-11-08.json'), JSON.stringify(digest(items)));
  try {
    const report = await runReview({ day: '2026-11-08', dataDir, allowNoAgent: true, apply: true, log: () => {} });
    assert.equal(report.passed, false);
    assert.deepEqual(report.blocked, ['t1', 't2']);
    const hidden = JSON.parse(await readFile(path.join(dataDir, 'hidden.json'), 'utf8'));
    assert.deepEqual(hidden.machine, ['t1', 't2']);
    assert.deepEqual(hidden.slugs, ['t1', 't2']);
  } finally {
    await rm(path.dirname(dataDir), { recursive: true, force: true });
  }
});
