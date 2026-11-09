import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPeriod, monthKey, monthsFor, sortEntries, sortMode } from '../../src/lib/listview.mjs';

const entry = (overrides) => ({
  slug: 'x',
  published: '2026-11-08T00:00:00Z',
  quality: 5,
  ...overrides,
});

test('monthKeyPrefersPublishedDateAndFallsBackToDigestDay', () => {
  assert.equal(monthKey(entry({ published: '2026-10-31T23:00:00Z' })), '2026-10');
  assert.equal(monthKey({ day: '2026-09-02' }), '2026-09');
  assert.equal(monthKey({ published: 'not-a-date', day: '坏日期' }), '');
});

test('monthsForCountsEntriesByMonthNewestFirst', () => {
  const entries = [
    entry({ slug: 'a1' }),
    entry({ slug: 'a2', published: '2026-11-09T00:00:00Z' }),
    entry({ slug: 'a3', published: '2026-09-01T00:00:00Z' }),
    entry({ slug: 'a4', published: '2025-12-30T00:00:00Z' }),
  ];
  assert.deepEqual(monthsFor(entries).map((period) => [period.key, period.count]), [['2026-11', 2], ['2026-09', 1], ['2025-12', 1]]);
  assert.deepEqual(monthsFor(entries).map((period) => period.year), ['2026', '2026', '2025']);
});

test('matchesPeriodNarrowsToMonthThenYear', () => {
  const october = entry({ published: '2026-10-05T00:00:00Z' });
  assert.equal(matchesPeriod(october, {}), true);
  assert.equal(matchesPeriod(october, { month: '2026-10' }), true);
  assert.equal(matchesPeriod(october, { month: '2026-11' }), false);
  assert.equal(matchesPeriod(october, { year: '2026' }), true);
  assert.equal(matchesPeriod(october, { year: '2025' }), false);
});

test('sortEntriesSwitchesBetweenQualityNewestAndSourceScore', () => {
  const entries = [
    entry({ slug: 'b1', published: '2026-11-01T00:00:00Z', quality: 6, rank: 6, score: 40 }),
    entry({ slug: 'b2', published: '2026-11-08T00:00:00Z', quality: 11, rank: 11, score: 5 }),
    entry({ slug: 'b3', published: '2026-11-05T00:00:00Z', quality: 8, rank: 8, score: 90 }),
  ];
  assert.deepEqual(sortEntries(entries).map((item) => item.slug), ['b2', 'b3', 'b1']);
  assert.deepEqual(sortEntries(entries, 'newest').map((item) => item.slug), ['b2', 'b3', 'b1']);
  assert.deepEqual(sortEntries(entries, 'score').map((item) => item.slug), ['b3', 'b1', 'b2']);
  assert.deepEqual(sortEntries(entries, '不认识的模式').map((item) => item.slug), ['b2', 'b3', 'b1']);
  assert.equal(sortMode('score'), 'score');
  assert.equal(sortMode('乱写'), 'quality');
});
