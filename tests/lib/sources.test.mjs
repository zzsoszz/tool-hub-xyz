import assert from 'node:assert/strict';
import test from 'node:test';
import { headersFor } from '../../src/lib/http.mjs';
import { enrichForumTopics, fetchAllSources, fetchCategoryPages, fetchMissingBodies, parseSourceBody, resolveSourceUrl, sourceUrls } from '../../src/lib/sources.mjs';

function forumBody(count, activity) {
  return JSON.stringify({
    topics: Array.from({ length: count }, (_, index) => ({
      tid: 100 + index,
      slug: String(100 + index),
      title: `帖子 ${index}：5080 跑 qwen 实测 105 tok/s`,
      timestampISO: activity,
      lastposttimeISO: activity,
      postcount: 4,
      votes: 2,
      viewcount: 200,
    })),
    pagination: { pageMax: 30 },
  });
}

test('expandsKeywordSourcesIntoOneRequestPerKeyword', () => {
  const source = {
    id: 'hn-ecosystem',
    name: 'HN 检索',
    url: 'https://hn.algolia.com/api/v1/search_by_date?query={QUERY}&tags=story',
    kind: 'json',
    adapter: 'hn-algolia',
    keywordsFrom: 'searchKeywords',
    maxQueries: 3,
  };
  const urls = sourceUrls(source, { searchKeywords: ['strata', 'comfyui', 'sglang', 'vllm'] });
  assert.equal(urls.length, 3);
  assert.ok(urls[0].includes('query=strata'), urls[0]);
  assert.ok(urls[2].includes('query=sglang'), urls[2]);
});

test('expandsRepositoryListsIntoOneRequestPerRepository', () => {
  const source = {
    id: 'gh-releases',
    name: 'GitHub 发布',
    url: 'https://api.github.com/repos/{REPO}/releases?per_page=3',
    kind: 'json',
    adapter: 'github-releases',
    repos: ['Comfy-Org/ComfyUI', 'Niko1221/Strata'],
  };
  assert.deepEqual(sourceUrls(source, {}), [
    'https://api.github.com/repos/Comfy-Org/ComfyUI/releases?per_page=3',
    'https://api.github.com/repos/Niko1221/Strata/releases?per_page=3',
  ]);
});

test('encodesKeywordsAndKeepsTheSincePlaceholder', () => {
  const source = {
    id: 'gh-ecosystem',
    name: 'GitHub 检索',
    url: 'https://api.github.com/search/repositories?q={QUERY}+pushed:%3E{SINCE}',
    kind: 'json',
    adapter: 'github-search',
    keywords: ['llama.cpp'],
  };
  const [url] = sourceUrls(source, { now: new Date('2026-11-09T00:00:00Z'), sinceDays: 7, timezone: 'UTC' });
  assert.equal(url, 'https://api.github.com/search/repositories?q=llama.cpp+pushed:%3E2026-11-02');
});

test('walksForumCategoryPagesUntilTheWindowRunsOut', async () => {
  const source = { id: 'lcz-llm', name: '抡锤者 模型部署讨论', url: 'https://lcz.me/api/category/7', kind: 'json', adapter: 'nodebb', tier: 2, pages: 5, windowHours: 48 };
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    const activity = page <= 2 ? '2026-11-10T00:00:00.000Z' : '2026-10-20T00:00:00.000Z';
    return { ok: true, status: 200, body: forumBody(20, activity) };
  };
  const result = await fetchCategoryPages(source, source.url, { fetchImpl, now: new Date('2026-11-11T04:00:00Z') });
  // 第 3 页读回来才发现活跃度掉出窗口，所以只多取一页就不再往下走。
  assert.equal(result.pages, 3);
  assert.equal(result.items.length, 60);
  assert.equal(requested.length, 3);
  assert.deepEqual(requested.slice(0, 2), ['https://lcz.me/api/category/7', 'https://lcz.me/api/category/7?page=2']);
});

test('stopsForumPagingWhenAPageIsNotFull', async () => {
  const source = { id: 'lcz-news', name: '抡锤者 资讯', url: 'https://lcz.me/api/category/3', kind: 'json', adapter: 'nodebb', tier: 3, pages: 4, windowHours: 120 };
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, body: forumBody(requested.length === 1 ? 20 : 6, '2026-11-11T00:00:00.000Z') };
  };
  const result = await fetchCategoryPages(source, source.url, { fetchImpl, now: new Date('2026-11-11T04:00:00Z') });
  assert.equal(result.pages, 2);
  assert.equal(result.items.length, 26);
  assert.equal(requested.length, 2);
});

