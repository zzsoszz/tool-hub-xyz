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

test('categorizesPaperItemsAsResearch', () => {
  const paper = item({ title: 'New paper benchmarks reasoning models on graduate-level math', summary: 'Results across 12 benchmarks show training gains.' });
  assert.equal(filter.categorize(paper), 'research');
});

test('fallsBackToDeclaredCategoryWhenNoKeywordsMatch', () => {
  const vague = item({ title: 'A quiet weekly note', trustCategory: true, declaredCategory: 'opinion' });
  assert.equal(filter.categorize(vague), 'opinion');
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

test('biasesTowardTheDeclaredCategoryOfCuratedSources', () => {
  const essay = item({ title: 'Why tool use benchmarks keep lying to us', summary: 'A long read on evals and agents.', trustCategory: true, declaredCategory: 'opinion' });
  assert.equal(filter.categorize(essay), 'opinion');
});

test('enforcesPerSourceMetricMinimums', () => {
  const repo = item({ title: 'new/ai-project', metrics: { stars: 40 } });
  assert.equal(filter.passesGuards(repo, { minMetrics: { stars: 100 } }), false);
  assert.equal(filter.passesGuards({ ...repo, metrics: { stars: 420 } }, { minMetrics: { stars: 100 } }), true);
  assert.equal(filter.passesGuards(repo, {}), true);
});
