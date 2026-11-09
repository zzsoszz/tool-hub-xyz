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
  assert.ok(html.includes('<span class="chip practical" title="实用度">实用 4</span>'));
  assert.ok(html.includes('共 2 条'));
});

test('marksHighScoringStoriesHot', () => {
  const html = renderDigestPage(digest(), options);
  assert.ok(html.includes('<span class="chip hot">HOT</span>'));
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
