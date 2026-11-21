import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pruneImages, publishedImageKeys, referencedImageKeys, saveImages } from '../src/lib/images.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    flags[key] = value === undefined ? true : value;
  }
  return flags;
}

// 给已经在 data/digests 里的条目补存正文配图：只下载、只写 data/images，不改日报一个字。
// 不带 --days 就是全部日报，构建前的那一次就该覆盖全部发布页。
async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const dataDir = path.join(ROOT, flags.out ?? 'data');
  const config = JSON.parse(await readFile(path.join(ROOT, 'config/sources.json'), 'utf8'));
  const digestDir = path.join(dataDir, 'digests');
  const names = (await readdir(digestDir).catch(() => [])).filter((name) => name.endsWith('.json')).sort().reverse();
  if (!names.length) {
    console.error('fetch-images: data/digests 为空，先运行 npm run collect');
    process.exitCode = 1;
    return;
  }
  const days = flags.days ? Number(flags.days) : names.length;
  const hidden = new Set((JSON.parse(await readFile(path.join(dataDir, 'hidden.json'), 'utf8').catch(() => '{"slugs":[]}'))).slugs ?? []);
  const items = [];
  for (const name of names.slice(0, days)) {
    const digest = JSON.parse(await readFile(path.join(digestDir, name), 'utf8'));
    for (const group of digest.categories ?? []) {
      for (const item of group.items ?? []) {
        if (item.slug && hidden.has(item.slug)) continue;
        items.push(item);
      }
    }
  }
  const limits = { ...(config.images ?? {}) };
  if (flags.limit) limits.maxImagesPerRun = Number(flags.limit);
  const imagesDir = path.join(dataDir, 'images');
  const outcome = await saveImages(items, { imagesDir, limits, log: (message) => console.warn(`[images] ${message}`) });
  let dropped = 0;
  if (!flags['no-prune']) {
    const keepKeys = await publishedImageKeys(digestDir);
    for (const key of referencedImageKeys(items)) keepKeys.add(key);
    dropped = await pruneImages(imagesDir, outcome.manifest, { retentionDays: Number(limits.retentionDays ?? 30), keepKeys });
  }
  console.log(`fetch-images: 条目=${items.length} 存下=${outcome.saved} 复用=${outcome.cached} 存不下=${outcome.failed} 超预算=${outcome.skipped} 过期删=${dropped}（${outcome.bytes} 字节）`);
}

await main();
