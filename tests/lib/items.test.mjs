import assert from 'node:assert/strict';
import test from 'node:test';
import { archivePeriods, archiveYears, itemsForSection, itemsForSubsection } from '../../src/lib/items.mjs';

const base = {
  published: '2026-11-08T00:00:00Z',
  sourceName: 'Source',
  url: 'https://example.com/x',
  tags: [],
};

const items = [
  { ...base, slug: 'a1', day: '2026-11-09', category: 'hardware', subcategory: 'gpu', quality: 7, rank: 10 },
  { ...base, slug: 'a2', day: '2026-11-09', category: 'hardware', subcategory: 'gpu', quality: 12, rank: 14, tags: ['hardware'] },
  { ...base, slug: 'a3', day: '2026-09-02', published: '2026-09-01T00:00:00Z', category: 'apps', quality: 9, rank: 11 },
];

test('archivePeriodsGroupsByMonthAndSortsByQuality', () => {
  const periods = archivePeriods(items);
  assert.deepEqual(periods.map((period) => period.key), ['2026-11', '2026-09']);
  assert.deepEqual(periods[0].items.map((item) => item.slug), ['a2', 'a1']);
  assert.deepEqual(archiveYears(periods).map((year) => [year.year, year.count]), [['2026', 3]]);
});

test('sectionMatchesCategoryOrTagFacetAndSubsectionsStayInsideTheirSection', () => {
  const section = { id: 'hardware', categories: ['hardware'], tags: ['benchmark'] };
  const scoped = itemsForSection(items, section, { lookbackDays: 400, now: new Date('2026-11-10T00:00:00Z') });
  assert.deepEqual(scoped.map((item) => item.slug), ['a1', 'a2']);
  assert.deepEqual(itemsForSubsection(items, section, { id: 'gpu' }, { lookbackDays: 400, now: new Date('2026-11-10T00:00:00Z') }).map((item) => item.slug), ['a1', 'a2']);
  assert.deepEqual(itemsForSubsection(items, { id: 'bench', categories: ['bench'] }, { id: 'benchmark' }, { lookbackDays: 400, now: new Date('2026-11-10T00:00:00Z') }), []);
});
