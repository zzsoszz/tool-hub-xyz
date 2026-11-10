import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  barChartSvg,
  buildCommunityTables,
  communitySortValue,
  communityStats,
  datasetChartItems,
  formatNumber,
  formatPrice,
  mergeSpeedMatrices,
  parseCommunityRows,
  parseNumberSeries,
  parseOpenRouterModels,
  parseSpeedMatrices,
  translateSetup,
  prUrl,
  readmeUrl,
  sha256,
  speedTableRows,
  translateFragment,
} from '../../src/lib/bench.mjs';

const fixture = async (name) => readFile(path.join(import.meta.dirname, '../fixtures', name), 'utf8');
const jsonFixture = async (name) => JSON.parse(await fixture(name));

const COMMIT = '504b143342a9fe1aa8320a7b31e11f5c0ac265c3';

test('acceptsOnlyCellsThatArePureNumberSeries', () => {
  assert.deepEqual(parseNumberSeries('1,428 / 2,454 / 2,785'), [1428, 2454, 2785]);
  assert.deepEqual(parseNumberSeries('198.9 / 190.6'), [198.9, 190.6]);
  assert.deepEqual(parseNumberSeries('~2,110 / 3,804'), [2110, 3804]);
  assert.equal(parseNumberSeries('16-34 to 17-65'), null);
  assert.equal(parseNumberSeries('see README'), null);
  assert.equal(parseNumberSeries('198.9 / 190.6 (same runs)'), null);
  assert.equal(parseNumberSeries('1,428'), null);
});

test('keepsExplainingWordsInsideCellsInChinese', () => {
  assert.equal(translateFragment('RTX 4070 Ti SUPER 16 GB (docker)'), 'RTX 4070 Ti SUPER 16 GB （容器内）');
  assert.equal(translateFragment('see README'), '数字见原报告');
  assert.equal(translateFragment('layer split, code prompts'), '跨卡分层, 代码提示词');
});

test('readsCommunityRowsEvenWhenNotesSplitTheTable', async () => {
  const rows = parseCommunityRows(await fixture('strata-community.md'));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((row) => row.folder), [
    '2026-10-01-community-2x-rtx-pro-4500',
    '2026-10-02-community-2x-rtx-pro-4500-engine-0.1.36',
    '2026-10-01-community-rtx-pro-4500',
    '2026-10-01-ctx-ladder',
    '2026-10-01-community-2x-titan-rtx',
  ]);
  assert.deepEqual(rows[0].prompt, [1428, 2454, 2785]);
  assert.deepEqual(rows[0].output, [115, 120, 93]);
  assert.equal(rows[2].prompt, null);
  assert.equal(rows[2].output, null);
  assert.equal(rows[3].output, null);
  assert.equal(rows[0].prUrl, 'https://github.com/Niko1221/Strata/pull/418');
});

test('putsRowsWithoutCleanNumbersIntoTheOtherReportsList', async () => {
  const tables = buildCommunityTables(parseCommunityRows(await fixture('strata-community.md')));
  assert.deepEqual(tables.output.map((row) => row.folder), [
    '2026-10-02-community-2x-rtx-pro-4500-engine-0.1.36',
    '2026-10-01-community-2x-rtx-pro-4500',
    '2026-10-01-community-2x-titan-rtx',
  ]);
  assert.deepEqual(tables.others.map((row) => row.folder), ['2026-10-01-community-rtx-pro-4500', '2026-10-01-ctx-ladder']);
  assert.ok(tables.others[0].note.includes('数字见原报告'));
  assert.equal(tables.others[1].engine, '数字见原报告');
  assert.equal(tables.others[1].hardware, 'RTX 4070 Ti SUPER 16 GB （容器内）');
});

test('summarizesCommunityRowsWithMedianAndExtremes', async () => {
  const tables = buildCommunityTables(parseCommunityRows(await fixture('strata-community.md')));
  const stats = communityStats(tables);
  assert.equal(stats.outputRows, 3);
  assert.equal(stats.promptRows, 3);
  assert.equal(stats.otherRows, 2);
  assert.equal(stats.medianOutput, 120);
  assert.equal(stats.fastestOutput, 130);
  assert.equal(stats.slowestOutput, 60);
  assert.equal(stats.medianPrompt, 2454);
  assert.equal(stats.fastestPrompt, 5065);
});

test('sortsCommunityRowsByTheMiddleSegmentOfTheSeries', () => {
  assert.equal(communitySortValue([115, 120, 93]), 120);
  assert.equal(communitySortValue([131, 144]), 144);
  assert.equal(communitySortValue(null), null);
});

test('linksEachCommunityRowBackToThatReportsReadme', () => {
  assert.equal(
    readmeUrl('2026-10-01-ctx-ladder', COMMIT),
    'https://github.com/Niko1221/Strata/blob/504b143342a9fe1aa8320a7b31e11f5c0ac265c3/bench/results/2026-10-01-ctx-ladder/README.md',
  );
  assert.equal(prUrl('#995'), 'https://github.com/Niko1221/Strata/pull/995');
  assert.equal(prUrl('无编号'), null);
});

