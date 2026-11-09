import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, renderArchive, renderDigestPage, renderLlms, renderRss } from '../../src/lib/render.mjs';

function digest(overrides = {}) {
  return {
    day: '2026-11-09',
    generatedAt: '2026-11-09T02:00:00.000Z',
    timezone: 'Asia/Shanghai',
    counts: { sources: 3, okSources: 3, fetched: 12, duplicates: 2, relevant: 10, published: 2 },
    sources: [
      { id: 'openai-news', name: 'OpenAI News', ok: true, items: 1, error: null },
      { id: 'qbitai', name: '量子位', ok: false, items: 0, error: 'timeout after 15000ms' },
    ],
    categories: [
      {
        id: 'models',
        label: '模型与发布',
        items: [
          {
            title: '<script>alert(1)</script> 危险标题',
            url: 'https://example.com/a?x=1',
            published: '2026-11-09T01:00:00.000Z',
            summary: '摘要 <b>文本</b>',
            sourceName: 'OpenAI News',
            sourceId: 'openai-news',
            tier: 1,
            score: 20,
            categories: ['llm'],
            metrics: { points: 320 },
          },
        ],
      },
      {
        id: 'research',
        label: '论文与研究',
        items: [
          {
            title: 'English paper title',
            zhTitle: '论文中文标题',
            zhSummary: '中文摘要说明。',
            url: 'https://example.com/b',
            published: '2026-11-08T22:00:00.000Z',
            summary: 'Original English summary.',
            sourceName: 'arXiv',
            sourceId: 'arxiv-cs',
            tier: 2,
            score: 9,
            categories: [],
            metrics: {},
          },
        ],
      },
    ],
    ...overrides,
  };
}

test('escapesHtmlInTitlesToPreventInjection', () => {
  const html = renderDigestPage(digest(), { days: ['2026-11-09'], siteUrl: 'https://tool-hub.xyz' });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('groupsCardsByCategoryWithCounts', () => {
  const html = renderDigestPage(digest(), { days: ['2026-11-09'], siteUrl: 'https://tool-hub.xyz' });
  assert.ok(html.includes('模型与发布<span class="count">1'));
  assert.ok(html.includes('论文与研究<span class="count">1'));
  assert.ok(html.includes('共 2 条'));
});

test('showsChineseTitleFirstAndKeepsOriginal', () => {
  const html = renderDigestPage(digest(), { days: ['2026-11-09'], siteUrl: 'https://tool-hub.xyz' });
  assert.ok(html.includes('<a href="https://example.com/b" target="_blank" rel="noopener noreferrer">论文中文标题</a>'));
  assert.ok(html.includes('<p class="original">English paper title</p>'));
  assert.ok(html.includes('中文摘要说明。'));
});

test('reportsFailedSourcesWithoutBreakingThePage', () => {
  const html = renderDigestPage(digest(), { days: ['2026-11-09'], siteUrl: 'https://tool-hub.xyz' });
  assert.ok(html.includes('1 个源本次抓取失败'));
  assert.ok(html.includes('量子位（timeout after 15000ms）'));
});

test('rendersRssWithItemLinksAndGuid', () => {
  const feed = renderRss(digest(), { siteUrl: 'https://tool-hub.xyz' });
  assert.ok(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(feed.includes('<guid isPermaLink="true">https://example.com/a?x=1</guid>'));
  assert.ok(feed.includes('<pubDate>Mon, 09 Nov 2026 01:00:00 GMT</pubDate>'));
});

test('rendersLlmsAsPlainMarkdownLinks', () => {
  const text = renderLlms(digest(), { siteUrl: 'https://tool-hub.xyz' });
  assert.ok(text.includes('- [论文中文标题](https://example.com/b) — arXiv'));
  assert.ok(text.includes('https://tool-hub.xyz/archive'));
});

test('rendersArchiveWithOneRowPerDay', () => {
  const html = renderArchive({ digests: [digest(), digest({ day: '2026-11-08' })], days: ['2026-11-09', '2026-11-08'], siteUrl: 'https://tool-hub.xyz' });
  assert.ok(html.includes('<a href="/day/2026-11-08">2026-11-08</a>'));
  assert.equal(html.match(/<li>/g).length, 2);
});

test('escapesHtmlHelperCoversQuotesAndAmpersands', () => {
  assert.equal(escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
});
