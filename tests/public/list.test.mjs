import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPage, runListScript } from './dom-fixture.mjs';

const rows = [
  { slug: 'r1', month: '2026-11', rank: 9, quality: 9, score: 30, published: '2026-11-02T00:00:00Z' },
  { slug: 'r2', month: '2026-11', rank: 15, quality: 15, score: 4, published: '2026-11-06T00:00:00Z' },
  { slug: 'r3', month: '2025-12', rank: 12, quality: 12, score: 88, published: '2025-12-20T00:00:00Z' },
];

const visibleSlugs = (page) => page.list.children.filter((row) => !row.hidden).map((row) => row.dataset.slug);

test('listScriptSortsRowsByQualityAndReportsTheVisibleCount', async () => {
  const page = buildPage(rows);
  await runListScript(page.body, '');
  assert.deepEqual(page.list.children.map((row) => row.dataset.slug), ['r2', 'r3', 'r1']);
  assert.equal(page.count.textContent, '3');
  assert.equal(page.hint.textContent, '按质量评分从高到低');
});

test('listScriptHidesRowsOutsideTheChosenMonthAndWritesTheUrl', async () => {
  const page = buildPage(rows);
  const context = await runListScript(page.body, '');
  page.monthField.value = '2026-11';
  page.monthField.emit('change');
  assert.deepEqual(visibleSlugs(page), ['r2', 'r1']);
  assert.deepEqual(page.list.children.filter((row) => row.hidden).map((row) => row.dataset.slug), ['r3']);
  assert.equal(page.count.textContent, '2');
  assert.equal(new URLSearchParams(context.window.location.search).get('month'), '2026-11');
});

test('listScriptReadsSortAndYearFromTheUrlAndKeepsEveryRowInTheDom', async () => {
  const page = buildPage(rows);
  await runListScript(page.body, '?sort=score&year=2026');
  assert.deepEqual(visibleSlugs(page), ['r1', 'r2']);
  assert.equal(page.sortField.value, 'score');
  assert.equal(page.yearField.value, '2026');
  assert.equal(page.hint.textContent, '按来源热度从高到低');
  assert.equal(page.list.children.length, 3);
});

test('listScriptShowsAnEmptyNoteWhenThePeriodHasNoRows', async () => {
  const page = buildPage(rows);
  await runListScript(page.body, '');
  page.monthField.value = '2026-10';
  page.monthField.emit('change');
  assert.deepEqual(visibleSlugs(page), []);
  assert.equal(page.count.textContent, '0');
  assert.ok(page.list.parent.children.some((node) => node.className === 'empty'));
});
