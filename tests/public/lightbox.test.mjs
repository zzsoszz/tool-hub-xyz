import assert from 'node:assert/strict';
import test from 'node:test';
import { Node, runBrowserScript } from './dom-fixture.mjs';

// 页面里会出现的四种图片：正文配图、列表缩略图（外面包着装饰性 <a>）、
// 上游直链到原图的图片、评测图表（带 figcaption）。
function buildImagePage() {
  const body = new Node('body');
  const main = new Node('main');
  const article = new Node('div', { class: 'article' });
  const chart = new Node('img', { src: 'https://cdn.test/shot.png', alt: '显存占用曲线' });
  article.append(chart);
  const thumbLink = new Node('a', { class: 'story-thumb-link', href: '/item/abc123' });
  thumbLink.setAttribute('tabindex', '-1');
  thumbLink.setAttribute('aria-hidden', 'true');
  const thumb = new Node('img', { class: 'story-thumb', src: 'https://cdn.test/full-size.jpg', alt: '' });
  thumbLink.append(thumb);
  const directLink = new Node('a', { href: 'https://cdn.test/original.png?width=1600' });
  const direct = new Node('img', { src: 'https://cdn.test/thumb.png?width=320', alt: '同一张图的缩略版' });
  directLink.append(direct);
  const figure = new Node('figure', { class: 'bench-figure' });
  const svg = new Node('img', { src: '/bench/strata-community-chart.svg', alt: '生成速度排行', data: { zoom: 'true', full: '/bench/strata-community-chart.svg' } });
  const caption = new Node('figcaption');
  caption.textContent = '社区实测生成速度排行（32K 输入） · 点击放大';
  figure.append(svg, caption);
  main.append(article, thumbLink, directLink, figure);
  body.append(main);
  return { body, main, article, chart, thumb, thumbLink, direct, directLink, svg, caption };
}

async function run() {
  const page = buildImagePage();
  await runBrowserScript('lightbox.js', page.body);
  const overlay = () => page.body.children.find((node) => node.className === 'lightbox') ?? null;
  const imageInOverlay = () => overlay()?.querySelector('img') ?? null;
  const button = (className) => overlay()?.querySelector(`.${className}`);
  const scaleText = () => overlay()?.querySelector('.lightbox-scale')?.textContent ?? '';
  return { ...page, overlay, imageInOverlay, button, scaleText };
}

function clickEvent() {
  const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  return event;
}

test('marksArticleAndChartImagesAsZoomable', async () => {
  const { chart, svg, thumb, thumbLink } = await run();
  assert.equal(chart.dataset.zoom, 'true');
  assert.equal(chart.getAttribute('role'), 'button');
  assert.equal(chart.getAttribute('tabindex'), '0');
  assert.equal(chart.getAttribute('aria-label'), '显存占用曲线');
  assert.equal(svg.getAttribute('aria-label'), '社区实测生成速度排行（32K 输入） · 点击放大');
  // 列表缩略图现在点开就是放大；它是装饰图（alt=""，文字在标题链接里），所以不额外给键盘停留点。
  assert.equal(thumb.dataset.zoom, 'true');
  assert.equal(thumb.getAttribute('role'), undefined);
  assert.equal(thumb.getAttribute('tabindex'), undefined);
  assert.equal(thumbLink.getAttribute('aria-hidden'), 'true');
  assert.equal(thumbLink.getAttribute('tabindex'), '-1');
});

test('clickingAnImageOpensAnOverlayWithTheFullSizeSource', async () => {
  const page = await run();
  page.svg.emit('click', clickEvent());
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
  emoji.emit('click', clickEvent());
  const box = page.body.children.find((node) => node.className === 'lightbox');
  assert.ok(box);
  assert.equal(box.querySelector('img').getAttribute('src'), 'https://cdn.test/26a0.png');
});

