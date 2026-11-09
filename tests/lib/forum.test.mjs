import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommentTree, checkRateLimit, isValidSlug, sanitizeAuthor, sanitizeBody, validateComment } from '../../src/lib/forum.mjs';

const slug = 'a'.repeat(12);
test('acceptsAValidCommentAndDefaultsAnonymousAuthor', () => {
  const draft = validateComment({ item: slug, body: '这个工具免费吗？', author: '  夜行猫  ' });
  assert.equal(draft.ok, true);
  assert.equal(draft.author, '夜行猫');
  assert.equal(draft.parent, null);
});

test('rejectsBadSlugsShortBodiesAndHoneypot', () => {
  assert.equal(validateComment({ item: 'not-a-slug', body: 'hello there' }).ok, false);
  assert.equal(validateComment({ item: slug, body: 'ab' }).ok, false);
  assert.equal(validateComment({ item: slug, body: 'x'.repeat(2001) }).ok, false);
  assert.equal(validateComment({ item: slug, body: 'spam plz', website: 'http://spam.example' }).ok, false);
  assert.equal(isValidSlug('abc'), false);
  assert.equal(isValidSlug(slug), true);
});
test('stripsHtmlAndControlCharsFromBody', () => {
  assert.equal(sanitizeBody('<script>alert(1)</script>正常内容'), 'alert(1) 正常内容');
  assert.equal(sanitizeBody('第一行\n\n\n\n第二行'), '第一行\n\n第二行');
  assert.equal(sanitizeAuthor('bad' + String.fromCharCode(0) + 'name'), 'bad name');
  assert.equal(sanitizeAuthor('   '), '匿名');
});

test('rateLimitsByMinimumIntervalAndHourlyQuota', () => {
  const now = new Date('2026-11-09T10:00:00.000Z');
  const tooSoon = checkRateLimit({ lastCommentAt: new Date(now.getTime() - 5_000).toISOString(), recentCount: 1, now });
  assert.equal(tooSoon.ok, false);
  assert.ok(tooSoon.retryAfter > 0);
  assert.equal(checkRateLimit({ lastCommentAt: new Date(now.getTime() - 60_000).toISOString(), recentCount: 1, now }).ok, true);
  const quota = checkRateLimit({ lastCommentAt: null, recentCount: 8, now });
  assert.equal(quota.ok, false);
  assert.equal(quota.retryAfter, 3600);
});

test('buildsCommentTreeAndCapsReplyDepth', () => {
  const rows = [
    { id: 1, parent: null },
    { id: 2, parent: 1 },
    { id: 3, parent: 2 },
    { id: 4, parent: 3 },
    { id: 5, parent: null },
  ];
  const tree = buildCommentTree(rows);
  assert.deepEqual(tree.map((node) => [node.id, node.depth]), [[1, 0], [2, 1], [3, 2], [4, 2], [5, 0]]);
});