test('reportsForumFailureWhenTheFirstPageCannotBeRead', async () => {
  const source = { id: 'lcz-agent', name: '抡锤者 Agent 工具', url: 'https://lcz.me/api/category/12', kind: 'json', adapter: 'nodebb', tier: 2, pages: 3, retries: 0 };
  const fetchImpl = async () => ({ ok: false, status: 502, error: 'HTTP 502' });
  const result = await fetchCategoryPages(source, source.url, { fetchImpl, retries: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.pages, 0);
  assert.equal(result.error, 'HTTP 502');
});

test('prioritisesEcosystemKeywordsWhenEnrichingForumTopics', async () => {
  const source = { id: 'lcz-llm', name: '抡锤者 模型部署讨论', url: 'https://lcz.me/api/category/7', kind: 'json', adapter: 'nodebb', tier: 2, enrichLimit: 1, keywordsFrom: 'searchKeywords', windowHours: 120 };
  const items = [
    { id: '1', title: '随便聊两句', url: 'https://lcz.me/topic/1', summary: '闲聊', metrics: { points: 30, comments: 40, views: 900 } },
    { id: '2', title: 'RX 7900 XTX 上跑 strata 的参数还有优化空间吗', url: 'https://lcz.me/topic/2', summary: 'strata 实测', metrics: { points: 0, comments: 1, views: 20 } },
  ];
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: false, status: 500, body: '' };
  };
  await enrichForumTopics(items, source, { fetchImpl, searchKeywords: ['strata', 'comfyui'] });
  assert.deepEqual(requested, ['https://lcz.me/api/topic/2']);
});

test('doesNotSpendEnrichmentRequestsOnTopicsOutsideTheWindow', async () => {
  const source = { id: 'lcz-llm', name: '抡锤者 模型部署讨论', url: 'https://lcz.me/api/category/7', kind: 'json', adapter: 'nodebb', tier: 2, enrichLimit: 5, windowHours: 48 };
  const items = [
    { id: '1', title: '今年的老帖子', url: 'https://lcz.me/topic/1', summary: '老帖', published: '2025-01-01T00:00:00.000Z', metrics: { points: 50, comments: 50 } },
  ];
  const requested = [];
  await enrichForumTopics(items, source, { fetchImpl: async (url) => requested.push(url) && { ok: false, status: 500, body: '' } });
  assert.deepEqual(requested, []);
});

test('injectsTheSinceDateIntoGithubSearchUrls', () => {
  const url = resolveSourceUrl(
    { id: 'github-trending', url: 'https://api.github.com/search/repositories?q=AI+created:%3E{SINCE}' },
    { now: new Date('2026-11-09T04:00:00Z'), sinceDays: 7, timezone: 'UTC' },
  );
  assert.equal(url, 'https://api.github.com/search/repositories?q=AI+created:%3E2026-11-02');
});

test('parsesJsonAndXmlBodiesByContentShape', () => {
  const jsonSource = { id: 'a', name: 'A', url: 'https://a.test/x', kind: 'json', adapter: 'hn-algolia', tier: 2, trustCategory: true };
  const items = parseSourceBody(jsonSource, JSON.stringify({ hits: [{ objectID: '1', title: 'Long enough title here', url: 'https://a.test/1', created_at: '2026-11-08T00:00:00Z' }] }));
  assert.equal(items.length, 1);
  const rssSource = { id: 'b', name: 'B', url: 'https://b.test/feed', kind: 'rss', tier: 2, trustCategory: true };
  const xmlItems = parseSourceBody(rssSource, '<rss><channel><item><title>A long enough feed title</title><link>https://b.test/1</link></item></channel></rss>');
  assert.equal(xmlItems[0].url, 'https://b.test/1');
});

test('reportsPerSourceFailuresWithoutThrowing', async () => {
  const sources = [
    { id: 'dead-one', name: 'Dead One', url: 'https://dead-one.invalid/feed', kind: 'rss', tier: 2 },
    { id: 'dead-two', name: 'Dead Two', url: 'https://dead-two.invalid/feed', kind: 'rss', tier: 2 },
  ];
  const results = await fetchAllSources(sources, { concurrency: 2, timeoutMs: 2_000, retries: 0 });
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.ok === false && result.items.length === 0 && result.error));
});

