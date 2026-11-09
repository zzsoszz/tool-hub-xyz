import { allChildren, attr, childText, firstChild, flattenText, parseXml } from './xml.mjs';
import { absoluteUrl, cleanText, parseDate, summarize } from './normalize.mjs';
import { sanitizeArticle } from './content.mjs';

const DATE_NAMES = ['pubDate', 'published', 'updated', 'date', 'dc:date'];
const BODY_NAMES = ['content:encoded', 'content', 'description', 'summary', 'media:description', 'itunes:summary'];
const AUTHOR_NAMES = ['dc:creator', 'author', 'creator'];

export function parseFeed(text, source) {
  const root = parseXml(text);
  if (!root) throw new Error(`无法解析 ${source.id} 的 feed`);
  return collectItemNodes(root).map((node) => buildItem(node, source)).filter((item) => item.title && item.url);
}

function collectItemNodes(root) {
  if (root.name === 'rss') {
    const channel = firstChild(root, ['channel']);
    return allChildren(channel ?? root, 'item');
  }
  if (root.name === 'feed') return allChildren(root, 'entry');
  const items = allChildren(root, 'item');
  if (items.length) return items;
  return allChildren(root, 'entry');
}

function pickUrl(node, source) {
  const links = allChildren(node, 'link');
  for (const link of links) {
    const rel = attr(link, 'rel');
    const href = attr(link, 'href');
    if (href && (rel === '' || rel === 'alternate')) return absoluteUrl(href, source.url);
  }
  for (const link of links) {
    const href = attr(link, 'href') || flattenText(link);
    if (href) return absoluteUrl(href, source.url);
  }
  const guid = firstChild(node, ['guid', 'id']);
  if (guid && attr(guid, 'isPermaLink') === 'true') return absoluteUrl(flattenText(guid), source.url);
  const direct = attr(node, 'url') || attr(node, 'href');
  return direct ? absoluteUrl(direct, source.url) : null;
}

function pickPublished(node) {
  for (const name of DATE_NAMES) {
    const value = childText(node, [name]);
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

function pickBody(node) {
  for (const name of BODY_NAMES) {
    const found = firstChild(node, [name]);
    if (!found) continue;
    const text = flattenText(found);
    if (cleanText(text, 40)) return text;
  }
  return '';
}

function pickCategories(node) {
  return allChildren(node, 'category')
    .map((node) => attr(node, 'term') || flattenText(node))
    .map((value) => cleanText(value, 40))
    .filter(Boolean);
}

function pickAuthor(node) {
  for (const name of AUTHOR_NAMES) {
    const found = firstChild(node, [name]);
    if (!found) continue;
    const nested = firstChild(found, ['name']);
    const text = cleanText(nested ? flattenText(nested) : flattenText(found), 60);
    if (text) return text;
  }
  return '';
}

function buildItem(node, source) {
  const title = cleanText(childText(node, ['title']), 220);
  const url = pickUrl(node, source);
  const published = pickPublished(node);
  const id = cleanText(childText(node, ['guid', 'id']), 200);
  const rawBody = pickBody(node);
  const content = sanitizeArticle(rawBody, { baseUrl: url });
  return {
    sourceId: source.id,
    sourceName: source.name,
    title,
    url,
    id,
    published: published ? published.toISOString() : null,
    summary: content ? cleanText(content.lead, 320) : summarize(rawBody),
    content: content ?? undefined,
    categories: pickCategories(node),
    author: pickAuthor(node),
    lang: source.lang ?? 'en',
    tier: source.tier ?? 2,
    trustCategory: Boolean(source.trustCategory),
    declaredCategory: source.category ?? null,
    metrics: {},
  };
}
