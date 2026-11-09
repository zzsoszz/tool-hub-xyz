import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey, normalizeUrl, parseDate, timeAgo, titleKey, urlKey } from '../../src/lib/normalize.mjs';

test('parsesRfc822DatesWithTimezoneOffset', () => {
  const date = parseDate('Tue, 04 Nov 2026 09:30:00 +0800');
  assert.equal(date.toISOString(), '2026-11-04T01:30:00.000Z');
});

test('parsesIsoDatesAndEpochSeconds', () => {
  assert.equal(parseDate('2026-11-04T02:15:00Z').toISOString(), '2026-11-04T02:15:00.000Z');
  assert.equal(parseDate('1730000000').toISOString(), new Date(1730000000 * 1000).toISOString());
  assert.equal(parseDate('1730000000000').toISOString(), new Date(1730000000000).toISOString());
});

test('returnsNullForMissingOrUnparsableDates', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('上周某个下午'), null);
});

test('normalizesUrlsByDroppingTrackingParamsAndWww', () => {
  assert.equal(
    normalizeUrl('https://Sample.Example.com/gpt6-launch/?utm_source=rss&ref=tw&x=1'),
    'https://sample.example.com/gpt6-launch?x=1',
  );
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
});

test('buildsStableKeysForEquivalentUrlsAndTitles', () => {
  assert.equal(urlKey('https://example.com/a?utm_source=x'), urlKey('https://example.com/a?utm_source=y'));
  assert.equal(titleKey('OpenAI 发布 GPT-6 大模型', 'https://example.com/a'), titleKey('openai 发布 gpt-6 大模型', 'https://other.test/b'));
  assert.equal(titleKey('短标题', 'https://example.com/a'), null);
});

test('buildsDifferentDayKeysForShanghaiAndUtc', () => {
  const instant = new Date('2026-11-04T23:30:00Z');
  assert.equal(dayKey(instant, 'Asia/Shanghai'), '2026-11-05');
  assert.equal(dayKey(instant, 'UTC'), '2026-11-04');
});

test('labelsRelativeTimeInChinese', () => {
  const now = new Date('2026-11-09T08:00:00Z');
  assert.equal(timeAgo(new Date('2026-11-09T07:30:00Z'), now), '30 分钟前');
  assert.equal(timeAgo(new Date('2026-11-09T04:00:00Z'), now), '4 小时前');
  assert.equal(timeAgo(new Date('2026-11-01T08:00:00Z'), now), '8 天前');
});
