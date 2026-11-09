import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { parseJsonFeed } from '../../src/lib/adapters.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

async function load(name, source) {
  const payload = JSON.parse(await readFile(path.join(FIXTURES, name), 'utf8'));
  return parseJsonFeed(payload, source);
}

const hnSource = { id: 'hn-algolia', name: 'Hacker News', url: 'https://hn.algolia.com/api/v1/search', kind: 'json', adapter: 'hn-algolia', tier: 2, trustCategory: true, category: 'engineering' };
const paperSource = { id: 'hf-daily-papers', name: 'HF Daily Papers', url: 'https://huggingface.co/api/daily_papers', kind: 'json', adapter: 'hf-daily-papers', tier: 1, trustCategory: true, category: 'research' };
const repoSource = { id: 'github-trending', name: 'GitHub 新晋 AI 项目', url: 'https://api.github.com/search/repositories', kind: 'json', adapter: 'github-search', tier: 2, trustCategory: true, category: 'opensource' };

test('fallsBackToHackerNewsItemPageWhenStoryHasNoExternalUrl', async () => {
  const items = await load('hn-algolia.json', hnSource);
  assert.equal(items[1].url, 'https://news.ycombinator.com/item?id=42000002');
  assert.equal(items[0].metrics.points, 214);
});

test('buildsHuggingFacePaperLinksFromPaperIds', async () => {
  const items = await load('hf-daily-papers.json', paperSource);
  assert.equal(items[0].url, 'https://huggingface.co/papers/2611.01234');
  assert.equal(items[0].metrics.upvotes, 210);
});

test('includesRepositoryStarsAndTopicsInSummary', async () => {
  const items = await load('github-trending.json', repoSource);
  assert.equal(items[0].url, 'https://github.com/example/agent-runtime');
  assert.ok(items[0].summary.includes('★ 1830'));
  assert.equal(items[1].published, '2026-11-01T06:00:00.000Z');
});

test('throwsWhenAdapterIsMissing', () => {
  assert.throws(() => parseJsonFeed({ hits: [] }, { id: 'x', name: 'X', url: 'https://x.test', kind: 'json' }), /缺少 adapter/);
});
