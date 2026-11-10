import assert from 'node:assert/strict';
import test from 'node:test';
import { archivePeriods, archiveYears, itemsForSection, itemsForSubsection, itemsIndex } from '../../src/lib/items.mjs';

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

// 搜索框查的是这份索引：摘要和页面上显示的正文必须一起带上，否则「搜文章」只能搜标题。
test('itemsIndexCarriesSummaryAndBodyTextForSearch', () => {
  const index = itemsIndex([
    {
      ...base,
      slug: 'a1',
      day: '2026-11-09',
      category: 'hardware',
      title: 'Local model checklist',
      zhTitle: '本地模型省钱清单',
      summary: 'ollama 加本地部署，16G 显存够用。',
      content: { text: '第一段讲安装，第二段讲量化。' },
    },
  ]);
  assert.deepEqual(Object.keys(index), ['a1']);
  assert.equal(index.a1.title, '本地模型省钱清单');
  assert.equal(index.a1.originalTitle, 'Local model checklist');
  assert.match(index.a1.summary, /ollama/);
  assert.match(index.a1.text, /量化/);
});
