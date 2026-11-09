import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, renderAboutPage, renderArchive, renderDiscussPage, renderDigestPage, renderItemPage, renderLlms, renderRss, renderSearchPage, renderSectionPage } from '../../src/lib/render.mjs';
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

test('rendersAboutAndArchive', () => {
  const about = renderAboutPage({ ...options, sources: digest().sources });
  assert.ok(about.includes('OpenAI News'));
  assert.ok(about.includes('量子位（最近一次抓取失败）'));
  const archive = renderArchive({ ...options, digests: [digest(), digest({ day: '2026-11-08' })] });
  assert.ok(archive.includes('<a href="/day/2026-11-08">2026-11-08</a>'));
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
