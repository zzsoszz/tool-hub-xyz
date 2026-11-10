import assert from 'node:assert/strict';
import test from 'node:test';
import { Node, runBrowserScript } from './dom-fixture.mjs';

// 页面里会出现的三种图片：正文配图、列表缩略图（本身是链接）、评测图表（带 figcaption）。
function buildImagePage() {
  const body = new Node('body');
  const main = new Node('main');
  const article = new Node('div', { class: 'article' });
  const chart = new Node('img', { src: 'https://cdn.test/shot.png', alt: '显存占用曲线' });
  article.append(chart);
  const thumbLink = new Node('a', { class: 'story-thumb-link' });
  const thumb = new Node('img', { class: 'story-thumb', src: '/thumb.webp', alt: '' });
  thumbLink.append(thumb);
  const figure = new Node('figure', { class: 'bench-figure' });
  const svg = new Node('img', { src: '/bench/strata-community-chart.svg', alt: '生成速度排行', data: { zoom: 'true', full: '/bench/strata-community-chart.svg' } });
  const caption = new Node('figcaption');
  caption.textContent = '社区实测生成速度排行（32K 输入） · 点击放大';
  figure.append(svg, caption);
  main.append(article, thumbLink, figure);
  body.append(main);
  return { body, article, chart, thumb, svg, caption };
}

async function run() {
  const page = buildImagePage();
  await runBrowserScript('lightbox.js', page.body);
  const overlay = () => page.body.children.find((node) => node.className === 'lightbox') ?? null;
  const imageInOverlay = () => overlay()?.querySelector('img') ?? null;
  return { ...page, overlay, imageInOverlay };
}

test('marksArticleAndChartImagesAsZoomable', async () => {
  const { chart, svg, thumb } = await run();
  assert.equal(chart.dataset.zoom, 'true');
  assert.equal(chart.getAttribute('role'), 'button');
  assert.equal(chart.getAttribute('tabindex'), '0');
  assert.equal(chart.getAttribute('aria-label'), '显存占用曲线');
  assert.equal(svg.getAttribute('aria-label'), '社区实测生成速度排行（32K 输入） · 点击放大');
  assert.equal(thumb.dataset.zoom, undefined);
  assert.equal(thumb.getAttribute('role'), undefined);
});

test('clickingAnImageOpensAnOverlayWithTheFullSizeSource', async () => {
  const page = await run();
  page.svg.emit('click');
  const box = page.overlay();
  assert.ok(box);
  assert.equal(box.getAttribute('role'), 'dialog');
  assert.equal(page.imageInOverlay().getAttribute('src'), '/bench/strata-community-chart.svg');
  assert.ok(box.querySelector('figcaption').textContent.includes('社区实测生成速度排行'));
  assert.equal(page.body.dataset.lightbox, 'open');
});

test('smallInlineImagesStayClickableWithoutKeyboardFocus', async () => {
  const page = buildImagePage();
  const emoji = new Node('img', { src: 'https://cdn.test/26a0.png', alt: '⚠' });
  page.article.append(emoji);
  await runBrowserScript('lightbox.js', page.body);
  assert.equal(emoji.dataset.zoom, 'true');
  assert.equal(emoji.getAttribute('tabindex'), undefined);
  emoji.emit('click');
  const box = page.body.children.find((node) => node.className === 'lightbox');
  assert.ok(box);
  assert.equal(box.querySelector('img').getAttribute('src'), 'https://cdn.test/26a0.png');
});

test('thumbnailLinksStayLinksInsteadOfOpeningTheOverlay', async () => {
  const page = await run();
  page.thumb.emit('click');
  assert.equal(page.overlay(), null);
  assert.equal(page.body.dataset.lightbox, undefined);
});

test('escapeAndBackgroundClickCloseTheOverlayAndGiveFocusBack', async () => {
  const page = await run();
  page.chart.emit('click');
  const closeByEscape = () => page.body.emit('keydown', { key: 'Escape' });
  closeByEscape();
  assert.equal(page.overlay(), null);
  assert.equal(page.body.dataset.lightbox, undefined);
  assert.equal(page.chart.focused, true);

  page.svg.emit('keydown', { key: 'Enter', preventDefault() {} });
  const box = page.overlay();
  box.emit('click', { target: box });
  assert.equal(page.overlay(), null);
  assert.equal(page.svg.focused, true);
});

test('closingButtonOnTheOverlayDismissesIt', async () => {
  const page = await run();
  page.chart.emit('click');
  const first = page.overlay();
  first.querySelector('button').emit('click');
  assert.equal(page.overlay(), null);
  page.chart.emit('click');
  assert.notEqual(page.overlay(), first);
});
