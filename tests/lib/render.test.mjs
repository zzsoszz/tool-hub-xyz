import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, renderAboutPage, renderArchive, renderBenchDatasetPage, renderBenchIndexPage, renderDiscussPage, renderDigestPage, renderItemPage, renderLlms, renderRss, renderSearchPage, renderSectionPage } from '../../src/lib/render.mjs';
import { itemSlug } from '../../src/lib/items.mjs';

const sections = [
  { id: 'latest', label: '最新', href: '/' },
  { id: 'apps', label: 'AI 应用', categories: ['apps'] },
  { id: 'discuss', label: '讨论区', href: '/discuss' },
];

function item(overrides = {}) {
  const base = {
    id: 'https://example.com/b',
    title: 'English paper title',
    zhTitle: '论文中文标题',
    zhSummary: '中文摘要说明。',
    url: 'https://example.com/b',
    published: '2026-11-08T22:00:00.000Z',
    summary: 'Original English summary.',
    sourceName: 'arXiv',
    sourceId: 'arxiv-cs',
    category: 'apps',
    tier: 2,
    score: 9,
    practical: 4,
    metrics: { points: 12 },
  };
  const merged = { ...base, ...overrides };
  return { ...merged, slug: itemSlug(merged) };
}

function digest(overrides = {}) {
  return {
    day: '2026-11-09',
    generatedAt: '2026-11-09T02:00:00.000Z',
    timezone: 'Asia/Shanghai',
    counts: { sources: 3, okSources: 3, fetched: 12, duplicates: 2, published: 2 },
    sources: [
      { id: 'openai-news', name: 'OpenAI News', ok: true, items: 1, error: null },
      { id: 'qbitai', name: '量子位', ok: false, items: 0, error: 'timeout after 15000ms' },
    ],
    categories: [
      {
        id: 'apps',
        label: 'AI 应用',
        items: [
          item({ title: '<script>alert(1)</script> 危险标题', zhTitle: null, zhSummary: null, url: 'https://example.com/a?x=1', id: 'https://example.com/a?x=1', published: '2026-11-09T01:00:00.000Z', score: 20 }),
          item(),
        ],
      },
    ],
    ...overrides,
  };
}

const options = { days: ['2026-11-09', '2026-11-08'], siteUrl: 'https://tool-hub.xyz', sections };

test('escapesHtmlInTitlesToPreventInjection', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('rendersMenuWithEverySection', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('<a class="active" href="/">最新</a>'));
  assert.ok(html.includes('<a href="/s/apps">AI 应用</a>'));
  assert.ok(html.includes('<a href="/discuss">讨论区</a>'));
  assert.ok(html.includes('<script src="/forum.js" defer></script>'));
});

test('listsStoriesFlatWithRankChineseTitleAndOriginalLink', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('<span class="rank">1</span>'));
  assert.ok(html.includes('<a href="/item/'));
  assert.ok(html.includes('<p class="story-original">English paper title</p>'));
  assert.ok(html.includes('<a class="original-link" href="https://example.com/b" target="_blank" rel="noopener noreferrer">原文</a>'));
  assert.ok(html.includes('留下 2 条'));
});

test('opensTheHomepageWithTheFunnelNumbers', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('<section class="gate">'));
  assert.ok(html.includes('data-count-to="12"'));
  assert.ok(html.includes('data-count-to="2"'));
  assert.ok(html.includes('本期为早班'));
  assert.ok(html.includes('<script src="/funnel.js" defer></script>'));
});

test('drawsQualityMetersAgainstTheGateInsteadOfHotBadges', () => {
  const deep = item({ quality: 9, practical: 4 });
  const shallow = item({ id: 'https://example.com/c', url: 'https://example.com/c', quality: 5, practical: 1 });
  const html = renderDigestPage(digest({ categories: [{ id: 'apps', label: 'AI 应用', items: [deep, shallow] }] }), options);
  assert.ok(html.includes('<span class="meter depth" title="内容质量 9 / 14，闸门 6">'));
  assert.ok(html.includes('--gate-at:6'));
  assert.ok(html.includes('<span class="meter practical" title="实用度 4 / 6">'));
  assert.ok(!html.includes('内容质量 5 / 14'));
  assert.ok(!html.includes('chip hot'));
});

