// 图片点击放大：正文配图、列表缩略图、评测图表都能点开，浮层里还能继续放大、缩小、拖动看细节。
// 零依赖，不改服务端渲染的 HTML。包着图片的链接一律拦下跳转，跳转交给标题链接和浮层里的「进入这篇文章」。
(() => {
  'use strict';

  const SELECTOR = 'main img';
  const KEYBOARD_LABEL_MIN = 3;
  const ZOOM_STEP = 1.25;
  const MIN_SCALE = 0.4;
  const MAX_SCALE = 6;
  const DIRECT_IMAGE_LINK = /\.(png|jpe?g|webp|avif|gif|bmp|tiff|svg)(\?[^"'\s]*)?$/i;

  function frame(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function wrappingLink(image) {
    return typeof image.closest === 'function' ? image.closest('a[href]') : null;
  }

  function hrefOf(node) {
    return String(node?.getAttribute?.('href') ?? '');
  }

  // 大图地址：显式 data-full 优先，其次包着图片的直链（上游常把缩略图链到原图），最后退回 <img src>。
  function fullSource(image) {
    const linked = hrefOf(wrappingLink(image));
    return image.dataset?.full || (DIRECT_IMAGE_LINK.test(linked) ? linked : '') || image.currentSrc || image.src || '';
  }

  function zoomable(image) {
    return Boolean(image) && Boolean(fullSource(image));
  }

  function captionFor(image) {
    const figure = typeof image.closest === 'function' ? image.closest('figure') : null;
    const caption = figure?.querySelector?.('figcaption');
    return (caption?.textContent ?? '').trim() || (image.alt ?? '').trim();
  }

  function labelFor(image) {
    return captionFor(image) || '放大这张图';
  }

  // 正文里的行内小图（论坛表情、徽章的 alt 只有一两个字符）只允许点开看，不给它们 tabindex，免得键盘要 tab 一堆碎图。
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
    let big = null;
    let pane = null;
    let scaleLabel = null;
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let drag = null;

    function percent() {
      return `${Math.round(scale * 100)}%`;
    }

    // 能拖多少 = 放大后的图片比窗口大出多少（窗口就是 .lightbox-viewport 那块被裁切的区域）。
    // 拖过这个边界窗口就会露出背景，图片看着像跑掉了；图片本身比窗口还小时这一维就不能拖。
    // 尺寸量不到（大图还没解码完、夹具没有布局）时不夹紧，也不据此判断能不能拖。
    function panLimits() {
      const imageWidth = Number(big?.offsetWidth);
      const imageHeight = Number(big?.offsetHeight);
      const windowWidth = Number(pane?.clientWidth);
      const windowHeight = Number(pane?.clientHeight);
      if (!(imageWidth > 0) || !(imageHeight > 0) || !(windowWidth > 0) || !(windowHeight > 0)) return null;
      return {
        x: Math.max(0, (imageWidth * scale - windowWidth) / 2),
        y: Math.max(0, (imageHeight * scale - windowHeight) / 2),
      };
    }

    function pannable() {
      const limits = panLimits();
      if (!limits) return scale > 1;
      return limits.x > 0 || limits.y > 0;
    }

    function apply() {
      if (!big) return;
      const { x: limitX, y: limitY } = panLimits() ?? { x: Infinity, y: Infinity };
      panX = Math.min(limitX, Math.max(-limitX, panX));
      panY = Math.min(limitY, Math.max(-limitY, panY));
      big.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      big.dataset.zoomScale = percent();
      big.dataset.zoomPanned = panX || panY ? 'true' : '';
      big.dataset.zoomPannable = pannable() ? 'true' : '';
      if (scaleLabel) {
        scaleLabel.textContent = pannable()
          ? `当前 ${percent()}，滚轮或 +/− 缩放，按住图片拖动看局部，双击回到适应屏幕`
          : `当前 ${percent()}，先放大（滚轮或 +/−），放大后才能按住图片拖动看局部`;
      }
    }

    function zoomBy(factor) {
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      if (scale === 1) {
        panX = 0;
        panY = 0;
      }
      apply();
    }

    function resetZoom() {
      scale = 1;
      panX = 0;
      panY = 0;
      apply();
    }

    function close() {
      if (!overlay) return;
      const hidden = overlay;
      overlay = null;
      big = null;
      scaleLabel = null;
      pane = null;
      drag = null;
      hidden.remove();
      delete document.body.dataset.lightbox;
      const back = owner;
      owner = null;
      back?.focus?.();
    }

    function control(className, text, onClick, label) {
      const button = frame('button', className, text);
      button.setAttribute('type', 'button');
      if (label) button.setAttribute('aria-label', label);
      button.addEventListener('click', onClick);
      return button;
    }

    function open(image) {
      if (overlay) close();
      owner = image;
      scale = 1;
      panX = 0;
      panY = 0;

      const caption = captionFor(image);
      const box = frame('div', 'lightbox');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', caption || '放大这张图');
      // 拖动过图片后不要再把遮罩上的那一次点击当成「点图片外面关闭」。
      let dragged = false;
      box.addEventListener('click', (event) => {
        if (dragged) {
          dragged = false;
          return;
        }
        if (event?.target === box) close();
      });

      const bar = frame('div', 'lightbox-bar');
      bar.append(
        control('lightbox-close', '关闭', close),
        control('lightbox-zoom-out', '缩小', () => zoomBy(1 / ZOOM_STEP), '缩小这张图'),
        control('lightbox-zoom-in', '放大', () => zoomBy(ZOOM_STEP), '放大这张图'),
        control('lightbox-zoom-reset', '适应屏幕', resetZoom, '回到适应屏幕'),
      );
      scaleLabel = frame('p', 'lightbox-scale');
      bar.append(scaleLabel);

      const figure = frame('figure', 'lightbox-frame');
      pane = frame('div', 'lightbox-viewport');
      big = frame('img', 'lightbox-image');
      big.setAttribute('src', fullSource(image));
      big.setAttribute('alt', image.alt ?? '');
      // <img> 默认是原生可拖拽对象：一按住就触发浏览器自己的「拖这张图」手势，pointermove 会被 pointercancel
      // 打断，平移就永远不会发生。所以先把原生拖拽关掉。
      big.setAttribute('draggable', 'false');
      pane.append(big);
      figure.append(pane);

      // 说明行：有说明文字就写文字，图片包着非原图链接时补一个跳转入口（文章页或原站）。
      const linked = hrefOf(wrappingLink(image));
      const jump = linked && !DIRECT_IMAGE_LINK.test(linked) ? linked : '';
      if (caption || jump) {
        const line = frame('figcaption', 'lightbox-caption');
        if (caption) line.textContent = caption;
        if (jump) {
          const internal = jump.startsWith('/');
          const goto = frame('a', 'lightbox-source', internal ? '进入这篇文章' : '查看原文');
          goto.href = jump;
          if (!internal) {
            goto.target = '_blank';
            goto.rel = 'noopener noreferrer';
          }
          line.append(goto);
        }
        figure.append(line);
      }

      box.append(bar, figure, frame('p', 'lightbox-hint', '按 Esc 或点图片外面关闭'));

      big.addEventListener('wheel', (event) => {
        event?.preventDefault?.();
        zoomBy((event?.deltaY ?? 0) < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      });
      big.addEventListener('dblclick', () => (scale === 1 ? zoomBy(ZOOM_STEP * ZOOM_STEP) : resetZoom()));
      big.addEventListener('load', apply);
      big.addEventListener('pointerdown', (event) => {
        if (!pannable()) return;
        event?.preventDefault?.();
        drag = { x: event?.clientX ?? 0, y: event?.clientY ?? 0, panX, panY };
        big.dataset.zoomDragging = 'true';
        big.setPointerCapture?.(event?.pointerId);
      });
      big.addEventListener('dragstart', (event) => event?.preventDefault?.());
      // 平移监听挂在浮层上而不是图片上：放大后图片的布局盒子还是原尺寸，鼠标一移出这个盒子
      // 图片就拿不到 pointermove 了，拖动会半途停住。
      box.addEventListener('pointermove', (event) => {
        if (!drag) return;
        panX = drag.panX + ((event?.clientX ?? 0) - drag.x);
        panY = drag.panY + ((event?.clientY ?? 0) - drag.y);
        dragged = true;
        apply();
      });
      const stopDrag = () => {
        drag = null;
        if (big) big.dataset.zoomDragging = '';
      };
      box.addEventListener('pointerup', stopDrag);
      box.addEventListener('pointercancel', stopDrag);

      document.body.append(box);
      document.body.dataset.lightbox = 'open';
      overlay = box;
      apply();
      big.focus?.();
    }

    for (const image of images) {
      const keyboard = focusable(image);
      image.dataset.zoom = 'true';
      // 图片外面的 <a> 会被这次点击一起拦下来，所以点缩略图是放大而不是跳转。
      image.addEventListener('click', (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        open(image);
      });
      if (!keyboard) continue;
      const label = labelFor(image);
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
      const key = String(event?.key ?? '');
      if (key === 'Escape') {
        close();
        return;
      }
      if (!overlay) return;
      if (key === '+' || key === '=') {
        event?.preventDefault?.();
        zoomBy(ZOOM_STEP);
      } else if (key === '-' || key === '_') {
        event?.preventDefault?.();
        zoomBy(1 / ZOOM_STEP);
      } else if (key === '0') {
        event?.preventDefault?.();
        resetZoom();
      }
    });
  }

  if (typeof document !== 'undefined') setup(document);

  window.toolHubLightbox = { setup };
})();
