// 列表页的年月筛选与排序：对页面里已有的条目行做隐藏/重排，状态写进 URL 便于分享。
// 排序与筛选规则来自 /listview.mjs，和构建期生成页面时用的是同一份。
import { matchesPeriod, sortEntries, sortMode, sortModes } from '/listview.mjs';

const form = document.querySelector('form.filters');
const list = form?.querySelector('ol.stories') ?? document.querySelector('main ol.stories');
const rows = list ? [...list.querySelectorAll('li.story')] : [];
if (!form || !list || !rows.length) {
  // 没有列表就没有可筛选的内容，直接退出。
} else {
  const monthSelect = form.querySelector('[data-filter-month]');
  const yearSelect = form.querySelector('[data-filter-year]');
  const sortSelect = form.querySelector('[data-sort-mode]');
  const countNode = form.querySelector('[data-filter-count]');
  const hintNode = form.querySelector('[data-sort-hint]');
  const emptyNote = document.createElement('p');
  emptyNote.className = 'empty';
  emptyNote.textContent = '这段时间没有条目，换一个月份或改回全部月份。';

  const rowsBySlug = new Map(rows.map((row) => [row.dataset.slug, row]));
  const entries = rows.map((row) => ({
    slug: row.dataset.slug ?? '',
    month: row.dataset.month ?? '',
    rank: Number(row.dataset.rank ?? 0),
    quality: Number(row.dataset.quality ?? 0),
    score: Number(row.dataset.score ?? 0),
    published: row.dataset.published ?? '',
  }));

  const query = new URLSearchParams(window.location.search);
  const wantsMonth = query.get('month') ?? '';
  const wantsYear = query.get('year') ?? '';
  if (monthSelect && [...monthSelect.options].some((option) => option.value === wantsMonth)) monthSelect.value = wantsMonth;
  if (yearSelect && [...yearSelect.options].some((option) => option.value === wantsYear)) yearSelect.value = wantsYear;
  if (sortSelect) sortSelect.value = sortMode(query.get('sort'));

  const value = (select) => (select ? select.value : '');

  function apply() {
    const month = value(monthSelect);
    const year = value(yearSelect);
    const mode = sortMode(value(sortSelect));
    const visible = sortEntries(entries.filter((entry) => matchesPeriod(entry, { month, year })), mode);
    const visibleSlugs = new Set(visible.map((entry) => entry.slug));
    for (const entry of [...visible, ...entries.filter((entry) => !visibleSlugs.has(entry.slug))]) {
      const row = rowsBySlug.get(entry.slug);
      if (!row) continue;
      row.hidden = !visibleSlugs.has(entry.slug);
      list.append(row);
    }
    if (countNode) countNode.textContent = String(visible.length);
    if (hintNode) hintNode.textContent = sortModes[mode].hint;
    if (visible.length) emptyNote.remove();
    else list.after(emptyNote);

    const next = new URLSearchParams(window.location.search);
    if (month) next.set('month', month);
    else next.delete('month');
    if (year) next.set('year', year);
    else next.delete('year');
    if (mode !== 'quality') next.set('sort', mode);
    else next.delete('sort');
    const search = next.toString();
    window.history.replaceState(null, '', search ? `${window.location.pathname}?${search}` : window.location.pathname);
  }

  for (const select of [monthSelect, yearSelect, sortSelect]) {
    if (select) select.addEventListener('change', apply);
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply();
  });
  apply();
}