test('labelsStoryTagsWithChineseNames', () => {
  const entry = item({ tags: ['lowspec', 'benchmark'] });
  const html = renderDigestPage(digest({ categories: [{ id: 'apps', label: 'AI 应用', items: [entry] }] }), {
    ...options,
    tagLabels: { lowspec: '低配硬件', benchmark: '实测跑分' },
  });
  assert.ok(html.includes('<a class="chip tag" href="/t/lowspec">低配硬件</a>'));
});

test('reportsFailedSourcesWithoutBreakingThePage', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('1 个源本次抓取失败'));
});

test('rendersItemPageWithCommentFormAndRawSummary', () => {
  const entry = item();
  const html = renderItemPage({ ...options, item: entry, related: [] });
  assert.ok(html.includes(`<section class="comments" id="comments" data-item="${entry.slug}">`));
  assert.ok(html.includes('<textarea name="body"'));
  assert.ok(html.includes('Original English summary.'));
  assert.ok(html.includes('https://example.com/b'));
});

test('rendersSectionDiscussAndSearchPages', () => {
  const section = renderSectionPage({ ...options, section: sections[1], items: [item()], lookbackDays: 7 });
  assert.ok(section.includes('<a class="active" href="/s/apps">AI 应用</a>'));
  assert.ok(section.includes('最近 7 天，共 1 条'));
  const discuss = renderDiscussPage(options);
  assert.ok(discuss.includes('data-recent'));
  const search = renderSearchPage(options);
  assert.ok(search.includes('data-search-form'));
});

test('listControlsOfferMonthYearSelectorsAndQualityFirstSort', () => {
  const months = [
    { key: '2026-11', year: '2026', month: '11', count: 5 },
    { key: '2025-12', year: '2025', month: '12', count: 2 },
  ];
  const section = renderSectionPage({ ...options, section: sections[1], items: [item()], lookbackDays: 90, months });
  assert.ok(section.includes('<form class="filters" method="get">'));
  assert.ok(section.includes('<optgroup label="2026 年">'));
  assert.ok(section.includes('<option value="2025-12">12 月（2）</option>'));
  assert.ok(section.includes('<option value="2025" >2025 年</option>') || section.includes('<option value="2025">2025 年</option>'));
  assert.ok(section.includes('<option value="quality" selected>质量评分</option>'));
  assert.ok(section.includes('data-filter-count'));
  assert.ok(section.includes('<script type="module" src="/list.js"'));
});

test('storyRowsCarryMonthAndQualityForClientFiltering', () => {
  const entry = item({ quality: 11, score: 7 });
  const html = renderDigestPage(digest({ categories: [{ id: 'apps', label: 'AI 应用', items: [entry] }] }), options);
  assert.ok(html.includes(`data-month="2026-11"`));
  assert.ok(html.includes('data-quality="11"'));
  assert.ok(html.includes('data-score="7"'));
});

test('rendersAboutAndArchive', () => {
  const about = renderAboutPage({ ...options, sources: digest().sources });
  assert.ok(about.includes('OpenAI News'));
  assert.ok(about.includes('量子位（最近一次抓取失败）'));
  const archive = renderArchive({ ...options, digests: [digest(), digest({ day: '2026-11-08' })] });
  assert.ok(archive.includes('<a href="/day/2026-11-08">2026-11-08</a>'));
});

test('archivePageOffersPeriodFiltersAndMarkdownDownloads', () => {
  const months = [
    { key: '2026-11', year: '2026', month: '11', count: 3 },
    { key: '2025-12', year: '2025', month: '12', count: 1 },
  ];
  const archive = renderArchive({
    ...options,
    digests: [digest(), digest({ day: '2025-12-30' })],
    months,
    current: { label: '全部归档条目', items: [item()] },
  });
  assert.ok(archive.includes('<option value="2025-12">12 月（1）</option>'));
  assert.ok(archive.includes('<option value="quality" selected>质量评分</option>'));
  assert.ok(archive.includes('href="/markdown/2025-12-30.md"'));
});

test('dayPageLinksToThatDaysMarkdown', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('href="/markdown/2026-11-09.md"'));
});