test('sendsTheActionsTokenOnlyToApiGitHubCom', () => {
  process.env.GITHUB_TOKEN = ' Actions 注入的临时令牌 ';
  assert.equal(headersFor('https://api.github.com/search/repositories?q=AI').authorization, 'Bearer  Actions 注入的临时令牌 ');
  assert.equal(headersFor('https://hn.algolia.com/api/v1/search').authorization, undefined);
  delete process.env.GITHUB_TOKEN;
});

test('enrichesPopularForumTopicsWithMainPostBody', async () => {
  const source = { id: 'lcz-hardware', name: '抡锤者 AI硬件', url: 'https://lcz.me/api/category/6', kind: 'json', adapter: 'nodebb', tier: 2 };
  const items = [
    { id: '2894', title: '短标题占位', url: 'https://lcz.me/topic/2894', summary: '一句话 teaser', categories: [], metrics: { points: 1, comments: 3, views: 268 } },
    { id: '2918', title: '另一个帖子', url: 'https://lcz.me/topic/2918', summary: '另一个 teaser', categories: [], metrics: { points: 0, comments: 6, views: 175 } },
  ];
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.endsWith('/2894')) {
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          title: '【实测分享】单张 RTX 5080 跑 Qwen3.8-Flash IQ3_S，输出 105～132 tok/s',
          votes: 5,
          postcount: 8,
          viewcount: 420,
          lczExcellent: 1,
          tags: [{ value: '5080' }, { value: 'tok/s' }],
          posts: [{
            content: '<p>标准测速中位数 <code>105.6 ～ 132.1 tok/s</code>，prefill 稳定在 3,400 tok/s，12 万 token 长文 28 秒读完。</p><table><tr><th>显卡</th><th>显存峰值</th></tr><tr><td>5080 16GB</td><td>15.2 GB</td></tr></table>',
          }],
        }),
      };
    }
    return { ok: false, status: 404, body: '', error: 'not found' };
  };
  await enrichForumTopics(items, source, { fetchImpl, timeoutMs: 1_000 });
  assert.deepEqual(requested.sort(), ['https://lcz.me/api/topic/2894', 'https://lcz.me/api/topic/2918']);
  assert.match(items[0].summary, /105\.6 ～ 132\.1 tok\/s/);
  assert.ok(items[0].content.html.includes('<table>'), '正文应保留表格结构');
  assert.equal(items[0].content.truncated, false);
  assert.equal(items[0].excellent, true);
  assert.equal(items[0].metrics.comments, 7);
  assert.deepEqual(items[0].categories, ['5080', 'tok/s']);
  assert.equal(items[1].summary, '另一个 teaser');
});

test('skipsForumEnrichmentForOtherAdapters', async () => {
  const items = [{ id: '1', summary: 'keep me' }];
  const result = await enrichForumTopics(items, { id: 'x', adapter: 'hn-algolia' }, { fetchImpl: async () => ({ ok: true, status: 200, body: '{}' }) });
  assert.equal(result[0].summary, 'keep me');
});

const longLead = '这篇文章给出了完整的部署步骤，先装驱动再拉取模型，量化以后显存占用从 24 GB 降到 11 GB，输出速度 105 tok/s，长文读取 28 秒，附带的脚本可以直接复现这组数字。';
const articlePage = `<!doctype html><html><head><title>页</title><nav><a href="/x">导航噪音</a></nav></head><body><article><h1>部署实测</h1><p>${longLead}</p><p>${longLead}</p><p>${longLead}</p><p>${longLead}</p></article><footer><a href="/f">页脚噪音</a></footer></body></html>`;
const readmeMarkdown = '# Strata\n\nRun powerful AI on your own computer.\n\n## Install\n\n```bash\ncurl -L https://strata.app/install.sh | sh\n```\n\n量化模型跑在本地 16 GB 显存上，输出 105 tok/s，长文 28 秒读完，附复现脚本。\n';

