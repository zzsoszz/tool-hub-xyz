import assert from 'node:assert/strict';
import test from 'node:test';
import { Node, runBrowserScript } from './dom-fixture.mjs';

// 评测数据页的服务端渲染结果：一个搜索框、一行状态文字、两张带 data-bench-table 的表。
function buildBenchPage() {
  const body = new Node('body');
  const main = new Node('main');
  const section = new Node('section', { class: 'bench-data' });
  const form = new Node('form', { class: 'bench-search' });
  form.dataset.benchSearch = '';
  const input = new Node('input', { name: 'q', type: 'search' });
  const submit = new Node('button', { type: 'submit' });
  const clear = new Node('button', { type: 'reset' });
  clear.dataset.benchClear = '';
  form.append(input, submit, clear);
  const status = new Node('p', { class: 'bench-search-status' });
  status.dataset.benchStatus = '';
  section.append(form, status);

  const makeTable = (rows) => {
    const block = new Node('div');
    block.dataset.benchTable = '';
    const table = new Node('table', { class: 'bench-table' });
    const tbody = new Node('tbody');
    for (const text of rows) tbody.append(new Node('tr', { text }));
    table.append(tbody);
    block.append(table);
    section.append(block);
    return { block, rows: [...tbody.children] };
  };
  const output = makeTable([
    'RTX 5090 笔记本 24 GB Q2_0 0.1.40.3 144 tok/s',
    'Radeon Pro VII 16 GB IQ2_XS 0.1.31 24 tok/s',
  ]);
  const matrix = makeTable([
    'RTX 5090 24 GB Q2_0 0.1.26 2,171 tok/s',
    'Tesla P4 8 GB Q2_0 0.1.14 1,208 tok/s',
  ]);
  main.append(section);
  body.append(main);
  return { body, input, form, status, output, matrix, visible: (row) => row.hidden !== true };
}

async function run(search = '') {
  const page = buildBenchPage();
  const { window } = await runBrowserScript('bench.js', page.body, { pathname: '/bench/strata-community', search });
  return { ...page, window };
}

function type(page, value) {
  page.input.value = value;
  page.input.emit('input');
}

test('showsEveryRowAndExplainsTheFilterBeforeAnyQuery', async () => {
  const page = await run();
  assert.equal(page.input.value, '');
  assert.match(page.status.textContent, /共 4 行/);
  assert.ok(page.visible(page.output.rows[0]));
  assert.ok(page.visible(page.matrix.rows[1]));
  assert.equal(page.output.block.hidden, false);
});

test('hidesRowsThatDoNotMatchAndReportsTheHitCount', async () => {
  const page = await run();
  type(page, '5090');
  assert.ok(page.visible(page.output.rows[0]));
  assert.equal(page.output.rows[1].hidden, true);
  assert.ok(page.visible(page.matrix.rows[0]));
  assert.equal(page.matrix.rows[1].hidden, true);
  assert.match(page.status.textContent, /命中 2 行（共 4 行，分布在 2 张表里）/);
  assert.equal(page.window.location.search, '?q=5090');
});

test('hidesWholeTablesThatHaveNoMatchingRow', async () => {
  const page = await run();
  type(page, 'tesla p4');
  assert.equal(page.output.block.hidden, true);
  assert.equal(page.matrix.block.hidden, false);
  assert.match(page.status.textContent, /命中 1 行/);
});

test('saysSoWhenNothingMatchesAndKeepsTheQueryInTheUrl', async () => {
  const page = await run();
  type(page, '不存在的东西');
  assert.equal(page.output.block.hidden, true);
  assert.equal(page.matrix.block.hidden, true);
  assert.match(page.status.textContent, /没找到同时包含「不存在的东西」的行/);
  assert.equal(page.status.dataset.empty, 'true');
  assert.equal(page.window.location.search, '?q=%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E4%B8%9C%E8%A5%BF');
});

test('ignoresTermsShorterThanTwoCharacters', async () => {
  const page = await run();
  type(page, '5');
  assert.ok(page.visible(page.output.rows[1]));
  assert.match(page.status.textContent, /太短/);
});

test('clearButtonRestoresTheFullDatasetAndDropsTheQuery', async () => {
  const page = await run();
  type(page, '5090');
  let cleared = false;
  page.form.emit('reset', { preventDefault: () => { cleared = true; } });
  assert.equal(cleared, true);
  assert.equal(page.input.value, '');
  assert.ok(page.visible(page.output.rows[1]));
  assert.equal(page.matrix.block.hidden, false);
  assert.equal(page.window.location.search, '');
});

test('submitKeepsTheFilterWithoutReloadingThePage', async () => {
  const page = await run();
  page.input.value = 'IQ2_XS';
  let prevented = false;
  page.form.emit('submit', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(page.output.rows[1].hidden, false);
  assert.equal(page.matrix.block.hidden, true);
  assert.equal(page.window.location.search, '?q=IQ2_XS');
});

test('appliesTheFilterCarriedByTheUrlWhenThePageLoads', async () => {
  const page = await run('?q=0.1.14');
  assert.equal(page.input.value, '0.1.14');
  assert.ok(page.visible(page.matrix.rows[1]));
  assert.equal(page.matrix.rows[0].hidden, true);
  assert.equal(page.output.block.hidden, true);
  assert.match(page.status.textContent, /命中 1 行/);
});