test('rendersRssWithItemLinksAndOriginalUrl', () => {
  const feed = renderRss(digest(), { siteUrl: 'https://tool-hub.xyz' });
  assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(feed.includes('<guid isPermaLink="true">https://example.com/a?x=1</guid>'));
  assert.ok(feed.includes('<pubDate>Mon, 09 Nov 2026 01:00:00 GMT</pubDate>'));
  assert.ok(feed.includes('原文链接：https://example.com/b'));
});

test('rendersLlmsWithOriginalLinks', () => {
  const text = renderLlms(digest(), { siteUrl: 'https://tool-hub.xyz' });
  assert.ok(text.includes('原文：https://example.com/b'));
  assert.ok(text.includes('/data/items.json'));
});

test('escapesHtmlHelperCoversQuotesAndAmpersands', () => {
  assert.equal(escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
});

test('homepageKeepsOnlyTheTopStoriesAndLinksToTheFullDay', () => {
  const html = renderDigestPage(digest(), { ...options, limit: 1 });
  assert.ok(html.includes('<span class="rank">1</span>'));
  assert.ok(!html.includes('<span class="rank">2</span>'));
  assert.ok(html.includes('<p class="lede-more">'));
  assert.ok(html.includes('<a href="/day/2026-11-09">查看全部 2 条</a>'));
  assert.equal(renderDigestPage(digest(), options).includes('lede-more'), false);
});

test('rendersStoryThumbnailFromArticleImages', () => {
  const entry = item({ content: { html: '<p><img src="https://lcz.me/uploads/bench.png" alt="跑分截图"></p><p>正文</p>', text: '正文', chars: 200, shown: 200, lead: '正文', truncated: false } });
  const html = renderDigestPage(digest({ categories: [{ id: 'apps', label: 'AI 应用', items: [entry] }] }), { ...options, limit: 10 });
  assert.ok(html.includes('<img class="story-thumb" src="https://lcz.me/uploads/bench.png" alt="" loading="lazy">'));
  const plain = item({ content: { html: '<p><img src="https://lcz.me/avatar/9.png" alt="头像">正文足够长的一段说明文字</p>', text: '正文足够长的一段说明文字', chars: 200, shown: 200, lead: '正文', truncated: false } });
  assert.ok(!renderDigestPage(digest({ categories: [{ id: 'apps', label: 'AI 应用', items: [plain] }] }), options).includes('story-thumb'));
});

test('wrapsItemPageTablesForHorizontalScrolling', () => {
  const entry = item({
    content: {
      html: '<p>结论：双卡比单卡快 18.8%。</p><table><tr><th>配置</th><th>耗时</th></tr><tr><td>TP2+P2P</td><td>134 s</td></tr></table>',
      text: '结论：双卡比单卡快 18.8%。配置 耗时 TP2+P2P 134 s',
      chars: 400,
      shown: 400,
      lead: '结论：双卡比单卡快 18.8%。',
      truncated: false,
    },
  });
  const html = renderItemPage({ ...options, item: entry, related: [] });
  assert.ok(html.includes('<div class="table-scroll"><table>'));
  assert.ok(html.includes('</table></div>'));
  assert.ok(html.includes('class="article"'));
});

const benchCommit = '504b143342a9fe1aa8320a7b31e11f5c0ac265c3';
const benchSections = [{ id: 'bench', label: '评测选型', href: '/bench', navLabel: '评测数据', categories: ['bench'] }];
const benchOptions = { ...options, sections: benchSections };

const benchConfig = {
  index: {
    label: '评测数据',
    lede: '把开源项目公开的实测搬进站内。',
    meta: '每天跟日报一起采集两次。',
    method: { title: '本页数据是怎么来的', steps: ['采集上游 Markdown'] },
    caveats: ['不同机器与不同提示词'],
    otherSources: [{ name: 'MLCommons MLPerf Inference', url: 'https://mlcommons.org/benchmarks/inference-datacenter/', measures: '推理吞吐', verify: '官方公布提交代码' }],
  },
  datasets: [
    {
      id: 'strata-community',
      kind: 'strata-community',
      label: 'Strata 社区硬件实测',
      summary: '同一款模型在不同显卡上的速度。',
      upstream: { label: 'Niko1221/Strata · bench/results/COMMUNITY.md', url: 'https://github.com/Niko1221/Strata/tree/main/bench/results' },
      reading: ['读取速度决定长上下文的等待时间'],
      tables: {
        output: { label: '生成速度（tok/s）', note: '照抄原报告中位数' },
        prompt: { label: '读取速度（tok/s）', note: '三段按 4K / 32K / 128K' },
        others: { label: '其余社区报告', note: '脚本不猜数字' },
      },
      chart: { table: 'output', labelFields: ['hardware', 'model'], valueIndex: 1, top: 3, title: '生成速度排行', unit: 'tok/s', note: '机器不同' },
      conclusions: [{ text: '量化越小生成越快。', sources: [{ label: '#1725', folder: '2026-10-09-community-rtx-3060-0141' }] }],
      method: {
        title: '自己复现一遍',
        steps: ['跑标准协议'],
        commands: ['strata bench run --profile NAME'],
        citations: [{ label: '标准基准协议全文', path: 'docs/BENCHMARK_PROTOCOL.md' }],
      },
      caveats: ['单次采样会浮动几个百分点'],
    },
  ],
};

const benchData = {
  id: 'strata-community',
  kind: 'strata-community',
  collectedAt: '2026-11-10T00:10:00.000Z',
  commit: benchCommit,
  tables: {
    output: {
      rows: [
        { folder: '2026-10-09-community-rtx-3060-0141', hardware: 'RTX 3060 12 GB', model: 'Q2_0', engine: '0.1.41', pr: '#1725', prUrl: 'https://github.com/Niko1221/Strata/pull/1725', values: [41.8, 41.8, 33.5], raw: '41.8 / 41.8 / 33.5', readmeUrl: `https://github.com/Niko1221/Strata/blob/${benchCommit}/bench/results/2026-10-09-community-rtx-3060-0141/README.md` },
        { folder: '2026-10-01-ctx-ladder', hardware: 'RTX 4070 Ti SUPER 16 GB', model: 'IQ2_XS', engine: '0.1.31', pr: '#995', prUrl: null, values: [97, 84, 74], raw: '97 / 84 / 74', readmeUrl: `https://github.com/Niko1221/Strata/blob/${benchCommit}/bench/results/2026-10-01-ctx-ladder/README.md` },
      ],
    },
    prompt: {
      rows: [
        { folder: '2026-10-01-community-2x-rtx-pro-4500', hardware: '2x RTX PRO 4500 32 GB', model: 'Swift IQ3_XXS', engine: '0.1.30', pr: '#418', prUrl: 'https://github.com/Niko1221/Strata/pull/418', values: [1428, 2454, 2785], raw: '1,428 / 2,454 / 2,785', readmeUrl: `https://github.com/Niko1221/Strata/blob/${benchCommit}/bench/results/2026-10-01-community-2x-rtx-pro-4500/README.md` },
      ],
    },
    others: {
      rows: [
        { folder: '2026-10-01-community-rtx-pro-4500', hardware: 'RTX PRO 4500 32 GB', model: 'UD-Q4_K_XL / IQ3_S', engine: '0.1.31', pr: '#417', prUrl: null, note: '数字见原报告 ｜ UD-IQ4_XS 82.0 / 95.8 / 91.4', readmeUrl: `https://github.com/Niko1221/Strata/blob/${benchCommit}/bench/results/2026-10-01-community-rtx-pro-4500/README.md` },
      ],
    },
  },
  stats: { outputRows: 2, promptRows: 1, otherRows: 1, medianOutput: 84, medianPrompt: 2454, fastestOutput: 120, slowestOutput: 41.8, fastestPrompt: 2454 },
  files: [{ path: 'bench/results/COMMUNITY.md', url: `https://github.com/Niko1221/Strata/blob/${benchCommit}/bench/results/COMMUNITY.md`, sha256: 'e75eff8b9feea04f745520b392c4c17d97aefc1ba185e222aa6740efa8f68407', bytes: 68579 }],
};

test('rendersBenchIndexPageWithCardsAndOtherSources', () => {
  const html = renderBenchIndexPage({ ...benchOptions, benchConfig, benchData: [{ dataset: benchConfig.datasets[0], data: benchData }] });
  assert.ok(html.includes('<a href="/bench/strata-community">Strata 社区硬件实测</a>'));
  assert.ok(html.includes('生成速度表 2 行 · 读取速度表 1 行 · 其余报告 1 份'));
  assert.ok(html.includes('<a href="https://mlcommons.org/benchmarks/inference-datacenter/"'));
  assert.ok(html.includes('<a href="/s/bench">评测选型</a>'));
  assert.ok(html.includes('不同机器与不同提示词'));
  assert.ok(html.includes('<nav class="menu"><a class="active" href="/bench">评测数据</a></nav>'));
  assert.ok(html.includes('src="/lightbox.js" defer'));
  assert.ok(html.includes('<form class="bench-search" data-bench-search>'));
  assert.ok(html.includes('<div class="table-scroll" data-bench-table>'));
  assert.ok(html.includes('src="/bench.js" defer'));
});

test('rendersBenchDatasetPageWithNumbersSourcesAndChart', () => {
  const html = renderBenchDatasetPage({ ...benchOptions, benchConfig, dataset: benchConfig.datasets[0], data: benchData });
  assert.ok(html.includes('<th class="num">32K 输入</th>'));
  assert.ok(html.includes('<div data-bench-table>'));
  assert.ok(html.includes('<h3>生成速度（tok/s）（2 行）</h3>'));
  assert.ok(html.includes('<form class="bench-search" data-bench-search>'));
  assert.ok(html.includes('<p class="bench-search-status" data-bench-status role="status" aria-live="polite"></p>'));
  assert.ok(html.includes('placeholder="搜显卡、量化档位、引擎版本或数字，例如 5090 IQ2_XS 0.1.40"'));
  assert.ok(html.includes('<td class="num">2,454</td>'));
  assert.ok(html.includes(`href="https://github.com/Niko1221/Strata/blob/${benchCommit}/bench/results/2026-10-09-community-rtx-3060-0141/README.md"`));
  assert.ok(html.includes('href="https://github.com/Niko1221/Strata/pull/1725"'));
  assert.ok(html.includes('UD-IQ4_XS 82.0 / 95.8 / 91.4'));
  assert.ok(html.includes('<img data-zoom src="/bench/strata-community-chart.svg"'));
  assert.ok(html.includes('<pre><code>strata bench run --profile NAME</code></pre>'));
  assert.ok(html.includes(`https://github.com/Niko1221/Strata/blob/${benchCommit}/docs/BENCHMARK_PROTOCOL.md`));
  assert.ok(html.includes('e75eff8b9feea04f745520b392c4c17d97aefc1ba185e222aa6740efa8f68407'));
  assert.ok(html.includes('<a href="/bench/strata-community.json">/bench/strata-community.json</a>'));
});

test('attachesEveryBenchConclusionToItsOwnSource', () => {
  const html = renderBenchDatasetPage({ ...benchOptions, benchConfig, dataset: benchConfig.datasets[0], data: benchData });
  assert.ok(html.includes('<ol class="bench-findings">'));
  assert.ok(html.includes('<p class="bench-sources">来源：<a href="https://github.com/Niko1221/Strata/blob/504b143342a9fe1aa8320a7b31e11f5c0ac265c3/bench/results/2026-10-09-community-rtx-3060-0141/README.md"'));
});

test('skipsBenchTablesThatHaveNoRows', () => {
  const empty = { ...benchData, tables: { output: { rows: [] }, prompt: { rows: [] }, others: { rows: [] } } };
  const html = renderBenchDatasetPage({ ...benchOptions, benchConfig, dataset: benchConfig.datasets[0], data: empty });
  assert.ok(!html.includes('32K 输入'));
  assert.ok(!html.includes('bench-figure'));
});

test('hidesTheBenchSearchBoxWhenThereIsNoTableToFilter', () => {
  const empty = { ...benchData, tables: { output: { rows: [] }, prompt: { rows: [] }, others: { rows: [] } } };
  const html = renderBenchDatasetPage({ ...benchOptions, benchConfig, dataset: benchConfig.datasets[0], data: empty });
  assert.ok(!html.includes('data-bench-search'));
});
