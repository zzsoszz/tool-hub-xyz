import assert from 'node:assert/strict';
import test from 'node:test';
import { selectByCategoryQuota } from '../../src/lib/select.mjs';

function candidates() {
  return [
    { title: 'industry 1', category: 'industry', score: 20 },
    { title: 'industry 2', category: 'industry', score: 19 },
    { title: 'industry 3', category: 'industry', score: 18 },
    { title: 'industry 4', category: 'industry', score: 17 },
    { title: 'industry 5', category: 'industry', score: 16 },
    { title: 'models 1', category: 'models', score: 12 },
    { title: 'research 1', category: 'research', score: 11 },
    { title: 'research 2', category: 'research', score: 10 },
  ];
}

test('keepsEveryCategoryRepresentedInsteadOfOnlyTheHighestScores', () => {
  const selected = selectByCategoryQuota(candidates(), { limit: 4, categoryOrder: ['models', 'research', 'industry'] });
  const categories = new Set(selected.map((item) => item.category));
  assert.deepEqual([...categories].sort(), ['industry', 'models', 'research']);
  assert.equal(selected.length, 4);
});

test('fillsRemainingSlotsWithTheBestLeftovers', () => {
  const selected = selectByCategoryQuota(candidates(), { limit: 7, categoryOrder: [] });
  assert.equal(selected.length, 7);
  assert.equal(selected.filter((item) => item.category === 'industry').length, 4);
});

test('neverExceedsTheLimitAndAlwaysTakesAtLeastOnePerCategory', () => {
  const selected = selectByCategoryQuota(candidates(), { limit: 3, categoryOrder: [] });
  assert.equal(selected.length, 3);
  assert.deepEqual(new Set(selected.map((item) => item.category)), new Set(['industry', 'models', 'research']));
});
