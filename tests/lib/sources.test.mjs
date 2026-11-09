import assert from 'node:assert/strict';
import test from 'node:test';
import { headersFor } from '../../src/lib/http.mjs';
import { enrichForumTopics, fetchAllSources, parseSourceBody, resolveSourceUrl } from '../../src/lib/sources.mjs';

test('injectsTheSinceDateIntoGithubSearchUrls', () => {
  const url = resolveSourceUrl(
    { id: 'github-trending', url: 'https://api.github.com/search/repositories?q=AI+created:%3E{SINCE}' },
    { now: new Date('2026-11-09T04:00:00Z'), sinceDays: 7, timezone: 'UTC' },
  );
  assert.equal(url, 'https://api.github.com/search/repositories?q=AI+created:%3E2026-11-02');
});

test('parsesJsonAndXmlBodiesByContentShape', () => {
  const jsonSource = { id: 'a', name: 'A', url: 'https://a.test/x', kind: 'json', adapter: 'hn-algolia', tier: 2, trustCategory: true };
  const items = parseSourceBody(jsonSource, JSON.stringify({ hits: [{ objectID: '1', title: 'Long enough title here', url: 'https://a.test/1', created_at: '2026-11-08T00:00:00Z' }] }));
  assert.equal(items.length, 1);
  const rssSource = { id: 'b', name: 'B', url: 'https://b.test/feed', kind: 'rss', tier: 2, trustCategory: true };
  const xmlItems = parseSourceBody(rssSource, '<rss><channel><item><title>A long enough feed title</title><link>https://b.test/1</link></item></channel></rss>');
  assert.equal(xmlItems[0].url, 'https://b.test/1');
});

test('reportsPerSourceFailuresWithoutThrowing', async () => {
  const sources = [
    { id: 'dead-one', name: 'Dead One', url: 'https://dead-one.invalid/feed', kind: 'rss', tier: 2 },
    { id: 'dead-two', name: 'Dead Two', url: 'https://dead-two.invalid/feed', kind: 'rss', tier: 2 },
  ];
  const results = await fetchAllSources(sources, { concurrency: 2, timeoutMs: 2_000, retries: 0 });
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.ok === false && result.items.length === 0 && result.error));
});

test('sendsTheActionsTokenOnlyToApiGitHubCom', () => {
  process.env.GITHUB_TOKEN = ' Actions 注入的临时令牌 ';
  assert.equal(headersFor('https://api.github.com/search/repositories?q=AI').authorization, 'Bearer  Actions 注入的临时令牌 ');
  assert.equal(headersFor('https://hn.algolia.com/api/v1/search').authorization, undefined);
  delete process.env.GITHUB_TOKEN;
});

test('enrichesPopularForumTopicsWithMainPostBody', async () => {
  const source = { id: 'lcz-hardware', name: '抡锤者 AI硬件', url: 'https://lcz.me/api/category/6', kind: 'json', adapter: 'nodebb', tier: 2 };
  const items = [
    { id: '2894', title: '短标题占位', url: 'https://lcz.me/topic/2894', summary: '一句话 teaser', categories: [], metrics: { points: 1, comments: 3, views: 268 } },
    { id: '2918', title: '另一个帖子', url: 'https://lcz.me/topic/2918', summary: '另一个 teaser', categories: [], metrics: { points: 0, comments: 6, views: 175 } },
  ];
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.endsWith('/2894')) {
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          title: '【实测分享】单张 RTX 5080 跑 Qwen3.8-Flash IQ3_S，输出 105～132 tok/s',
          votes: 5,
          postcount: 8,
          viewcount: 420,
          lczExcellent: 1,
          tags: [{ value: '5080' }, { value: 'tok/s' }],
          posts: [{ content: '<p>标准测速中位数 <code>105.6 ～ 132.1 tok/s</code>，prefill 稳定在 3,400 tok/s，12 万 token 长文 28 秒读完。</p>' }],
        }),
      };
    }
    return { ok: false, status: 404, body: '', error: 'not found' };
  };
  await enrichForumTopics(items, source, { fetchImpl, timeoutMs: 1_000 });
  assert.deepEqual(requested.sort(), ['https://lcz.me/api/topic/2894', 'https://lcz.me/api/topic/2918']);
  assert.match(items[0].summary, /105\.6 ～ 132\.1 tok\/s/);
  assert.equal(items[0].excellent, true);
  assert.equal(items[0].metrics.comments, 7);
  assert.deepEqual(items[0].categories, ['5080', 'tok/s']);
  assert.equal(items[1].summary, '另一个 teaser');
});

test('skipsForumEnrichmentForOtherAdapters', async () => {
  const items = [{ id: '1', summary: 'keep me' }];
  const result = await enrichForumTopics(items, { id: 'x', adapter: 'hn-algolia' }, { fetchImpl: async () => ({ ok: true, status: 200, body: '{}' }) });
  assert.equal(result[0].summary, 'keep me');
});
