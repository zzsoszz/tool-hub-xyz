import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { allChildren, attr, decodeEntities, flattenText, parseXml } from '../../src/lib/xml.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

async function fixture(name) {
  return readFile(path.join(FIXTURES, name), 'utf8');
}

test('parsesRssChannelWithItems', async () => {
  const root = parseXml(await fixture('sample-rss.xml'));
  assert.equal(root.name, 'rss');
  const channel = allChildren(root, 'channel')[0];
  assert.equal(allChildren(channel, 'item').length, 3);
});

test('decodesEntitiesInTextContent', async () => {
  const root = parseXml(await fixture('sample-rss.xml'));
  const channel = allChildren(root, 'channel')[0];
  const firstItem = allChildren(channel, 'item')[0];
  const link = flattenText(allChildren(firstItem, 'link')[0]);
  assert.equal(link, 'https://sample.example.com/gpt6-launch?utm_source=rss&ref=tw');
});

test('readsCdataAsRawTextWithoutChildNodes', async () => {
  const root = parseXml(await fixture('sample-rss.xml'));
  const item = allChildren(allChildren(root, 'channel')[0], 'item')[0];
  const encoded = allChildren(item, 'content:encoded')[0];
  assert.equal(encoded.children.length, 0);
  assert.ok(flattenText(encoded).startsWith('<p>'));
});

test('keepsTagAttributesFromSelfClosingTags', async () => {
  const root = parseXml(await fixture('sample-atom.xml'));
  const entry = allChildren(root, 'entry')[0];
  const links = allChildren(entry, 'link');
  assert.equal(attr(links[0], 'rel'), 'alternate');
  assert.equal(attr(links[1], 'href'), 'https://arxiv.org/pdf/2611.00001v1');
});

test('decodesNamedAndNumericEntities', () => {
  assert.equal(decodeEntities('a &amp; b &#39;c&#39; &mdash; &lt;ok&gt;'), "a & b 'c' — <ok>");
});