test('readsSpeedMatrixCellsByTheirContextLabels', async () => {
  const tables = parseSpeedMatrices(await fixture('strata-matrix.md'));
  assert.deepEqual(tables.map((table) => table.heading), ['Prompt processing (tok/s)', 'Output (tok/s)']);
  const entries = mergeSpeedMatrices([{ engine: '0.1.14', markdown: await fixture('strata-matrix.md') }]);
  const q2 = entries.find((entry) => entry.model === 'Q2_0');
  assert.equal(q2.prompt['32K'], 1308);
  assert.equal(q2.prompt['128K'], 1208);
  assert.equal(q2.output['4K'], 90.3);
  assert.equal(q2.prompt['262K'], 967);
  assert.equal(q2.output['262K'], 60.3);
  assert.equal(entries.find((entry) => entry.model === 'IQ3_XXS').output['262K'], undefined);
});

test('buildsMatrixTableRowsForTheContextsThePageShows', async () => {
  const entries = mergeSpeedMatrices([{ engine: '0.1.14', markdown: await fixture('strata-matrix.md') }]);
  const rows = speedTableRows(entries, { kind: 'prompt', contexts: ['4K', '32K', '128K'] });
  assert.deepEqual(rows.map((row) => row.model), ['Q2_0', 'IQ3_XXS']);
  assert.deepEqual(rows[0].values, [1007, 1308, 1208]);
  assert.deepEqual(rows[1].values, [770, 1108, 1015]);
  const output = speedTableRows(entries, { kind: 'output', contexts: ['4K', '32K', '128K'] });
  assert.deepEqual(output[0].values, [90.3, 73.6, 67.2]);
});

test('keepsOnlyTextModelsAtOrAbove128KContextInPricing', async () => {
  const rows = parseOpenRouterModels(await jsonFixture('openrouter-models.json'), { limit: 10 });
  assert.deepEqual(rows.map((row) => row.id), [
    'nvidia/nemotron-3.5-lightning:free',
    'meta-llama/llama-4-maverick',
    'deepseek/deepseek-v3',
  ]);
  assert.equal(rows[0].free, true);
  assert.equal(rows[1].free, false);
  assert.equal(rows[1].promptPerMillion, 0.15);
  assert.equal(rows[1].completionPerMillion, 0.6);
  assert.equal(rows[2].context, 163840);
});

test('formatsNumbersWithSeparatorsAndPricesWithoutTrailingZeros', () => {
  assert.equal(formatNumber(1428), '1,428');
  assert.equal(formatNumber(90.3), '90.3');
  assert.equal(formatNumber(2785.6), '2,786');
  assert.equal(formatNumber(null), '');
  assert.equal(formatPrice(0.25), '0.25');
  assert.equal(formatPrice(0.15), '0.15');
  assert.equal(formatPrice(1.234), '1.234');
  assert.equal(formatPrice(0), '0');
  assert.equal(sha256('a'), 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
});

test('buildsChartItemsFromTheSameRowsTheTableShows', async () => {
  const tables = buildCommunityTables(parseCommunityRows(await fixture('strata-community.md')));
  const data = { tables: { output: { rows: tables.output }, prompt: { rows: tables.prompt }, others: { rows: tables.others } } };
  const dataset = { chart: { table: 'output', labelFields: ['hardware', 'model'], valueIndex: 1, top: 2, title: '排行', unit: 'tok/s' } };
  const items = datasetChartItems(dataset, data);
  assert.equal(items.length, 2);
  assert.equal(items[0].value, 130);
  assert.equal(items[0].label, '2x RTX PRO 4500 32 GB, Threadripper 7960X · Swift IQ3_XXS');
  assert.equal(datasetChartItems({}, data).length, 0);
});

test('drawsTheChartAsSelfContainedSvg', () => {
  const svg = barChartSvg({ title: '读取速度', unit: 'tok/s', items: [{ label: 'Q2_0 <0.1.14>', value: 1308 }], note: '同一台机器' });
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('<title>读取速度</title>'));
  assert.ok(svg.includes('Q2_0 &lt;0.1.14&gt;'));
  assert.ok(svg.includes('>1,308<'));
  assert.ok(svg.includes('<style>'));
  assert.equal(barChartSvg({ title: '空', unit: 'tok/s', items: [] }), '');
});

test('translatesSetupWordsButKeepsNumbersAndQuantNames', () => {
  assert.equal(translateSetup('RTX 4090, Ryzen 9 7950X, Linux source build'), 'RTX 4090, Ryzen 9 7950X, Linux 源码编译');
  assert.equal(translateSetup('IQ3_S, 131K (stock v0.1.41)'), 'IQ3_S, 131K (官方发行版 v0.1.41)');
  assert.equal(translateSetup('IQ3_XXS 200K opt-ins'), 'IQ3_XXS 200K 可选开关');
  assert.equal(translateSetup('about 73'), '约 73');
  assert.equal(translateSetup('0.1.31 to 0.1.39'), '0.1.31 至 0.1.39');
});
