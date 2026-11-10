// 评测数据页的表格搜索：按关键词把不相关的行藏起来，命中数写在表格上方，查询词写进 URL 便于分享。
// 只做客户端筛选：表格里每一行的原报告链接不受影响，清空即回到完整数据集。
(() => {
  'use strict';

  const MIN_TERM_LENGTH = 2;

  function termsFor(query) {
    return (query ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length >= MIN_TERM_LENGTH);
  }

  function rowText(row) {
    return (row.textContent ?? '').replace(/\s+/g, ' ').toLowerCase();
  }

  function queryFromLocation(location) {
    return new URLSearchParams(location?.search ?? '').get('q') ?? '';
  }

  function setup(document, { location = window.location } = {}) {
    const form = document.querySelector('[data-bench-search]');
    const input = form?.querySelector('input[name="q"]');
    const status = document.querySelector('[data-bench-status]');
    const groups = [];
    for (const row of document.querySelectorAll('main [data-bench-table] tbody tr')) {
      const block = typeof row.closest === 'function' ? row.closest('[data-bench-table]') : null;
      if (!block) continue;
      let group = groups.find((entry) => entry.block === block);
      if (!group) {
        group = { block, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    }
    if (!form || !input || !status || !groups.length) return;

    const rows = groups.flatMap((group) => group.rows);
    const total = rows.length;

    function syncUrl(query) {
      const trimmed = query.trim();
      const params = new URLSearchParams(location.search ?? '');
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      const search = params.toString();
      const next = `${location.pathname ?? ''}${search ? `?${search}` : ''}`;
      window.history?.replaceState?.(null, '', next);
    }

    function showAll(query) {
      for (const row of rows) row.hidden = false;
      for (const group of groups) group.block.hidden = false;
      delete status.dataset.empty;
      status.textContent = query.trim()
        ? `「${query.trim()}」太短，至少两个字符才筛。共 ${total} 行。`
        : `共 ${total} 行。输入显卡、量化档位、引擎版本或数字即可筛选，点清空回到全部。`;
    }

    function apply(query) {
      const terms = termsFor(query);
      if (!terms.length) {
        showAll(query);
        return;
      }
      let hits = 0;
      let tables = 0;
      for (const group of groups) {
        let matched = 0;
        for (const row of group.rows) {
          const hit = terms.every((term) => rowText(row).includes(term));
          row.hidden = !hit;
          if (hit) matched += 1;
        }
        group.block.hidden = matched === 0;
        hits += matched;
        if (matched) tables += 1;
      }
      status.textContent = hits
        ? `命中 ${hits} 行（共 ${total} 行，分布在 ${tables} 张表里）。点清空回到全部。`
        : `没找到同时包含「${terms.join('、')}」的行（共 ${total} 行）。换个关键词，或点清空回到全部。`;
      status.dataset.empty = hits ? 'false' : 'true';
    }

    input.addEventListener('input', () => {
      syncUrl(input.value);
      apply(input.value);
    });
    form.addEventListener('submit', (event) => {
      event?.preventDefault?.();
      syncUrl(input.value);
      apply(input.value);
    });
    form.addEventListener('reset', (event) => {
      event?.preventDefault?.();
      input.value = '';
      syncUrl('');
      apply('');
    });

    const initial = queryFromLocation(location);
    input.value = initial;
    apply(initial);
  }

  if (typeof document !== 'undefined') setup(document);

  window.toolHubBench = { setup };
})();
