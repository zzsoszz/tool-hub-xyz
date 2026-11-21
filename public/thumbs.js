// 列表配图是尽力而为：正文里有图才开这个位置，图取不到就把整块配图撤掉，那一行退回纯文字。
// 构建不联网，外链也可能失效——上游删图、防盗链拒绝热链——列表不该顶着一块破图。
(() => {
  'use strict';

  const SELECTOR = 'figure.story-thumb img';

  function drop(image) {
    const figure = typeof image.closest === 'function' ? image.closest('figure') : null;
    (figure ?? image).remove();
  }

  function setup(document) {
    for (const image of document.querySelectorAll(SELECTOR)) {
      if (image.complete && image.naturalWidth === 0) {
        drop(image);
        continue;
      }
      image.addEventListener('error', () => drop(image));
    }
  }

  if (typeof document !== 'undefined') setup(document);

  window.toolHubThumbs = { setup };
})();