test('clickingAThumbnailZoomsInsteadOfFollowingTheLink', async () => {
  const page = await run();
  const event = clickEvent();
  page.thumb.emit('click', event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(page.thumbLink.getAttribute('href'), '/item/abc123');
  assert.ok(page.overlay());
  assert.equal(page.imageInOverlay().getAttribute('src'), 'https://cdn.test/full-size.jpg');
  const link = page.overlay().querySelector('.lightbox-source');
  assert.equal(link.textContent, '进入这篇文章');
  assert.equal(link.href, '/item/abc123');
});

test('imagesWrappedInADirectImageLinkZoomToTheOriginalFile', async () => {
  const page = await run();
  page.direct.emit('click', clickEvent());
  assert.equal(page.imageInOverlay().getAttribute('src'), 'https://cdn.test/original.png?width=1600');
  assert.equal(page.overlay().querySelector('.lightbox-source'), null);
});

test('imagesWrappedInASourceArticleLinkOfferTheOriginalArticle', async () => {
  const page = buildImagePage();
  const postLink = new Node('a', { href: 'https://reddit.example/post' });
  const post = new Node('img', { src: 'https://preview.redd.it/post.png', alt: ' reddit 帖子配图' });
  postLink.append(post);
  page.main.append(postLink);
  await runBrowserScript('lightbox.js', page.body);
  post.emit('click', clickEvent());
  const box = page.body.children.find((node) => node.className === 'lightbox');
  const link = box.querySelector('.lightbox-source');
  assert.equal(link.textContent, '查看原文');
  assert.equal(link.href, 'https://reddit.example/post');
  assert.equal(box.querySelector('img').getAttribute('src'), 'https://preview.redd.it/post.png');
});

test('overlayButtonsZoomInOutAndResetToFit', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
  const big = page.imageInOverlay();
  assert.equal(big.style.transform, 'translate(0px, 0px) scale(1)');
  assert.equal(page.scaleText(), '当前 100%，滚轮或 +/− 缩放，拖动看局部，双击回到适应屏幕');

  page.button('lightbox-zoom-in').emit('click');
  page.button('lightbox-zoom-in').emit('click');
  assert.ok(big.style.transform.includes('scale(1.5625)'));
  assert.equal(page.scaleText(), '当前 156%，滚轮或 +/− 缩放，拖动看局部，双击回到适应屏幕');

  page.button('lightbox-zoom-out').emit('click');
  assert.ok(big.style.transform.includes('scale(1.25)'));

  page.button('lightbox-zoom-reset').emit('click');
  assert.equal(big.style.transform, 'translate(0px, 0px) scale(1)');
});

test('zoomIsClampedBetweenTheBoundsSoImagesNeverDisappear', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
  const big = page.imageInOverlay();
  for (let index = 0; index < 40; index += 1) page.button('lightbox-zoom-in').emit('click');
  assert.ok(big.style.transform.includes('scale(6)'));
  for (let index = 0; index < 60; index += 1) page.button('lightbox-zoom-out').emit('click');
  assert.ok(big.style.transform.includes('scale(0.4)'));
});

test('keyboardAndWheelZoomTheOpenedImage', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
  const big = page.imageInOverlay();
  page.body.emit('keydown', { key: '+', preventDefault() {} });
  assert.ok(big.style.transform.includes('scale(1.25)'));
  page.body.emit('keydown', { key: '-', preventDefault() {} });
  assert.ok(big.style.transform.includes('scale(1)'));
  page.body.emit('keydown', { key: '0', preventDefault() {} });
  assert.equal(big.style.transform, 'translate(0px, 0px) scale(1)');

  const wheel = { deltaY: -120, preventDefault() { this.prevented = true; } };
  big.emit('wheel', wheel);
  assert.equal(wheel.prevented, true);
  assert.ok(big.style.transform.includes('scale(1.25)'));

  big.emit('dblclick');
  assert.equal(big.style.transform, 'translate(0px, 0px) scale(1)');
});

test('draggingAZoomedImagePansItAndDraggingStopsOnPointerUp', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
  const big = page.imageInOverlay();
  big.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 80 });
  assert.notEqual(big.dataset.zoomDragging, 'true');
  page.button('lightbox-zoom-in').emit('click');
  big.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 80 });
  assert.equal(big.dataset.zoomDragging, 'true');
  big.emit('pointermove', { pointerId: 1, clientX: 130, clientY: 60 });
  assert.equal(big.style.transform, 'translate(30px, -20px) scale(1.25)');
  assert.equal(big.dataset.zoomPanned, 'true');
  big.emit('pointerup', { pointerId: 1 });
  assert.notEqual(big.dataset.zoomDragging, 'true');
  big.emit('pointermove', { pointerId: 1, clientX: 999, clientY: 999 });
  assert.equal(big.style.transform, 'translate(30px, -20px) scale(1.25)');
});

test('resettingZoomDropsThePanToo', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
  const big = page.imageInOverlay();
  page.button('lightbox-zoom-in').emit('click');
  big.emit('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  big.emit('pointermove', { pointerId: 1, clientX: 12, clientY: 9 });
  page.button('lightbox-zoom-reset').emit('click');
  assert.equal(big.style.transform, 'translate(0px, 0px) scale(1)');
  assert.equal(big.dataset.zoomPanned, '');
});

test('escapeAndBackgroundClickCloseTheOverlayAndGiveFocusBack', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
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
  page.chart.emit('click', clickEvent());
  const first = page.overlay();
  first.querySelector('button').emit('click');
  assert.equal(page.overlay(), null);
  page.chart.emit('click', clickEvent());
  assert.notEqual(page.overlay(), first);
});

test('openingAnotherImageStartsBackAtFit', async () => {
  const page = await run();
  page.chart.emit('click', clickEvent());
  page.button('lightbox-zoom-in').emit('click');
  page.button('lightbox-zoom-in').emit('click');
  page.svg.emit('click', clickEvent());
  assert.equal(page.imageInOverlay().style.transform, 'translate(0px, 0px) scale(1)');
});
