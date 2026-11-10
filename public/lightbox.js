// 图片点击放大：正文配图和评测图表点开看大图。零依赖，不改服务端渲染的 HTML。
// 列表缩略图本身是进条目页的链接，所以带 <a> 祖先的图片一律不接管点击。
(() => {
  'use strict';

  const SELECTOR = 'main img';
  const KEYBOARD_LABEL_MIN = 3;

  function zoomable(image) {
    if (!image || image.classList?.contains('story-thumb')) return false;
    if (typeof image.closest === 'function' && image.closest('a')) return false;
    return Boolean(fullSource(image));
  }

  function fullSource(image) {
    return image.dataset?.full || image.currentSrc || image.src;
  }

  function captionFor(image) {
    const figure = typeof image.closest === 'function' ? image.closest('figure') : null;
    const caption = figure?.querySelector?.('figcaption');
    return (caption?.textContent ?? '').trim() || (image.alt ?? '').trim();
  }

  // 正文里的行内小图（论坛表情、徽章的 alt 只有一两个字符）只允许点开看，不给它们加 tabindex，免得键盘要 tab 一堆碎图。
  function focusable(image) {
    if (typeof image.closest === 'function' && image.closest('figure')) return true;
    if (image.dataset?.zoom !== undefined) return true;
    return (image.alt ?? '').trim().length >= KEYBOARD_LABEL_MIN;
  }

  function setup(document) {
    const images = [...document.querySelectorAll(SELECTOR)].filter(zoomable);
    if (!images.length) return;

    let overlay = null;
    let owner = null;

    const frame = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    function close() {
      if (!overlay) return;
      const hidden = overlay;
      overlay = null;
      hidden.remove();
      delete document.body.dataset.lightbox;
      const back = owner;
      owner = null;
      back?.focus?.();
    }

    function open(image) {
      if (overlay) close();
      owner = image;
      const caption = captionFor(image);
      const box = frame('div', 'lightbox');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', caption || '放大这张图');

      const button = frame('button', 'lightbox-close', '关闭');
      button.setAttribute('type', 'button');
      button.addEventListener('click', close);

      const figure = frame('figure', 'lightbox-frame');
      const big = frame('img', 'lightbox-image');
      big.setAttribute('src', fullSource(image));
      big.setAttribute('alt', image.alt ?? '');
      figure.append(big);
      if (caption) figure.append(frame('figcaption', 'lightbox-caption', caption));

      box.append(button, figure, frame('p', 'lightbox-hint', '按 Esc 或点图片外面关闭'));
      box.addEventListener('click', (event) => {
        if (event?.target === box) close();
      });

      document.body.append(box);
      document.body.dataset.lightbox = 'open';
      overlay = box;
      button.focus?.();
    }

    for (const image of images) {
      const keyboard = focusable(image);
      image.dataset.zoom = 'true';
      image.addEventListener('click', () => open(image));
      if (!keyboard) continue;
      const label = captionFor(image) || '放大这张图';
      image.setAttribute('role', 'button');
      image.setAttribute('tabindex', '0');
      image.setAttribute('aria-label', label);
      image.addEventListener('keydown', (event) => {
        if (event?.key !== 'Enter' && event?.key !== ' ') return;
        event.preventDefault?.();
        open(image);
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event?.key === 'Escape') close();
    });
  }

  if (typeof document !== 'undefined') setup(document);

  window.toolHubLightbox = { setup };
})();
