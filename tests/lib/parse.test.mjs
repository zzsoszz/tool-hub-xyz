import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { parseFeed } from '../../src/lib/parse.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

const rssSource = {
  id: 'sample',
  name: 'Sample Feed',
  url: 'https://sample.example.com/feed.xml',
  kind: 'rss',
  tier: 1,
  trustCategory: true,
  category: 'models',
  lang: 'zh',
};

const atomSource = {
  id: 'arxiv-cs',
  name: 'arXiv',
  url: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI',
  kind: 'atom',
  tier: 2,
  trustCategory: true,
  category: 'research',
  lang: 'en',
};

async function fixture(name) {
  return readFile(path.join(FIXTURES, name), 'utf8');
}

test('extractsRssItemsWithUrlPublishedAndSummary', async () => {
  const items = parseFeed(await fixture('sample-rss.xml'), rssSource);
  assert.equal(items.length, 2);
  const [first] = items;
  assert.equal(first.title, 'OpenAI 发布 GPT-6：推理成本下降 40%');
  assert.equal(first.url, 'https://sample.example.com/gpt6-launch?utm_source=rss&ref=tw');
  assert.equal(first.published, '2026-11-04T01:30:00.000Z');
  assert.equal(first.author, '张三');
  assert.deepEqual(first.categories, ['AI']);
});

test('stripsHtmlTagsFromEncodedContent', async () => {
  const [first] = parseFeed(await fixture('sample-rss.xml'), rssSource);
  assert.ok(!first.summary.includes('<b>'));
  assert.ok(first.summary.includes('推理'));
});

test('dropsItemsWithoutUsableUrl', async () => {
  const items = parseFeed(await fixture('sample-rss.xml'), rssSource);
  assert.ok(!items.some((item) => item.title === '条目没有链接'));
});

test('prefersAlternateLinkOverPdfLinkInAtomEntries', async () => {
  const items = parseFeed(await fixture('arxiv-cs.xml'), atomSource);
  assert.equal(items[0].url, 'https://arxiv.org/abs/2611.04321v1');
  assert.equal(items[0].published, '2026-11-08T18:20:00.000Z');
});

test('resolvesRelativeAtomLinksAgainstSourceUrl', async () => {
  const items = parseFeed(await fixture('sample-atom.xml'), atomSource);
  assert.equal(items[1].url, 'https://export.arxiv.org/relative/post.html');
});

test('keepsItemsThatOnlyHaveTitleAndLink', async () => {
  const items = parseFeed(await fixture('sample-atom.xml'), atomSource);
  assert.equal(items.length, 2);
  assert.equal(items[1].summary, '');
});
