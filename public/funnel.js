// 首页漏斗读数一次性数到位；用户要求减少动效时直接显示终值。
(() => {
  'use strict';

  const format = (value) => String(value).replace(/\B(?=(\d{3})+$)/g, ',');

  function main() {
    const nodes = [...document.querySelectorAll('[data-count-to]')];
    if (!nodes.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const steps = nodes.map((node) => ({ node, value: Number(node.dataset.countTo) }));
    if (steps.some((step) => !Number.isFinite(step.value))) return;

    const duration = 750;
    const startedAt = performance.now();
    const frame = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      for (const { node, value } of steps) node.textContent = format(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  main();
})();
