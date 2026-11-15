import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchBytes } from './http.mjs';

// 正文配图在站内的固定前缀：条目页与列表缩略图都走 /images/<文件>，不再热链回源站。
export const IMAGE_PREFIX = '/images';

// 只存栅格图：SVG 里能带脚本，同源发出去等于把别人页面的脚本搬到本站，直接排除。
const TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif'],
  ['image/bmp', 'bmp'],
]);
const EXTENSIONS = new Set([...TYPES.values(), 'jpeg']);
const SIGNATURES = {
  jpg: [0xff, 0xd8, 0xff],
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  gif: [0x47, 0x49, 0x46],
  bmp: [0x42, 0x4d],
};

const IMG_SRC = /<img\b[^>]*\bsrc="([^"]*)"[^>]*>/g;

function unescapeAttribute(value) {
  return String(value ?? '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function startsWith(bytes, values) {
  return values.every((value, index) => bytes[index] === value);
}

// content-type 会说谎（源站常把 404 页当 image/png 发回来）：动手写盘前先对一下文件头。
function looksLikeImage(bytes, ext) {
  if (!bytes?.byteLength) return false;
  if (ascii(bytes, 0, 4) === 'RIFF') return ascii(bytes, 8, 4) === 'WEBP';
  if (ascii(bytes, 4, 4) === 'ftyp') return ['avif', 'avis'].includes(ascii(bytes, 8, 4));
  const signature = SIGNATURES[ext];
  return signature ? startsWith(bytes, signature) : false;
}

// 正文里的配图地址。sanitizeArticle 已把相对地址转成绝对地址，这里只去重并还原属性里的 &amp;。
export function imageUrls(html) {
  const urls = [];
  for (const match of String(html ?? '').matchAll(IMG_SRC)) {
    const src = unescapeAttribute(match[1]);
    if (!/^https?:\/\//i.test(src)) continue;
    if (!urls.includes(src)) urls.push(src);
  }
  return urls;
}

export function imageKey(url) {
  return createHash('sha256').update(String(url)).digest('hex').slice(0, 16);
}

// 文件名留着原 URL 末尾几段：lcz.me 的表情图仍带着 emoji，
// itemImage() 那条「图标/头像不算配图」的判断换成本地地址后也才不会失效。
function slugOf(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'image';
  }
  const clean = (part) => part.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const pathWords = parsed.pathname
    .split('/')
    .map((part) => clean(part.replace(/\.[A-Za-z0-9]{1,5}$/, '')))
    .filter(Boolean);
  const hostWords = parsed.hostname.replace(/^www\./, '').split('.').map(clean).filter(Boolean);
  const words = pathWords.length ? pathWords.slice(-3) : hostWords.slice(-2);
  return (words.join('-') || 'image').slice(0, 64);
}

function extensionOf(url, contentType) {
  const type = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (TYPES.has(type)) return TYPES.get(type);
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const ext = /\.([A-Za-z0-9]+)$/i.exec(pathname)?.[1]?.toLowerCase() ?? '';
  return EXTENSIONS.has(ext) ? ext : null;
}

export function emptyManifest() {
  return { version: 1, images: {} };
}

export async function readManifest(imagesDir) {
  try {
    const raw = JSON.parse(await readFile(path.join(imagesDir, 'manifest.json'), 'utf8'));
    const images = raw?.images && typeof raw.images === 'object' ? raw.images : {};
    return { version: 1, images };
  } catch {
    return emptyManifest();
  }
}

export async function writeManifest(imagesDir, manifest) {
  const images = Object.fromEntries(Object.entries(manifest.images ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  await mkdir(imagesDir, { recursive: true });
  await writeFile(path.join(imagesDir, 'manifest.json'), `${JSON.stringify({ version: manifest.version ?? 1, images }, null, 2)}\n`);
}

// 采集环节存图：只存这一批入选条目正文里的图，已在盘上的直接复用，不再向源站重复要一份。
export async function saveImages(items, { imagesDir, manifest = null, fetchImpl = fetchBytes, limits = {}, log = () => {} } = {}) {
  const maxBytes = Number(limits.maxBytesPerImage ?? 4_194_304);
  const perItem = Number(limits.maxImagesPerItem ?? 8);
  const perRun = Number(limits.maxImagesPerRun ?? 150);
  const store = manifest ?? await readManifest(imagesDir);
  const stats = { saved: 0, cached: 0, failed: 0, skipped: 0, bytes: 0 };
  const wanted = new Map();
  for (const item of items ?? []) {
    for (const url of imageUrls(item?.content?.html).slice(0, perItem)) {
      if (wanted.has(url)) continue;
      if (wanted.size >= perRun) {
        stats.skipped += 1;
        continue;
      }
      wanted.set(url, { title: item.title ?? item.url ?? url, referer: item.url ?? '' });
    }
  }
  const present = new Set(await readdir(imagesDir).catch(() => []));
  for (const [url, owner] of wanted) {
    const key = imageKey(url);
    const known = store.images[key];
    if (known && present.has(known.file)) {
      stats.cached += 1;
      continue;
    }
    const result = await fetchImpl(url, {
      timeoutMs: 20_000,
      retries: 1,
      maxBytes,
      // 图床普遍防热链：不说明「谁在引用这张图」就吃 403（量子位的 i.qbitai.com 实测如此）。
      headers: owner.referer ? { referer: owner.referer } : {},
    });
    const ext = result.ok ? extensionOf(url, result.contentType) : null;
    if (!result.ok || !ext || !looksLikeImage(result.bytes, ext)) {
      stats.failed += 1;
      log(`${owner.title} 的配图存不下：${url} → ${result.error ?? `不是可存的图片（${result.contentType ?? '无类型'}）`}`);
      continue;
    }
    const file = `${slugOf(url)}-${key}.${ext}`;
    await mkdir(imagesDir, { recursive: true });
    await writeFile(path.join(imagesDir, file), result.bytes);
    store.images[key] = {
      url,
      file,
      bytes: result.bytes.byteLength,
      contentType: result.contentType ?? '',
      savedAt: new Date().toISOString(),
    };
    present.add(file);
    stats.saved += 1;
    stats.bytes += result.bytes.byteLength;
  }
  if (stats.saved) await writeManifest(imagesDir, store);
  return { manifest: store, ...stats };
}

// 存图有期限：过期副本删掉，对应条目退回热链原图。不删的话仓库只会一直涨。
export async function pruneImages(imagesDir, manifest, { retentionDays = 60, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
  let removed = 0;
  for (const [key, entry] of Object.entries(manifest?.images ?? {})) {
    if (String(entry?.savedAt ?? '') >= cutoff) continue;
    await unlink(path.join(imagesDir, entry.file)).catch(() => null);
    delete manifest.images[key];
    removed += 1;
  }
  if (removed) await writeManifest(imagesDir, manifest);
  return removed;
}

// 构建环节换址：本地副本在就换成本地地址，不在就保留原来的外链。
// 构建不联网，所以缺件时宁可继续热链，也绝不留下一个指向不存在文件的坏图。
export async function localizeItems(items, { imagesDir, manifest }) {
  const present = new Set(await readdir(imagesDir).catch(() => []));
  const files = new Map();
  let localized = 0;
  let remote = 0;
  for (const item of items ?? []) {
    const html = item?.content?.html;
    if (!html) continue;
    const next = String(html).replace(IMG_SRC, (tag, raw) => {
      const url = unescapeAttribute(raw);
      const entry = manifest?.images?.[imageKey(url)];
      if (!entry || !present.has(entry.file)) {
        remote += 1;
        return tag;
      }
      files.set(entry.file, entry.url ?? url);
      localized += 1;
      return tag.replace(raw, () => `${IMAGE_PREFIX}/${entry.file}`);
    });
    if (next !== html) item.content.html = next;
  }
  return { files, localized, remote };
}