test('doesNotFetchArticleBodiesForSourcesThatDoNotAsk', async () => {
  const items = [{ id: '1', title: '只给标题', url: 'https://example.test/a', summary: '' }];
  const requested = [];
  await fetchMissingBodies(items, { id: 'hf-blog' }, { fetchImpl: async (url) => requested.push(url) && { ok: false, status: 500, body: '' } });
  assert.deepEqual(requested, []);
});

test('fetchesMissingBodiesAndRewritesTheLead', async () => {
  const source = { id: 'hf-blog', fetchBody: true, bodyFetchLimit: 2 };
  const items = [
    { id: '1', title: 'Blog post', url: 'https://huggingface.co/blog/one', summary: '', published: '2026-11-08T00:00:00.000Z' },
    { id: '2', title: 'Already has a body', url: 'https://huggingface.co/blog/two', summary: '原摘要', content: { html: '<p>已有正文</p>', text: '已有正文', chars: 4 } },
    { id: '3', title: 'Older post', url: 'https://huggingface.co/blog/three', summary: '', published: '2026-11-07T00:00:00.000Z' },
    { id: '4', title: 'Out of budget', url: 'https://huggingface.co/blog/four', summary: '', published: '2026-11-06T00:00:00.000Z' },
  ];
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, contentType: 'text/html; charset=utf-8', body: articlePage };
  };
  await fetchMissingBodies(items, source, { fetchImpl, timeoutMs: 1_000 });
  assert.deepEqual(requested, ['https://huggingface.co/blog/one', 'https://huggingface.co/blog/three']);
  assert.match(items[0].content.html, /<article>/);
  assert.ok(!items[0].content.html.includes('导航噪音') && !items[0].content.html.includes('页脚噪音'), '正文不该带导航和页脚');
  assert.match(items[0].summary, /部署步骤/);
  assert.equal(items[1].summary, '原摘要');
  assert.equal(items[3].content, undefined);
});

test('readsRepositoryReadmesThroughTheBodyUrlTemplate', async () => {
  const source = {
    id: 'gh-ecosystem',
    fetchBody: true,
    bodyUrl: 'https://raw.githubusercontent.com/{REPO}/HEAD/README.md',
    bodyFetchLimit: 4,
  };
  const items = [
    { id: '1', title: 'Niko1221/Strata', url: 'https://github.com/Niko1221/Strata', summary: '★ 1500 · TypeScript', published: '2026-11-08T00:00:00.000Z' },
    { id: '2', title: 'Niko1221/Strata', url: 'https://github.com/Niko1221/Strata', summary: '★ 1500 · TypeScript', published: '2026-11-07T00:00:00.000Z' },
  ];
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, contentType: 'text/plain; charset=utf-8', body: readmeMarkdown };
  };
  await fetchMissingBodies(items, source, { fetchImpl, timeoutMs: 1_000 });
  assert.deepEqual(requested, ['https://raw.githubusercontent.com/Niko1221/Strata/HEAD/README.md']);
  assert.ok(items[0].content.html.includes('<pre><code>'), 'README 里的命令块要保留成代码块');
  assert.match(items[0].content.html, /<h4>Install<\/h4>/);
  assert.match(items[0].content.text, /105 tok\/s/);
  assert.equal(items[0].summary, 'Strata Run powerful AI on your own computer.', 'README 的开头比只剩星数的摘要更有信息量');
  assert.equal(items[1].content, undefined);
});

test('spendsBodyFetchBudgetOnItemsThatCouldSurviveTheGuards', async () => {
  const source = { id: 'gh-ecosystem', fetchBody: true, bodyFetchLimit: 1 };
  const items = [
    { id: '1', title: '无星数仓库', url: 'https://github.com/a/b', summary: '', published: '2026-11-08T00:00:00.000Z', metrics: { stars: 3 } },
    { id: '2', title: '门槛内的仓库', url: 'https://github.com/c/d', summary: '', published: '2026-11-07T00:00:00.000Z', metrics: { stars: 900 } },
  ];
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, contentType: 'text/html; charset=utf-8', body: articlePage };
  };
  const worthEnriching = (item, sourceConfig) => sourceConfig.minMetrics.stars <= item.metrics.stars;
  await fetchMissingBodies(items, { ...source, minMetrics: { stars: 100 } }, { fetchImpl, timeoutMs: 1_000, worthEnriching });
  assert.deepEqual(requested, ['https://github.com/c/d']);
  assert.equal(items[0].content, undefined);
  assert.ok(items[1].content);
});
