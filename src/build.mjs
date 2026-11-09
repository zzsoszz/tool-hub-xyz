import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  renderAboutPage,
  renderArchive,
  renderDigestPage,
  renderDiscussPage,
  renderItemPage,
  renderLlms,
  renderRss,
  renderSearchPage,
  renderTagPage,
  renderSectionPage,
  renderTagsIndex,
} from './lib/render.mjs';
import { flattenItems, itemsForSection, itemsIndex, itemSlug } from './lib/items.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function siteUrl() {
  return (process.env.SITE_URL ?? 'https://tool-hub.xyz').replace(/\/$/, '');
}

function repoUrl() {
  return process.env.REPO_URL ?? 'https://github.com/zzsoszz/tool-hub-xyz';
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function loadDigests(digestDir) {
  const names = await readdir(digestDir).catch(() => []);
  const digests = [];
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    try {
      digests.push(JSON.parse(await readFile(path.join(digestDir, name), 'utf8')));
    } catch (error) {
      console.warn(`[build] 跳过损坏的日报 ${name}: ${error.message}`);
    }
  }
  digests.sort((a, b) => (a.day < b.day ? 1 : -1));
  for (const digest of digests) {
    for (const group of digest.categories ?? []) {
      for (const item of group.items ?? []) {
        item.slug ??= itemSlug(item);
      }
    }
  }
  return digests;
}

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function htmlSitemap(base, urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>
`;
}

// 正文已经内嵌进条目页 HTML，/data/latest.json 只留正文长度，避免 JSON 体积膨胀。
function leanDigest(digest) {
  return {
    ...digest,
    categories: (digest.categories ?? []).map((group) => ({
      ...group,
      items: (group.items ?? []).map(({ content, ...rest }) => ({ ...rest, bodyChars: content?.chars ?? 0 })),
    })),
  };
}

async function main() {
  const dataDir = path.join(ROOT, process.env.DATA_DIR ?? 'data');
  const distDir = path.join(ROOT, process.env.DIST_DIR ?? 'dist');
  const base = siteUrl();
  const repo = repoUrl();
  const sectionsConfig = await loadJson(path.join(ROOT, 'config/sections.json'), { sections: [], sectionLookbackDays: 7 });
  const sections = sectionsConfig.sections ?? [];
  const lookbackDays = Number(sectionsConfig.sectionLookbackDays ?? 7);
  const itemPageDays = Number(process.env.ITEM_PAGE_DAYS ?? 30);
  const tagConfig = (await loadJson(path.join(ROOT, 'config/filters.json'), {}))?.tags ?? [];
  const digests = await loadDigests(path.join(dataDir, 'digests'));
  if (!digests.length) {
    console.error('build: data/digests 为空，先运行 npm run collect');
    process.exitCode = 1;
    return;
  }
  await rm(distDir, { recursive: true, force: true });

  const days = digests.map((digest) => digest.day);
  const latest = digests[0];
  const allItems = flattenItems(digests);
  const recentCutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  const recentItems = allItems.filter((item) => new Date(item.published ?? `${item.day}T00:00:00Z`) >= recentCutoff);
  const navSections = sections.filter((section) => section.id !== 'discuss' && section.id !== 'archive');
  const common = { sections, siteUrl: base, repoUrl: repo, days };

  await write(path.join(distDir, 'index.html'), renderDigestPage(latest, { ...common, sectionId: 'latest' }));
  for (const digest of digests) {
    const isLatest = digest.day === latest.day;
    await write(
      path.join(distDir, 'day', `${digest.day}.html`),
      renderDigestPage(digest, { ...common, sectionId: isLatest ? 'latest' : null }),
    );
  }

  let sectionCount = 0;
  const sectionUrls = [];
  for (const section of sections) {
    if (!section.categories?.length) continue;
    const items = itemsForSection(allItems, section, { lookbackDays });
    await write(path.join(distDir, 's', `${section.id}.html`), renderSectionPage({ ...common, section, items, lookbackDays }));
    sectionCount += 1;
    sectionUrls.push(`${base}/s/${section.id}`);
  }

  let itemCount = 0;
  const itemUrls = [];
  const dayWindow = new Set(days.slice(0, itemPageDays));
  for (const item of allItems) {
    if (!dayWindow.has(item.day)) continue;
    const related = allItems
      .filter((entry) => entry.slug !== item.slug && entry.category === item.category)
      .slice(0, 5);
    await write(path.join(distDir, 'item', `${item.slug}.html`), renderItemPage({ ...common, item, related }));
    itemCount += 1;
    if (itemUrls.length < 300) itemUrls.push(`${base}/item/${item.slug}`);
  }

  await write(path.join(distDir, 'discuss.html'), renderDiscussPage(common));
  await write(path.join(distDir, 'search.html'), renderSearchPage(common));
  const tagItems = tagConfig.map((tag) => ({ tag, items: recentItems.filter((item) => (item.tags ?? []).includes(tag.id)).slice(0, 60) }));
  const tagCounts = Object.fromEntries(tagItems.map(({ tag, items }) => [tag.id, items.length]));
  await write(path.join(distDir, 'tags.html'), renderTagsIndex({ ...common, tags: tagConfig, counts: tagCounts }));
  let tagPageCount = 0;
  const tagUrls = [];
  for (const { tag, items } of tagItems) {
    await write(path.join(distDir, 't', `${tag.id}.html`), renderTagPage({ ...common, tag, items, tags: tagConfig, lookbackDays }));
    tagPageCount += 1;
    if (items.length) tagUrls.push(`${base}/t/${tag.id}`);
  }
  await write(
    path.join(distDir, 'about.html'),
    renderAboutPage({ ...common, sources: latest.sources ?? [] }),
  );
  await write(path.join(distDir, 'archive.html'), renderArchive({ ...common, digests }));
  await write(path.join(distDir, 'feed.xml'), renderRss(latest, { siteUrl: base }));
  await write(path.join(distDir, 'llms.txt'), renderLlms(latest, { siteUrl: base }));
  await write(path.join(distDir, 'data', 'latest.json'), `${JSON.stringify(leanDigest(latest), null, 2)}\n`);
  await write(path.join(distDir, 'data', 'items.json'), `${JSON.stringify(itemsIndex(allItems), null, 2)}\n`);

  const sitemapUrls = [
    `${base}/`,
    `${base}/discuss`,
    `${base}/search`,
    `${base}/about`,
    `${base}/archive`,
    `${base}/tags`,
    ...tagUrls,
    ...sectionUrls,
    ...days.map((day) => `${base}/day/${day}`),
    ...itemUrls,
  ];
  await write(path.join(distDir, 'sitemap.xml'), htmlSitemap(base, sitemapUrls));
  await write(path.join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  await cp(path.join(ROOT, 'public'), distDir, { recursive: true });

  const pageCount = 1 + days.length + sectionCount + itemCount + tagPageCount + 5;
  console.log(`build: dist ready (${digests.length} digests, ${pageCount} html: ${days.length} 日报 / ${sectionCount} 栏目 / ${tagPageCount} 标签 / ${itemCount} 条目 / 5 固定页, latest ${latest.day})`);
}

await main();
