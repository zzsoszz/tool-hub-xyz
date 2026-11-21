import assert from 'node:assert/strict';
import test from 'node:test';
import { Node, runBrowserScript } from './dom-fixture.mjs';

// 列表里三种缩略图：已经取不到的（上游删图 / 防盗链）、能取到的、加载到一半才失败的。
function buildThumbPage() {
  const body = new Node('body');
  const main = new Node('main');
  const list = new Node('ol', { class: 'stories' });
  const rows = {};
  for (const slug of ['dead', 'live', 'late']) {
    const row = new Node('li', { class: 'story' });
    const figure = new Node('figure', { class: 'story-thumb' });
    const image = new Node('img', { src: `https://cdn.test/${slug}.png`, alt: '配图' });
    figure.append(image);
    row.append(figure);
    list.append(row);
    rows[slug] = { row, figure, image };
  }
  main.append(list);
  body.append(main);
  return { body, list, ...rows };
}

async function run() {
  const page = buildThumbPage();
  page.dead.image.complete = true;
  page.dead.image.naturalWidth = 0;
  await runBrowserScript('thumbs.js', page.body);
  return page;
}

test('dropsTheFigureOfAThumbnailThatAlreadyFailedToLoad', async () => {
  const { dead, live, list } = await run();
  assert.equal(dead.row.children.includes(dead.figure), false, '取不到图的行不该顶着一块破图');
  assert.equal(live.row.children.includes(live.figure), true);
  assert.equal(list.querySelectorAll('figure.story-thumb').length, 2);
});

test('dropsTheFigureWhenAThumbnailFailsWhileStillLoading', async () => {
  const { late, list } = await run();
  assert.equal(late.row.children.includes(late.figure), true);
  late.image.emit('error', {});
  assert.equal(late.row.children.includes(late.figure), false);
  assert.equal(list.querySelectorAll('figure.story-thumb').length, 1);
});
