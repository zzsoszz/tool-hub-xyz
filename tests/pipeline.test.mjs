import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = '.tmp-test/data';
const DIST_DIR = '.tmp-test/dist';

function run(args, env = {}) {
  return execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
}

async function readDist(file) {
  return readFile(path.join(ROOT, DIST_DIR, file), 'utf8');
}

test.before(async () => {
  await rm(path.join(ROOT, '.tmp-test'), { recursive: true, force: true });
});

// 样例正文的日期是固定的（2026-11-01 ~ 11-08），不钉住「现在」的话，样例会随着真实日期老化出窗口。
const FIXED_NOW = '2026-11-08T23:30:00.000Z';

test('collectsFixturesOfflineIntoADigest', () => {
  const output = run(['src/collect.mjs', '--offline', `--out=${DATA_DIR}`, `--now=${FIXED_NOW}`]);
  assert.match(output, /collect \d{4}-\d{2}-\d{2} 首次全量: sources=\d+\/\d+/);
  assert.match(output, /published=\d+/);
  assert.match(output, /质量淘汰=\d+/);
});

test('digestItemsCarrySlugsAndPracticality', async () => {
  // 采集按本地日期落盘，测试别用 UTC 日期去猜文件名：跨日界线时两者会差一天。
  const digestDir = path.join(ROOT, DATA_DIR, 'digests');
  const names = (await readdir(digestDir)).filter((file) => file.endsWith('.json')).sort();
  assert.ok(names.length, '离线采集没有写出日报文件');
  const digest = JSON.parse(await readFile(path.join(digestDir, names.at(-1)), 'utf8'));
  const items = digest.categories.flatMap((group) => group.items);
  assert.ok(items.length >= 4);
  assert.ok(items.every((item) => /^[0-9a-f]{12}$/.test(item.slug)));
  assert.ok(items.every((item) => Number.isFinite(item.practical)));
  assert.ok(items.every((item) => Number.isFinite(item.rank) && Number.isFinite(item.quality)));
  assert.ok(items.every((item) => Array.isArray(item.tags)));
});

