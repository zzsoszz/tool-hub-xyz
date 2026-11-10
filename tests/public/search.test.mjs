import assert from 'node:assert/strict';
import test from 'node:test';
import { Node, runBrowserScript } from './dom-fixture.mjs';

// 文章搜索：/data/items.json 的索引由夹具冒充，脚本本身照旧在最小 DOM 上真跑一遍。
const INDEX = {
  'a1b2c3d4e5f6': {
    title: '双卡 7900XTX 跑视频生成',
    originalTitle: 'Two 7900XTX for video generation',
    url: 'https://lcz.me/topic/1',
    source: '抡锤者 AI 音视频画图',
    day: '2026-11-09',
    category: 'hardware',
    tags: ['benchmark', 'gpu'],
    summary: '两张卡的显存都不够，作者把出片拆成两段跑。',
    text: '正文里写到 ollama 只是顺手一提，重点是显存拆分与量化档位。',
    published: '2026-11-05T07:30:00Z',
  },
  'f6e5d4c3b2a1': {
    title: '本地模型省钱清单',
    url: 'https://example.com/ollama',
    source: '量子位',
    day: '2026-11-10',
    category: 'apps',
    tags: ['free'],
    summary: '免费替代方案：ollama 加本地部署，16G 显存够用。',
    text: '第一段讲安装，第二段讲量化。',
    published: '2026-11-09T02:00:00Z',
  },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const fetchIndex = async () => ({ ok: true, json: async () => INDEX });

function plainPage() {
  const body = new Node('body');
  const main = new Node('main');
  main.append(new Node('h1', { text: 'AI 日报' }));
  body.append(main);
  return { body, main };
}

function searchPage() {
  const body = new Node('body');
  const main = new Node('main');
  const wrap = new Node('section', { class: 'search', dataset: { search: '', tagLabels: '{"benchmark":"评测","gpu":"显卡"}' } });
  const form = new Node('form', { dataset: { searchForm: '' } });
  const input = new Node('input', { name: 'q', type: 'search' });
  form.append(input, new Node('button', { type: 'submit' }));
  const status = new Node('p', { class: 'search-status', dataset: { searchStatus: '' } });
  const results = new Node('ol', { class: 'stories', dataset: { searchResults: '' } });
  wrap.append(form, status, results);
  main.append(wrap);
  body.append(main);
  return { body, input, form, status, results };
}

async function openOverlay(page) {
  const fab = page.body.querySelector('[data-search-fab]');
  fab.emit('click', { target: fab });
  const overlay = page.body.querySelector('[data-search-overlay]');
  const input = overlay.querySelector('input');
  const status = overlay.querySelector('[data-search-status]');
  const results = overlay.querySelector('[data-search-results]');
  return { fab, overlay, input, status, results };
}

async function type(input, value) {
  input.value = value;
  input.emit('input');
  await settle();
}

function hits(results) {
  return results.children.filter((node) => node.tagName === 'li');
}

test('addsAFloatingButtonWithoutOpeningAnyOverlayFirst', async () => {
  const page = plainPage();
  await runBrowserScript('search.js', page.body, { fetchImpl: fetchIndex });
  assert.ok(page.body.querySelector('[data-search-fab]'), '页面里应有悬浮搜索按钮');
  assert.equal(page.body.querySelector('[data-search-overlay]'), null, '没点按钮不该出现浮层');
  assert.equal(page.main.children.length, 1, '按钮只挂在 body 末尾，不动正文');
});

test('floatingButtonOpensACentredOverlayThatSearchesSummaryAndBody', async () => {
  const page = plainPage();
  await runBrowserScript('search.js', page.body, { fetchImpl: fetchIndex });
  const { overlay, input, status, results } = await openOverlay(page);
  assert.equal(overlay.hidden, false);
  assert.equal(page.body.dataset.search, 'open');
  await settle();
  assert.match(status.textContent, /共收录 2 篇文章/);

  await type(input, 'ollama');
  const rows = hits(results);
  assert.equal(rows.length, 2, '摘要与正文都算命中');
  assert.equal(rows[0].querySelector('a').href, '/item/f6e5d4c3b2a1', '同样命中时按发布时间新到旧');
  assert.match(rows[0].querySelector('mark').textContent, /ollama/i);
  assert.match(status.textContent, /命中 2 篇（共 2 篇）/);

  await type(input, '视频 量化');
  const ranked = hits(results);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].querySelector('a').href, '/item/a1b2c3d4e5f6', '两个词都命中的排在前面');
  assert.match(status.textContent, /其中 1 篇每个词都命中/);
});

test('closingTheOverlayComesBackToThePage', async () => {
  const page = plainPage();
  await runBrowserScript('search.js', page.body, { fetchImpl: fetchIndex });
  const { overlay } = await openOverlay(page);
  assert.equal(overlay.hidden, false);
  page.body.emit('keydown', { key: 'Escape' });
  assert.equal(overlay.hidden, true);
  assert.equal(page.body.dataset.search, undefined);
});

test('searchPageKeepsItsOwnFormAndPutsTheQueryInTheUrl', async () => {
  const page = searchPage();
  const { window } = await runBrowserScript('search.js', page.body, {
    pathname: '/search',
    search: '?q=benchmark',
    fetchImpl: fetchIndex,
  });
  await settle();
  assert.equal(page.input.value, 'benchmark');
  assert.equal(hits(page.results).length, 1);
  assert.match(window.location.search, /q=benchmark/);
  const chips = page.results.querySelectorAll('a.chip.tag').map((chip) => chip.textContent);
  assert.ok(chips.includes('评测'), '标签要换成中文说法');

  const fab = page.body.querySelector('[data-search-fab]');
  fab.emit('click', { target: fab });
  assert.equal(page.body.querySelector('[data-search-overlay]'), null, '本页已有搜索框，按钮只负责聚焦');
  assert.equal(page.input.focused, true);
});

test('saysSoWhenNoArticleMatchesTheQuery', async () => {
  const page = plainPage();
  await runBrowserScript('search.js', page.body, { fetchImpl: fetchIndex });
  const { input, status, results } = await openOverlay(page);
  await settle();
  await type(input, '不存在的关键词');
  assert.equal(hits(results).length, 0);
  assert.equal(status.dataset.empty, 'true');
  assert.match(status.textContent, /没找到同时包含/);
});
