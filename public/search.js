// 全站文章搜索：右下角悬浮按钮（或 Ctrl/⌘+K、斜杠）打开搜索浮层，查中文标题、原标题、来源、标签、摘要和正文。
// /search 页沿用同一份引擎：服务端渲染的表单和结果区照旧，查询词写进 ?q=，筛选结果可以直接分享。
// 索引来自 /data/items.json（src/lib/items.mjs 的 itemsIndex），第一次搜索时才拉，之后复用。
(() => {
  'use strict';

  const MIN_QUERY_LENGTH = 2;
  const MAX_HITS = 30;
  const SNIPPET_RADIUS = 48;
  const PLACEHOLDER = '搜索文章：显卡、量化、免费、本地…';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function termsFor(query) {
    return (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  // 字段权重：命中标题比命中正文更能说明这篇就是你要找的。
  const FIELDS = [
    { name: 'title', weight: 4 },
    { name: 'originalTitle', weight: 3 },
    { name: 'tags', weight: 2 },
    { name: 'source', weight: 2 },
    { name: 'summary', weight: 1 },
    { name: 'text', weight: 1 },
  ];

  function fieldsOf(item) {
    return FIELDS.map((field) => ({
      name: field.name,
      weight: field.weight,
      text: String(item?.[field.name] ?? '').toLowerCase(),
    }));
  }

  function searchItems(query, items) {
    const terms = termsFor(query);
    if (!terms.length) return { terms, hits: [] };
    const hits = [];
    for (const item of items) {
      const fields = fieldsOf(item);
      let matched = 0;
      let score = 0;
      for (const term of terms) {
        let weight = 0;
        for (const field of fields) {
          if (field.text.includes(term)) weight += field.weight;
        }
        if (!weight) continue;
        matched += 1;
        score += weight;
      }
      if (!matched) continue;
      hits.push({ item, matched, score });
    }
    hits.sort((a, b) => b.matched - a.matched
      || b.score - a.score
      || String(b.item.published ?? b.item.day ?? '').localeCompare(String(a.item.published ?? a.item.day ?? '')));
    return { terms, hits: hits.slice(0, MAX_HITS) };
  }

  // 摘要先命中就用摘要，摘要没有再看正文，两处都没有就不给片段（只留标题命中）。
  function snippetFor(item, terms) {
    for (const field of ['summary', 'text']) {
      const text = String(item?.[field] ?? '');
      if (!text) continue;
      const lower = text.toLowerCase();
      for (const term of terms) {
        const at = lower.indexOf(term);
        if (at < 0) continue;
        const from = Math.max(0, at - SNIPPET_RADIUS);
        const to = Math.min(text.length, at + term.length + SNIPPET_RADIUS);
        return {
          text: text.slice(from, to),
          at: at - from,
          length: term.length,
          prefix: from > 0,
          suffix: to < text.length,
        };
      }
    }
    return null;
  }

  function appendSnippet(target, snippet) {
    if (!snippet || typeof document.createTextNode !== 'function') return;
    const line = el('p', 'story-snippet');
    line.append(document.createTextNode(`${snippet.prefix ? '…' : ''}${snippet.text.slice(0, snippet.at)}`));
    line.append(el('mark', '', snippet.text.slice(snippet.at, snippet.at + snippet.length)));
    line.append(document.createTextNode(`${snippet.text.slice(snippet.at + snippet.length)}${snippet.suffix ? '…' : ''}`));
    target.append(line);
  }

  function hitNode(hit, terms, tagLabels) {
    const { item } = hit;
    const row = el('li', 'story');
    const body = el('div', 'story-body');
    const heading = el('h2', 'story-title');
    const link = el('a', '', item.title ?? item.originalTitle ?? '未命名条目');
    link.href = `/item/${item.slug}`;
    heading.append(link);
    body.append(heading);
    if (item.originalTitle) body.append(el('p', 'story-original', item.originalTitle));
    appendSnippet(body, snippetFor(item, terms));
    const meta = el('p', 'subtext');
    meta.append(el('span', 'source', item.source ?? ''));
    meta.append(el('span', 'chip day', item.day ?? ''));
    for (const tag of (item.tags ?? []).slice(0, 3)) {
      const chip = el('a', 'chip tag', tagLabels[tag] ?? tag);
      chip.href = `/t/${tag}`;
      meta.append(chip);
    }
    const original = el('a', 'original-link', '原文');
    original.href = item.url;
    original.target = '_blank';
    original.rel = 'noopener noreferrer';
    meta.append(original);
    body.append(meta);
    row.append(body);
    return row;
  }

  function setup(document, { location = window.location } = {}) {
    const inline = document.querySelector('[data-search]');
    const inlineForm = inline?.querySelector('[data-search-form]') ?? null;
    const inlineInput = inlineForm ? inlineForm.querySelector('input') : null;
    const inlineStatus = inline?.querySelector('[data-search-status]') ?? null;
    const inlineResults = inline?.querySelector('[data-search-results]') ?? null;
    let tagLabels = {};
    try {
      tagLabels = JSON.parse(inline?.dataset.tagLabels ?? '{}');
    } catch {
      tagLabels = {};
    }

    let indexPromise = null;
    const loadIndex = () => {
      if (!indexPromise) {
        indexPromise = fetch('/data/items.json', { credentials: 'same-origin' })
          .then((response) => {
            if (!response.ok) throw new Error(`索引拉取失败（HTTP ${response.status}）`);
            return response.json();
          })
          .then((payload) => Object.entries(payload ?? {}).map(([slug, entry]) => ({ slug, ...entry })))
          .catch(() => null);
      }
      return indexPromise;
    };

    function syncUrl(query) {
      if (!inline) return;
      const params = new URLSearchParams(location?.search ?? '');
      if (query.trim()) params.set('q', query.trim());
      else params.delete('q');
      const search = params.toString();
      window.history?.replaceState?.(null, '', `${location?.pathname ?? ''}${search ? `?${search}` : ''}`);
    }

    async function render(query, status, results) {
      const trimmed = String(query ?? '').trim();
      results.textContent = '';
      const items = await loadIndex();
      if (!items) {
        status.textContent = '搜索暂时不可用：索引没取到，刷新页面再试。';
        status.dataset.empty = 'true';
        return;
      }
      if (trimmed.length < MIN_QUERY_LENGTH) {
        status.textContent = `共收录 ${items.length} 篇文章。输入至少两个字符开始搜索，标题、摘要和正文都会查。`;
        delete status.dataset.empty;
        return;
      }
      const { terms, hits } = searchItems(trimmed, items);
      if (!hits.length) {
        status.textContent = `没找到同时包含「${terms.join('、')}」的文章（共 ${items.length} 篇）。换个关键词，或者只留其中两个词。`;
        status.dataset.empty = 'true';
        return;
      }
      const matchedAll = hits.filter((hit) => hit.matched === terms.length).length;
      const tail = terms.length > 1 ? `，其中 ${matchedAll} 篇每个词都命中` : '';
      status.textContent = `命中 ${hits.length} 篇（共 ${items.length} 篇${tail}）。`
        + (hits.length === MAX_HITS ? ' 还有更多，加个关键词缩小范围。' : '');
      delete status.dataset.empty;
      for (const hit of hits) results.append(hitNode(hit, terms, tagLabels));
    }

    let overlay = null;
    let overlayInput = null;

    function ensureOverlay() {
      if (overlay) return overlay;
      const box = el('div', 'search-overlay');
      box.dataset.searchOverlay = '';
      const panel = el('div', 'search-panel');
      const close = el('button', 'search-close', '关闭');
      close.type = 'button';
      const form = el('form', 'search-box');
      form.dataset.searchForm = '';
      const input = el('input', 'search-input');
      input.type = 'search';
      input.name = 'q';
      input.placeholder = PLACEHOLDER;
      const submit = el('button', '', '搜索');
      submit.type = 'submit';
      const clear = el('button', '', '清空');
      clear.type = 'reset';
      form.append(input, submit, clear);
      const status = el('p', 'search-status');
      status.dataset.searchStatus = '';
      const results = el('ol', 'stories');
      results.dataset.searchResults = '';
      const hint = el('p', 'search-hint', '按 Esc 关闭，或点浮层外面关闭。');
      panel.append(close, form, status, results, hint);
      box.append(panel);

      close.addEventListener('click', closeSearch);
      box.addEventListener('click', (event) => {
        if (!event || event.target === box) closeSearch();
      });
      form.addEventListener('submit', (event) => {
        event?.preventDefault?.();
        render(input.value, status, results);
      });
      form.addEventListener('reset', (event) => {
        event?.preventDefault?.();
        input.value = '';
        render('', status, results);
      });
      input.addEventListener('input', () => render(input.value, status, results));

      document.body.append(box);
      overlay = box;
      overlayInput = input;
      render('', status, results);
      return box;
    }

    function openSearch(seed) {
      const box = ensureOverlay();
      box.hidden = false;
      document.body.dataset.search = 'open';
      if (seed !== undefined && overlayInput) overlayInput.value = seed;
      overlayInput?.focus?.();
    }

    function closeSearch() {
      if (!overlay) return;
      overlay.hidden = true;
      delete document.body.dataset.search;
    }

    const fab = el('button', 'search-fab', '搜索文章');
    fab.type = 'button';
    fab.dataset.searchFab = '';
    fab.addEventListener('click', () => {
      if (inlineInput) {
        inlineInput.focus?.();
        inlineInput.scrollIntoView?.();
        return;
      }
      openSearch();
    });
    document.body.append(fab);

    document.addEventListener('keydown', (event) => {
      const key = String(event?.key ?? '');
      if (key === 'Escape') {
        closeSearch();
        return;
      }
      if ((key === 'k' || key === 'K') && (event?.ctrlKey || event?.metaKey)) {
        event?.preventDefault?.();
        if (inlineInput) inlineInput.focus?.();
        else openSearch();
        return;
      }
      if (key === '/' && !isTyping(event?.target)) {
        event?.preventDefault?.();
        if (inlineInput) inlineInput.focus?.();
        else openSearch();
      }
    });

    if (inlineForm && inlineInput && inlineStatus && inlineResults) {
      const run = (query) => render(query, inlineStatus, inlineResults);
      inlineForm.addEventListener('submit', (event) => {
        event?.preventDefault?.();
        syncUrl(inlineInput.value);
        run(inlineInput.value);
      });
      inlineInput.addEventListener('input', () => {
        syncUrl(inlineInput.value);
        run(inlineInput.value);
      });
      const preset = new URLSearchParams(location?.search ?? '').get('q') ?? '';
      inlineInput.value = preset;
      syncUrl(preset);
      run(preset);
    }
  }

  function isTyping(target) {
    const tag = String(target?.tagName ?? '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
  }

  if (typeof document !== 'undefined') setup(document);

  window.toolHubSearch = { setup, searchItems };
})();
