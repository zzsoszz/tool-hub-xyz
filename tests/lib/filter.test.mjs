import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createFilter } from '../../src/lib/filter.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const filters = JSON.parse(await readFile(path.join(ROOT, 'config/filters.json'), 'utf8'));
const filter = createFilter(filters);

function item(overrides) {
  return {
    title: '',
    summary: '',
    url: 'https://example.com/x',
    sourceName: 'Source',
    sourceId: 'source',
    categories: [],
    tier: 2,
    trustCategory: false,
    declaredCategory: null,
    metrics: {},
    published: new Date('2026-11-09T02:00:00Z').toISOString(),
    ...overrides,
  };
}

test('treatsTrustedSourceItemsAsRelevantWithoutAiKeywords', () => {
  const trusted = item({ title: 'Introducing our new research program', sourceName: 'OpenAI News', trustCategory: true, tier: 1 });
  assert.equal(filter.isRelevant(trusted), true);
});

test('rejectsNoiseItemsWithoutAiSignals', () => {
  const noise = item({ title: 'Crypto token rallies after ETF news', summary: 'Cryptocurrency market moves after an ETF filing.' });
  assert.equal(filter.isRelevant(noise), false);
});

test('matchesAiKeywordsForUntrustedGeneralSources', () => {
  assert.equal(filter.isRelevant(item({ title: 'New LLM beats benchmark on agentic coding' })), true);
  assert.equal(filter.isRelevant(item({ title: 'Sayd airline reports quarterly earnings' })), false);
});

test('categorizesByArticleContentInsteadOfSourceLabels', () => {
  const paper = item({ title: 'New paper benchmarks reasoning models on graduate-level math', summary: 'Results across 12 benchmarks show training gains.', declaredCategory: 'news' });
  assert.equal(filter.categorize(paper), 'bench');
  const rig = item({ title: '把 4090 换成 5090 的装机记录：显存、功耗与价格', summary: '一次完整的显卡升级实测。', trustCategory: true, declaredCategory: 'ideas' });
  assert.equal(filter.categorize(rig), 'hardware');
});

test('mapsLegacyDeclaredCategoriesThroughAliases', () => {
  const vague = item({ title: 'A quiet weekly note', trustCategory: true, declaredCategory: 'ideas' });
  assert.equal(filter.categorize(vague), 'bench');
  const repo = item({ title: 'A quiet weekly note', trustCategory: true, declaredCategory: 'oss' });
  assert.equal(filter.categorize(repo), 'local');
});

test('scoresFreshTierOneAboveOlderTierThree', () => {
  const now = new Date('2026-11-09T04:00:00Z');
  const fresh = item({ title: 'OpenAI announces new model with lower inference cost', tier: 1, trustCategory: true, published: '2026-11-09T03:30:00Z' });
  const stale = item({ title: 'A small tool for parsing logs', tier: 3, published: '2026-11-05T20:00:00Z' });
  assert.ok(filter.score(fresh, now) > filter.score(stale, now));
});

test('boostsItemsWithCommunitySignals', () => {
  const now = new Date('2026-11-09T04:00:00Z');
  const base = item({ title: 'Open-source LLM runtime gains traction' });
  const popular = { ...base, metrics: { points: 500, stars: 2000 } };
  assert.ok(filter.score(popular, now) > filter.score(base, now));
});

test('routesInferenceFrameworksAndVideoGenerationIntoAppSubcategories', () => {
  const serving = item({ title: '用 SGLang 部署 70B 模型：一条命令起服务，实测 1200 tok/s', summary: '附 llama.cpp 与 Strata 的完整参数与吞吐数据。' });
  assert.equal(filter.categorize(serving), 'apps');
  assert.equal(filter.subcategoryFor(serving, 'apps'), 'inference');

  const comfyui = item({ title: 'ComfyUI 视频生成工作流：图生视频出片参数与显存占用', summary: 'ComfyUI video generation workflow，附视频生成节点与步骤。' });
  assert.equal(filter.categorize(comfyui), 'apps');
  assert.equal(filter.subcategoryFor(comfyui, 'apps'), 'video');
});

