import assert from 'node:assert/strict';
import test from 'node:test';
import { headersFor } from '../../src/lib/http.mjs';
import { fetchAllSources, parseSourceBody, resolveSourceUrl } from '../../src/lib/sources.mjs';

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
