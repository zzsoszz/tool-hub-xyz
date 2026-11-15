import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { IMAGE_PREFIX, imageKey, imageUrls, localizeItems, pruneImages, readManifest, saveImages } from '../../src/lib/images.mjs';
import { itemImage } from '../../src/lib/items.mjs';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
const AVIF = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]);
const NOT_AN_IMAGE = new TextEncoder().encode('<html>404 Not Found</html>');

async function workspace(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tool-hub-images-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function article(url, html) {
  return { title: `条目 ${url}`, url, content: { html } };
}

function fetcher(responses) {
  const asked = [];
  const impl = async (url) => {
    asked.push(url);
    const hit = responses[url];
    if (!hit) return { ok: false, status: 404, error: 'HTTP 404' };
    if (hit.error) return { ok: false, status: 0, error: hit.error };
    return { ok: true, status: 200, contentType: hit.contentType, bytes: hit.bytes };
  };
  return { asked, impl };
}

function pngs(names) {
  return Object.fromEntries(names.map((name) => [`https://cdn.test/${name}`, { contentType: 'image/png', bytes: PNG }]));
}

function one(name, body) {
  return article(`https://post.test/${name}`, `<img src="https://cdn.test/${name}" alt="${body ?? ''}" loading="lazy">`);
}

function entryOf(manifest, url) {
  return manifest.images[imageKey(url)];
}

test('readsBodyImageUrlsOnceWithTrackingDecoded', () => {
  const urls = imageUrls([
    '<img src="https://cdn.test/shot.png?w=4&amp;h=3" alt="" loading="lazy">',
    '<img src="https://cdn.test/shot.png?w=4&h=3" alt="" loading="lazy">',
    '<img src="/local-only.png" alt="" loading="lazy">',
  ].join('\n'));
  assert.deepEqual(urls, ['https://cdn.test/shot.png?w=4&h=3']);
});

test('storesBodyImagesOnceAndRecordsThemInAManifest', async (t) => {
  const dir = await workspace(t);
  const url = 'https://cdn.test/uploads/shot-one.png';
  const { asked, impl } = fetcher({ [url]: { contentType: 'image/png', bytes: PNG } });
  const html = `<p>正文</p>\n<img src="${url}" alt="实测截图" loading="lazy">\n<img src="${url}" alt="" loading="lazy">`;
  const outcome = await saveImages([article('https://post.test/a', html)], { imagesDir: dir, fetchImpl: impl });
  const entry = entryOf(outcome.manifest, url);

  assert.equal(outcome.saved, 1);
  assert.equal(outcome.bytes, PNG.byteLength);
  assert.deepEqual(asked, [url]);
  assert.match(entry.file, /^uploads-shot-one-[0-9a-f]{16}\.png$/);
  assert.deepEqual([...await readFile(path.join(dir, entry.file))], [...PNG]);
  assert.equal((await readManifest(dir)).images[imageKey(url)].url, url);
});

test('asksForAStoredImageWithTheArticlePageAsReferer', async (t) => {
  const dir = await workspace(t);
  const url = 'https://cdn.test/shot-one.png';
  const asked = [];
  const impl = async (image, options = {}) => {
    asked.push({ image, referer: options.headers?.referer ?? '' });
    return { ok: true, status: 200, contentType: 'image/png', bytes: PNG };
  };

  const outcome = await saveImages([article('https://post.test/a', `<img src="${url}" alt="实测截图" loading="lazy">`)], {
    imagesDir: dir,
    fetchImpl: impl,
  });

  assert.equal(outcome.saved, 1);
  assert.deepEqual(asked, [{ image: url, referer: 'https://post.test/a' }]);
});

test('reusesTheStoredCopyInsteadOfAskingTheSourceAgain', async (t) => {
  const dir = await workspace(t);
  const item = one('cached.png');
  const first = fetcher(pngs(['cached.png']));
  const second = fetcher(pngs(['cached.png']));

  const stored = await saveImages([item], { imagesDir: dir, fetchImpl: first.impl });
  const again = await saveImages([item], { imagesDir: dir, fetchImpl: second.impl });

  assert.equal(stored.saved, 1);
  assert.equal(again.saved, 0);
  assert.equal(again.cached, 1);
  assert.deepEqual(second.asked, []);
});

test('refusesToStoreBytesThatAreNotActuallyAnImage', async (t) => {
  const dir = await workspace(t);
  const notes = [];
  const { asked, impl } = fetcher({
    'https://cdn.test/lie.png': { contentType: 'image/png', bytes: NOT_AN_IMAGE },
    'https://cdn.test/script.svg': { contentType: 'image/svg+xml', bytes: new TextEncoder().encode('<svg onload="alert(1)"></svg>') },
    'https://cdn.test/gone.png': { error: 'timeout after 20000ms' },
  });
  const items = ['lie.png', 'script.svg', 'gone.png'].map((name) => one(name));
  const outcome = await saveImages(items, { imagesDir: dir, fetchImpl: impl, log: (message) => notes.push(message) });

  assert.equal(asked.length, 3);
  assert.equal(outcome.saved, 0);
  assert.equal(outcome.failed, 3);
  assert.deepEqual((await readManifest(dir)).images, {});
  assert.ok(notes.every((note) => note.includes('配图存不下')));
});

test('keepsInsideThePerItemAndPerRunImageBudgets', async (t) => {
  const dir = await workspace(t);
  const names = [1, 2, 3].flatMap((group) => [1, 2, 3].map((n) => `g${group}-${n}.png`));
  const { impl } = fetcher(pngs(names));
  const items = [1, 2, 3].map((group) =>
    article(`https://post.test/${group}`, [1, 2, 3].map((n) => `<img src="https://cdn.test/g${group}-${n}.png" alt="" loading="lazy">`).join('\n')),
  );
  const outcome = await saveImages(items, { imagesDir: dir, fetchImpl: impl, limits: { maxImagesPerItem: 2, maxImagesPerRun: 4 } });

  assert.equal(outcome.saved, 4);
  assert.equal(outcome.skipped, 2);
  assert.equal(outcome.cached, 0);
});

test('namesCopiesAfterTheSourcePathSoIconDetectionStillWorks', async (t) => {
  const dir = await workspace(t);
  const url = 'https://lcz.me/assets/plugins/nodebb-plugin-emoji/emoji/android/1f4e1.png';
  const { impl } = fetcher({ [url]: { contentType: 'image/png', bytes: PNG } });
  const item = article('https://lcz.me/t/1', `<img src="${url}" alt="" loading="lazy">`);
  const outcome = await saveImages([item], { imagesDir: dir, fetchImpl: impl });
  const entry = entryOf(outcome.manifest, url);
  const localized = await localizeItems([item], { imagesDir: dir, manifest: outcome.manifest });

  assert.match(entry.file, /^emoji-android-1f4e1-[0-9a-f]{16}\.png$/);
  assert.equal(localized.localized, 1);
  assert.ok(item.content.html.includes(`${IMAGE_PREFIX}/${entry.file}`));
  assert.equal(itemImage(item), null, '表情图换成本地地址后仍然不算配图');
});

test('prefersTheServedContentTypeOverTheUrlExtension', async (t) => {
  const dir = await workspace(t);
  const url = 'https://cdn.test/photo.jpg';
  const { impl } = fetcher({ [url]: { contentType: 'image/avif', bytes: AVIF } });
  const outcome = await saveImages([one('photo.jpg')], { imagesDir: dir, fetchImpl: impl });
  const entry = entryOf(outcome.manifest, url);

  assert.match(entry.file, /^photo-[0-9a-f]{16}\.avif$/);
  assert.equal(entry.contentType, 'image/avif');
  assert.deepEqual([...await readFile(path.join(dir, entry.file))], [...AVIF]);
});

test('localizesOnlyTheImagesWithACopyOnDisk', async (t) => {
  const dir = await workspace(t);
  const kept = 'https://cdn.test/cover.png';
  const lost = 'https://cdn.test/gone.png';
  const { impl } = fetcher({ [kept]: { contentType: 'image/png', bytes: PNG }, [lost]: { contentType: 'image/png', bytes: PNG } });
  const withCopy = one('cover.png', '封面');
  const withoutCopy = one('gone.png');
  const manifest = (await saveImages([withCopy, withoutCopy], { imagesDir: dir, fetchImpl: impl })).manifest;
  await unlink(path.join(dir, entryOf(manifest, lost).file));
  const localized = await localizeItems([withCopy, withoutCopy], { imagesDir: dir, manifest });

  assert.equal(localized.localized, 1);
  assert.equal(localized.remote, 1);
  assert.match(withCopy.content.html, new RegExp(`src="${IMAGE_PREFIX}/cover-[0-9a-f]{16}\\.png"`));
  assert.match(withoutCopy.content.html, /src="https:\/\/cdn\.test\/gone\.png"/);
  assert.deepEqual([...localized.files.keys()], [entryOf(manifest, kept).file]);
  assert.deepEqual([...localized.files.values()], [kept]);
});

test('prunesCopiesPastTheRetentionWindow', async (t) => {
  const dir = await workspace(t);
  const stale = 'https://cdn.test/stale.png';
  const fresh = 'https://cdn.test/fresh.png';
  const { impl } = fetcher({ [stale]: { contentType: 'image/png', bytes: PNG }, [fresh]: { contentType: 'image/png', bytes: PNG } });
  const items = [stale, fresh].map((url) => article(url, `<img src="${url}" alt="" loading="lazy">`));
  const outcome = await saveImages(items, { imagesDir: dir, fetchImpl: impl });
  const staleFile = entryOf(outcome.manifest, stale).file;
  outcome.manifest.images[imageKey(stale)].savedAt = '2020-01-01T00:00:00.000Z';
  outcome.manifest.images[imageKey(fresh)].savedAt = '2020-01-25T00:00:00.000Z';

  const removed = await pruneImages(dir, outcome.manifest, { retentionDays: 30, now: new Date('2020-02-01T00:00:00Z') });
  const manifest = await readManifest(dir);

  assert.equal(removed, 1);
  assert.ok(manifest.images[imageKey(fresh)]);
  assert.ok(!manifest.images[imageKey(stale)]);
  await assert.rejects(stat(path.join(dir, staleFile)));
});
