import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { parseJsonFeed } from '../../src/lib/adapters.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

async function load(name, source) {
  const payload = JSON.parse(await readFile(path.join(FIXTURES, name), 'utf8'));
  return parseJsonFeed(payload, source);
}

const hnSource = { id: 'hn-algolia', name: 'Hacker News', url: 'https://hn.algolia.com/api/v1/search', kind: 'json', adapter: 'hn-algolia', tier: 2, trustCategory: true, category: 'engineering' };
const paperSource = { id: 'hf-daily-papers', name: 'HF Daily Papers', url: 'https://huggingface.co/api/daily_papers', kind: 'json', adapter: 'hf-daily-papers', tier: 1, trustCategory: true, category: 'research' };
const repoSource = { id: 'github-trending', name: 'GitHub 新晋 AI 项目', url: 'https://api.github.com/search/repositories', kind: 'json', adapter: 'github-search', tier: 2, trustCategory: true, category: 'opensource' };
const forumSource = { id: 'lcz-hardware', name: '抡锤者 AI硬件', url: 'https://lcz.me/api/category/6', kind: 'json', adapter: 'nodebb', lang: 'zh', tier: 2, trustCategory: true, category: 'local' };
const releaseSource = { id: 'gh-releases', name: 'GitHub 发布', url: 'https://api.github.com/repos/{REPO}/releases', kind: 'json', adapter: 'github-releases', lang: 'en', tier: 1, trustCategory: true, category: 'local' };

test('readsReleaseNotesAsArticlesWithCommands', () => {
  const items = parseJsonFeed(
    [
      {
        id: 1,
        html_url: 'https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.45.0',
        tag_name: 'v0.45.0',
        name: 'v0.45.0',
        published_at: '2026-11-10T21:42:42Z',
        author: { login: 'comfy-pr-bot' },
        body: "## What's Changed\n* 单卡显存占用降到 11.2 GB，prefill 提升到 1800 tok/s\n* 新增 A 卡动态卸载节点，7900 XTX 也能跑 15 秒档\n\n```bash\npip install -U comfyui\n```\n\n升级后请重新安装自定义节点。",
      },
      { id: 2, html_url: 'https://github.com/x/y/releases/tag/wip', tag_name: 'wip', draft: true, body: '还没写完' },
      { id: 3, html_url: 'https://github.com/x/y/releases/tag/empty', tag_name: 'empty', published_at: '2026-11-10T00:00:00Z', body: '   ' },
    ],
    releaseSource,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'ComfyUI v0.45.0 发布');
  assert.equal(items[0].published, '2026-11-10T21:42:42.000Z');
  assert.ok(items[0].content.html.includes('<pre><code>pip install -U comfyui</code></pre>'), items[0].content.html);
  assert.ok(items[0].content.text.includes('11.2 GB'), items[0].content.text);
});

test('usesPushedDateWhenASourceTracksRepositoryUpdates', () => {
  const payload = {
    items: [
      {
        id: 7,
        full_name: 'example/strata-tuning',
        html_url: 'https://github.com/example/strata-tuning',
        created_at: '2023-04-01T00:00:00Z',
        pushed_at: '2026-11-10T06:00:00Z',
        stargazers_count: 420,
        description: 'LLM inference tuning presets',
      },
    ],
  };
  const created = parseJsonFeed(payload, repoSource)[0];
  const pushed = parseJsonFeed(payload, { ...repoSource, id: 'gh-ecosystem', publishedField: 'pushed' })[0];
  assert.equal(created.published, '2023-04-01T00:00:00.000Z');
  assert.equal(pushed.published, '2026-11-10T06:00:00.000Z');
});

test('dropsTopicsTheModeratorsDeletedFromForumPages', () => {
  const items = parseJsonFeed(
    {
      topics: [
        { tid: 1, slug: '1', title: '[[topic:topic-is-deleted]]', timestampISO: '2026-11-10T00:00:00.000Z' },
        { tid: 2, slug: '2', title: '7900 XTX 跑 strata 实测', timestampISO: '2026-11-10T00:00:00.000Z' },
        { tid: 3, slug: '3', title: '版主删掉的帖子', deleted: 1, timestampISO: '2026-11-10T00:00:00.000Z' },
      ],
    },
    forumSource,
  );
  assert.deepEqual(items.map((entry) => entry.id), ['2']);
});

test('fallsBackToHackerNewsItemPageWhenStoryHasNoExternalUrl', async () => {
  const items = await load('hn-algolia.json', hnSource);
  assert.equal(items[1].url, 'https://news.ycombinator.com/item?id=42000002');
  assert.equal(items[0].metrics.points, 214);
});

test('buildsHuggingFacePaperLinksFromPaperIds', async () => {
  const items = await load('hf-daily-papers.json', paperSource);
  assert.equal(items[0].url, 'https://huggingface.co/papers/2611.01234');
  assert.equal(items[0].metrics.upvotes, 210);
});

test('includesRepositoryStarsAndTopicsInSummary', async () => {
  const items = await load('github-trending.json', repoSource);
  assert.equal(items[0].url, 'https://github.com/example/agent-runtime');
  assert.ok(items[0].summary.includes('★ 1830'));
  assert.equal(items[1].published, '2026-11-01T06:00:00.000Z');
});

test('throwsWhenAdapterIsMissing', () => {
  assert.throws(() => parseJsonFeed({ hits: [] }, { id: 'x', name: 'X', url: 'https://x.test', kind: 'json' }), /缺少 adapter/);
});

test('mapsForumTopicsToItemsWithTagsAndEngagement', async () => {
  const items = await load('lcz-hardware.json', forumSource);
  assert.equal(items.length, 4);
  const first = items.find((entry) => entry.id === '2918');
  assert.equal(first.url, 'https://lcz.me/topic/2918');
  assert.equal(first.lang, 'zh');
  assert.equal(first.metrics.comments, 6);
  assert.equal(first.metrics.views, 175);
  assert.ok(first.categories.includes('7900xtx'));
  assert.ok(first.summary.includes('上下文'));
});

test('marksModeratorSelectedForumTopicsAsExcellent', async () => {
  const items = await load('lcz-hardware.json', forumSource);
  const excellent = items.find((entry) => entry.id === '2894');
  assert.equal(excellent.excellent, true);
  assert.equal(items.find((entry) => entry.id === '2918').excellent, false);
});