test('splitsEachSectionIntoSubcategoriesFromContent', () => {
  const creation = item({ title: '用开源工具做视频字幕：一条命令跑通', summary: '附免费替代方案与安装步骤。' });
  const office = item({ title: 'AI 会议纪要助手：自动生成待办并写回日历', summary: '适合团队免费使用。' });
  assert.equal(filter.subcategoryFor(creation, 'apps'), 'creation');
  assert.equal(filter.subcategoryFor(office, 'apps'), 'office');
  assert.equal(filter.subcategoryFor(item({ title: 'A quiet weekly note' }), 'apps'), null);
});

test('dropsItemsWithoutDataOrReproSteps', () => {
  const announcement = item({ title: 'A company announces a new program for partners', summary: 'No numbers, no instructions, nothing you can actually run today.' });
  const withSteps = item({ title: 'How to run a small model on a laptop', summary: 'Install ollama, pick a GGUF quant, and run it with these commands.' });
  assert.equal(filter.quality(announcement).ok, false);
  assert.match(filter.quality(announcement).reasons.join(' '), /实践|数据|复现|可操作/);
  assert.equal(filter.quality(withSteps).ok, true);
});

test('enforcesPerSourceMetricMinimums', () => {
  const repo = item({ title: 'new/ai-project', metrics: { stars: 40 } });
  assert.equal(filter.passesGuards(repo, { minMetrics: { stars: 100 } }), false);
  assert.equal(filter.passesGuards({ ...repo, metrics: { stars: 420 } }, { minMetrics: { stars: 100 } }), true);
  assert.equal(filter.passesGuards(repo, {}), true);
});

test('rejectsThinPostsAndRewardsMeasuredPracticalWriteups', () => {
  const thin = item({ title: '求推荐一个免费 AI 绘图网站', summary: '有没有兄弟知道？谢谢' });
  const measured = item({
    title: '【实测分享】单张 RTX 5080 跑 Qwen3.8-Flash IQ3_S，输出 105～132 tok/s',
    summary: '单卡 RTX 5080 16GB + DDR5 128GB，默认设置实测：标准测速中位数 105.6～132.1 tok/s，prefill 3,400～4,400 tok/s，12 万 token 长文 28 秒读完，长上下文 3/3 找对。',
    metrics: { points: 5, comments: 7, views: 420 },
  });
  const thinResult = filter.quality(thin, { id: 'lcz-llm' });
  const measuredResult = filter.quality(measured, { id: 'lcz-llm' });
  assert.equal(thinResult.ok, false);
  assert.equal(measuredResult.ok, true);
  assert.ok(measuredResult.evidence >= 1);
  assert.ok(measuredResult.action >= 1);
  assert.ok(measuredResult.score > thinResult.score);
});

test('givesModeratorSelectedForumTopicsAQualityBonus', () => {
  const base = item({ title: '双卡 7900XTX 对比 5090 视频生成实测', summary: '同一提示词、同一分辨率下的出片速度与显存占用对比数据。' });
  const featured = { ...base, excellent: true };
  assert.ok(filter.quality(featured, { id: 'lcz-media' }).score > filter.quality(base, { id: 'lcz-media' }).score);
});

test('tagsItemsByPracticalKeywords', () => {
  const tags = filter.tagsFor(item({
    title: '低配旧显卡本地部署教程：ollama 跑量化模型',
    summary: '显存 8G 的旧卡也能跑，步骤与配置贴在正文里。',
  }));
  assert.ok(tags.includes('local'));
  assert.ok(tags.includes('lowspec'));
  assert.ok(tags.includes('tutorial'));
  assert.ok(tags.length <= 4);
  assert.deepEqual(filter.tagsFor(item({ title: 'A quiet weekly note', summary: 'notes only' })), []);
});

test('prefersIllustratedWriteupsWithScreenshotsAndCharts', () => {
  const base = item({ title: '本地跑 125B MoE 的完整部署记录', summary: '从零编译到实测 54-58 t/s 的全过程，含每一步命令与踩坑。' });
  const illustrated = { ...base, content: { html: '<p>先看结论。</p><p><img src="https://lcz.me/uploads/1.png" alt="显存占用截图"></p>', text: '先看结论。', chars: 400, shown: 400, lead: '先看结论。', truncated: false } };
  assert.ok(filter.quality(illustrated, { id: 'lcz-llm' }).score > filter.quality(base, { id: 'lcz-llm' }).score);
});