test('buildsMenuSectionItemAndForumPages', async () => {
  run(['src/build.mjs'], { DATA_DIR, DIST_DIR });
  const index = await readDist('index.html');
  assert.match(index, /AI 日报/);
  assert.match(index, /<nav class="menu">/);
  assert.match(index, /href="\/s\/apps"/);
  assert.match(index, /量子位|OpenAI News|TechCrunch AI|arXiv|抡锤者|Hugging Face/);
  assert.match(index, /class="original-link"/);

  const discuss = await readDist('discuss.html');
  assert.match(discuss, /讨论区/);
  const search = await readDist('search.html');
  assert.match(search, /搜索全部文章/);
  assert.match(search, /data-search-status/);
  assert.match(search, /<script src="\/search\.js" defer><\/script>/);
  const about = await readDist('about.html');
  assert.match(about, /关于本站/);
  const section = await readDist('s/apps.html');
  assert.match(section, /AI 应用/);
  const tags = await readDist('tags.html');
  assert.match(tags, /关键词标签|标签/);
  const tagSlug = /href="\/t\/([a-z]+)"/.exec(tags)?.[1];
  assert.ok(tagSlug, '标签索引页应列出至少一个标签页');
  const tagPage = await readDist(`t/${tagSlug}.html`);
  assert.match(tagPage, new RegExp(tagSlug));

  const feed = await readDist('feed.xml');
  assert.match(feed, /<rss version="2\.0">/);
  const llms = await readDist('llms.txt');
  assert.match(llms, /^# AI 折腾日报 · tool-hub\.xyz/m);

  const latest = JSON.parse(await readDist('data/latest.json'));
  assert.ok(latest.counts.published >= 4);
  assert.ok(latest.categories.some((group) => group.items.length > 0));
  assert.ok(latest.categories.every((group) => group.items.every((item) => /^[0-9a-f]{12}$/.test(item.slug))));

  const itemsIndex = JSON.parse(await readDist('data/items.json'));
  const [firstSlug, firstEntry] = Object.entries(itemsIndex)[0];
  assert.match(firstSlug, /^[0-9a-f]{12}$/);
  assert.ok(firstEntry.url.startsWith('http'));
  const itemPage = await readDist(`item/${firstSlug}.html`);
  assert.match(itemPage, /<textarea name="body"/);

  const seen = JSON.parse(await readFile(path.join(ROOT, DATA_DIR, 'seen.json'), 'utf8'));
  assert.equal(seen.version, 1);
  assert.ok(seen.count >= 4);
});

test('copiesPublicAssetsAndSitemapCoversSections', async () => {
  // 每个页面都挂 /search.js：右下角的悬浮搜索按钮靠它。
  assert.match(await readDist('index.html'), /<script src="\/search\.js" defer><\/script>/);
  for (const file of ['styles.css', 'favicon.svg', '_headers', '_redirects', 'robots.txt', 'sitemap.xml', 'forum.js', 'search.js']) {
    const body = await readDist(file);
    assert.ok(body.length > 0, `${file} 应存在于 dist`);
  }
  // 页面引用的样式与脚本必须每次核对：改了 CSS 不能让旧缓存继续喂给浏览器（图片放大浮层就是这么坏掉的）。
  const headerBlocks = await readDist('_headers').then((raw) => raw.split('\n').reduce((acc, line) => {
    if (!line.startsWith(' ')) acc.push([line, []]);
    else acc.at(-1)[1].push(line.trim());
    return acc;
  }, []));
  const cacheFor = (asset) => headerBlocks.find(([path]) => path === asset)?.[1].find((entry) => entry.startsWith('Cache-Control:'));
  for (const asset of ['/styles.css', '/favicon.svg', '/listview.mjs']) {
    assert.equal(cacheFor(asset), 'Cache-Control: public, max-age=0, must-revalidate');
  }
  const sitemap = await readDist('sitemap.xml');
  assert.match(sitemap, /\/s\/apps/);
  assert.match(sitemap, /\/discuss/);
  assert.match(sitemap, /\/tags/);
  assert.match(sitemap, /\/t\/[a-z]+/);
  assert.match(sitemap, /\/item\/[0-9a-f]{12}/);
  const archive = await readDist('archive.html');
  assert.match(archive, /归档/);
});

test('rerunningCollectCarriesOverTheSameDayDigest', () => {
  const first = run(['src/collect.mjs', '--offline', `--out=${DATA_DIR}`, `--now=${FIXED_NOW}`]);
  const second = run(['src/collect.mjs', '--offline', `--out=${DATA_DIR}`, `--now=${FIXED_NOW}`]);
  const published = (line) => Number(/published=(\d+)/.exec(line)[1]);
  assert.ok(published(first) >= 4);
  assert.equal(published(second), published(first));
  assert.match(second, /carried=\d+/);
});

// 按天回填靠 --since/--until：窗口外的条目一律不要，也不给旧文兜底，否则历史某天会被塞进别的日子的内容。
test('collectingWithAnExplicitWindowKeepsOnlyThatWindowsItems', async () => {
  const windowDir = '.tmp-test/data-window';
  const output = run([
    'src/collect.mjs',
    '--offline',
    `--out=${windowDir}`,
    '--date=2020-01-01',
    '--since=2020-01-01T00:00:00Z',
    '--until=2020-01-02T00:00:00Z',
  ]);
  assert.match(output, /窗口\(2020-01-01T00:00:00\.000Z → 2020-01-02T00:00:00\.000Z\)/);
  assert.match(output, /兜底=0 published=0/);
  const digest = JSON.parse(await readFile(path.join(ROOT, windowDir, 'digests', '2020-01-01.json'), 'utf8'));
  assert.deepEqual(digest.window, { since: '2020-01-01T00:00:00.000Z', until: '2020-01-02T00:00:00.000Z' });
  assert.equal(digest.categories.length, 0);
});

// 增量起点只是补漏线，每个源自己的 windowHours 才是窗口：上次运行哪怕只过去一小时，
// 48 小时的窗口也不该被压成一小时，否则慢栏目永远采不到东西。
test('incrementalRunsKeepEachSourcesOwnWindow', async () => {
  const freshDir = '.tmp-test/data-fresh';
  const seededDir = '.tmp-test/data-seeded';
  await mkdir(path.join(ROOT, seededDir), { recursive: true });
  await writeFile(path.join(ROOT, seededDir, 'state.json'), `${JSON.stringify({ version: 1, day: '2026-11-09', lastRunAt: '2026-11-08T22:30:00.000Z' }, null, 2)}\n`);
  const published = (output) => Number(/published=(\d+)/.exec(output)[1]);
  const fresh = run(['src/collect.mjs', '--offline', `--out=${freshDir}`, `--now=${FIXED_NOW}`]);
  const seeded = run(['src/collect.mjs', '--offline', `--out=${seededDir}`, `--now=${FIXED_NOW}`]);
  assert.match(seeded, /增量\(自 2026-11-08T22:30:00\.000Z\)/);
  assert.equal(published(seeded), published(fresh));
});
