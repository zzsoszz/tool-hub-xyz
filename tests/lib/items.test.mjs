import assert from 'node:assert/strict';
import test from 'node:test';
import { archivePeriods, archiveYears, itemIllustration, itemImage, itemsForSection, itemsForSubsection, itemsIndex, stampIssues } from '../../src/lib/items.mjs';

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

// 期号轨与「第 N 次上榜」是构建期从已发布日报的序列里算出来的，采集数据里没有这两个字段。
function period(day, ranks) {
  return {
    day,
    categories: [{
      id: 'apps',
      label: 'AI 应用',
      items: ranks.map(([slug, rank]) => ({ ...base, slug, day, category: 'apps', rank, quality: rank })),
    }],
  };
}

test('stampIssuesNumbersTheOldestDayFirstAndMarksRepeatedItems', () => {
  const yesterday = period('2026-11-08', [['a1', 20], ['a2', 19]]);
  const today = period('2026-11-09', [['a2', 20], ['a1', 19]]);
  assert.equal(stampIssues([today, yesterday]), 2);
  assert.deepEqual([yesterday.issue, today.issue], [1, 2]);
  const [first, second] = today.categories[0].items;
  assert.equal(first.slug, 'a2');
  assert.deepEqual([first.position, first.issue, first.firstSeenIssue, first.issueCount, first.isNew], [1, 2, 1, 2, false]);
  const [earliest] = yesterday.categories[0].items;
  assert.deepEqual([earliest.position, earliest.issue, earliest.issueCount, earliest.isNew], [1, 1, 1, true]);
});

test('itemIllustrationReportsTheFirstRealImageWithItsAlt', () => {
  const item = { content: { html: '<p><img src="https://s.w.org/images/core/emoji/17.0.2/72x72/2705.png" alt="✅"></p><p><img src="/images/upload-cover.png" alt="一张评测截图" loading="lazy"></p>' } };
  assert.deepEqual(itemIllustration(item), { src: '/images/upload-cover.png', alt: '一张评测截图', hasAlt: true });
  assert.equal(itemImage(item), '/images/upload-cover.png');
});

test('itemIllustrationFlagsAltThatIsOnlyAFileName', () => {
  const item = { content: { html: '<img src="https://cdn.test/cover.jpeg" alt="cover.jpeg">' } };
  assert.deepEqual(itemIllustration(item), { src: 'https://cdn.test/cover.jpeg', alt: 'cover.jpeg', hasAlt: false });
  assert.equal(itemIllustration({ content: { html: '<img src="https://cdn.test/a.png" alt="">' } }).hasAlt, false);
});

test('itemIllustrationIgnoresImagesThatAreNotIllustrations', () => {
  assert.equal(itemIllustration({ content: { html: '<img src="https://lcz.me/assets/avatar/1.png" alt="作者头像">' } }), null);
  assert.equal(itemImage({ content: { html: '<img src="/uploads/site-logo.svg" alt="站点标志">' } }), null);
});

test('itemIllustrationArchivedOnlySkipsHotlinkedImages', () => {
  const item = { content: { html: '<img src="https://lcz.me/uploads/bench.png" alt="跑分截图">' } };
  assert.deepEqual(itemIllustration(item, { archivedOnly: true }), null);
  assert.deepEqual(
    itemIllustration({ content: { html: '<img src="/images/uploads-bench.png" alt="跑分截图">' } }, { archivedOnly: true }),
    { src: '/images/uploads-bench.png', alt: '跑分截图', hasAlt: true },
  );
});
