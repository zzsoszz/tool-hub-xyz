import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = '.tmp-test/data';
const DIST_DIR = '.tmp-test/dist';

function run(args, env = {}) {
  return execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
}

test.before(async () => {
  await rm(path.join(ROOT, '.tmp-test'), { recursive: true, force: true });
});

test('collectsFixturesOfflineIntoADigest', () => {
  const output = run(['src/collect.mjs', '--offline', `--out=${DATA_DIR}`, '--window-hours=43200']);
  assert.match(output, /collect \d{4}-\d{2}-\d{2} 首次全量: sources=7\/21/);
  assert.match(output, /published=\d{2}/);
});

test('buildsHtmlRssAndJsonOutputsFromTheDigest', async () => {
  run(['src/build.mjs'], { DATA_DIR, DIST_DIR });
  const index = await readFile(path.join(ROOT, DIST_DIR, 'index.html'), 'utf8');
  assert.match(index, /AI 日报/);
  assert.match(index, /本次数据源/);
  assert.match(index, /量子位|OpenAI News|TechCrunch AI|arXiv/);
  const feed = await readFile(path.join(ROOT, DIST_DIR, 'feed.xml'), 'utf8');
  assert.match(feed, /<rss version="2.0">/);
  const llms = await readFile(path.join(ROOT, DIST_DIR, 'llms.txt'), 'utf8');
  assert.match(llms, /^# AI 资讯日报 · tool-hub\.xyz/m);
  const latest = JSON.parse(await readFile(path.join(ROOT, DIST_DIR, 'data', 'latest.json'), 'utf8'));
  assert.ok(latest.counts.published >= 10);
  assert.ok(latest.categories.some((group) => group.items.length > 0));
  const seen = JSON.parse(await readFile(path.join(ROOT, DATA_DIR, 'seen.json'), 'utf8'));
  assert.equal(seen.version, 1);
  assert.ok(seen.count >= 10);
});

test('copiesPublicAssetsIntoDist', async () => {
  for (const file of ['styles.css', 'favicon.svg', '_headers', '_redirects', 'robots.txt', 'sitemap.xml']) {
    const body = await readFile(path.join(ROOT, DIST_DIR, file), 'utf8');
    assert.ok(body.length > 0, `${file} 应存在于 dist`);
  }
  const archive = await readFile(path.join(ROOT, DIST_DIR, 'archive.html'), 'utf8');
  assert.match(archive, /归档/);
});

test('rerunningCollectCarriesOverTheSameDayDigest', () => {
  const first = run(['src/collect.mjs', '--offline', `--out=${DATA_DIR}`, '--window-hours=43200']);
  const second = run(['src/collect.mjs', '--offline', `--out=${DATA_DIR}`, '--window-hours=43200']);
  const published = (line) => Number(/published=(\d+)/.exec(line)[1]);
  assert.ok(published(first) >= 10);
  assert.equal(published(second), published(first));
  assert.match(second, /carried=\d{2}/);
});
