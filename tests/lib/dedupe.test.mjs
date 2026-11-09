import assert from 'node:assert/strict';
import test from 'node:test';
import { filterNewItems, itemKeys, normalizeSeen, pruneSeen, serializeSeen } from '../../src/lib/dedupe.mjs';

test('dedupesItemsThatDifferOnlyByTrackingParams', () => {
  const seen = new Map();
  const { fresh, duplicates } = filterNewItems(
    [
      { title: 'OpenAI 发布新一代模型', url: 'https://example.com/a?utm_source=x', sourceId: 'one' },
      { title: 'Another headline about the same story', url: 'https://example.com/a?utm_source=y&ref=tw', sourceId: 'two' },
    ],
    seen,
    { day: '2026-11-09' },
  );
  assert.equal(fresh.length, 1);
  assert.equal(duplicates.length, 1);
});

test('dedupesReprintedTitlesAcrossSources', () => {
  const seen = new Map();
  const { fresh } = filterNewItems(
    [
      { title: 'Anthropic 宣布新一代 Claude 模型', url: 'https://a.example/one', sourceId: 'a' },
      { title: 'Anthropic 宣布新一代 Claude 模型', url: 'https://b.example/two', sourceId: 'b' },
    ],
    seen,
    { day: '2026-11-09' },
  );
  assert.equal(fresh.length, 1);
});

test('recordsSeenKeysWithTheCurrentDay', () => {
  const seen = new Map();
  filterNewItems([{ title: 'Reasoning benchmark release', url: 'https://example.com/bench', sourceId: 'a' }], seen, { day: '2026-11-09' });
  assert.equal(seen.size, 2);
  assert.equal([...seen.values()][0], '2026-11-09');
});

test('ignoresItemsWithoutUsableKeys', () => {
  const { fresh, duplicates } = filterNewItems([{ title: '短', url: 'javascript:alert(1)', sourceId: 'a' }], new Map(), { day: '2026-11-09' });
  assert.equal(fresh.length, 0);
  assert.equal(duplicates.length, 1);
});

test('prunesEntriesOlderThanTheRetentionWindow', () => {
  const seen = new Map([['a', '2026-09-01'], ['b', '2026-11-08']]);
  const cutoff = pruneSeen(seen, { retentionDays: 45, timezone: 'Asia/Shanghai', now: new Date('2026-11-09T04:00:00Z') });
  assert.equal(cutoff, '2026-09-25');
  assert.deepEqual([...seen.keys()], ['b']);
});

test('capsSerializedSeenEntries', () => {
  const seen = new Map([['a', '2026-11-09'], ['b', '2026-11-08'], ['c', '2026-11-07'], ['d', '2026-11-06']]);
  pruneSeen(seen, { retentionDays: 45, timezone: 'Asia/Shanghai', now: new Date('2026-11-09T04:00:00Z'), limit: 2 });
  const payload = serializeSeen(seen);
  assert.equal(payload.count, 2);
  assert.deepEqual(Object.keys(payload.entries), ['a', 'b']);
});

test('normalizesSeenFilesIntoMaps', () => {
  const seen = normalizeSeen({ version: 1, entries: { k1: '2026-11-01', k2: 42 } });
  assert.deepEqual([...seen.entries()], [['k1', '2026-11-01']]);
  assert.equal(itemKeys({ title: 'A reasonably long headline', url: 'https://example.com/z' }).length, 2);
});
