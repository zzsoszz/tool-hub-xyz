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
  renderSubsectionPage,
  renderTagsIndex,
} from './lib/render.mjs';
import {
  archivePeriods,
  archiveYears,
  flattenItems,
  itemsForSection,
  itemsForSubsection,
  itemsIndex,
  itemSlug,
  subsectionsFor,
} from './lib/items.mjs';
import { monthsFor, sortEntries } from './lib/listview.mjs';
import { digestToMarkdown } from './lib/markdown.mjs';

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
  const homeLimit = Number(process.env.HOME_LIMIT ?? sectionsConfig.homeLimit ?? 10);
  const filterConfig = await loadJson(path.join(ROOT, 'config/filters.json'), {});
  const tagConfig = filterConfig.tags ?? [];
  const tagLabels = Object.fromEntries(tagConfig.map((tag) => [tag.id, tag.label]));
  const subcategories = filterConfig.subcategories ?? [];
  const subLabels = new Map(subcategories.map((sub) => [`${sub.parent}/${sub.id}`, sub.label]));
  const digests = await loadDigests(path.join(dataDir, 'digests'));
  if (!digests.length) {
    console.error('build: data/digests 为空，先运行 npm run collect');
    process.exitCode = 1;
    return;
  }
  // 管理员在页面上下架的条目：构建期直接剔除，归档、子类计数与 Markdown 导出都不会再带上它们。
  const hiddenSlugs = new Set((await loadJson(path.join(dataDir, 'hidden.json'), { slugs: [] })).slugs ?? []);
  let hiddenCount = 0;
  if (hiddenSlugs.size) {
    for (const digest of digests) {
      let removed = 0;
      for (const group of digest.categories ?? []) {
        const kept = (group.items ?? []).filter((item) => !hiddenSlugs.has(item.slug));
        removed += (group.items?.length ?? 0) - kept.length;
        group.items = kept;
      }
      if (removed && digest.counts) digest.counts.published = Math.max(0, Number(digest.counts.published ?? 0) - removed);
      hiddenCount += removed;
    }
  }
  await rm(distDir, { recursive: true, force: true });

  const days = digests.map((digest) => digest.day);
  const latest = digests[0];
  const allItems = flattenItems(digests);
  for (const item of allItems) {
    item.subcategoryLabel = item.subcategory ? subLabels.get(`${item.category}/${item.subcategory}`) ?? null : null;
  }
  const recentCutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  const recentItems = allItems.filter((item) => new Date(item.published ?? `${item.day}T00:00:00Z`) >= recentCutoff);
  const navSections = sections.filter((section) => section.id !== 'discuss' && section.id !== 'archive');
  const common = { sections, siteUrl: base, repoUrl: repo, days, tagLabels };

  await write(path.join(distDir, 'index.html'), renderDigestPage(latest, { ...common, sectionId: 'latest', limit: homeLimit }));
  for (const digest of digests) {
    const isLatest = digest.day === latest.day;
    await write(
      path.join(distDir, 'day', `${digest.day}.html`),
      renderDigestPage(digest, { ...common, sectionId: isLatest ? 'latest' : null }),
    );
  }

  let sectionCount = 0;
  const sectionUrls = [];
  const subUrls = [];
  for (const section of sections) {
    if (!section.categories?.length) continue;
    const items = sortEntries(itemsForSection(allItems, section, { lookbackDays }), 'quality');
    const subs = subsectionsFor(section, subcategories)
      .map((sub) => ({ ...sub, items: sortEntries(itemsForSubsection(allItems, section, sub, { lookbackDays }), 'quality') }))
      .map((sub) => ({ ...sub, count: sub.items.length }))
      .sort((a, b) => b.count - a.count);
    const view = { ...section, subsections: subs.map(({ id, label, count }) => ({ id, label, count })) };
    await write(
      path.join(distDir, 's', `${section.id}.html`),
      renderSectionPage({ ...common, section: view, items, lookbackDays, months: monthsFor(items) }),
    );
    sectionCount += 1;
    sectionUrls.push(`${base}/s/${section.id}`);
    for (const sub of subs) {
      await write(
        path.join(distDir, 's', section.id, `${sub.id}.html`),
        renderSubsectionPage({ ...common, section: view, sub, items: sub.items, lookbackDays, months: monthsFor(sub.items) }),
      );
      subUrls.push(`${base}/s/${section.id}/${sub.id}`);
    }
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
  const tagItems = tagConfig.map((tag) => ({ tag, items: sortEntries(recentItems.filter((item) => (item.tags ?? []).includes(tag.id)).slice(0, 60), 'quality') }));
  const tagCounts = Object.fromEntries(tagItems.map(({ tag, items }) => [tag.id, items.length]));
  await write(path.join(distDir, 'tags.html'), renderTagsIndex({ ...common, tags: tagConfig, counts: tagCounts }));
  let tagPageCount = 0;
  const tagUrls = [];
  for (const { tag, items } of tagItems) {
    await write(
      path.join(distDir, 't', `${tag.id}.html`),
      renderTagPage({ ...common, tag, items, tags: tagConfig, lookbackDays, months: monthsFor(items) }),
    );
    tagPageCount += 1;
    if (items.length) tagUrls.push(`${base}/t/${tag.id}`);
  }
  await write(
    path.join(distDir, 'about.html'),
    renderAboutPage({ ...common, sources: latest.sources ?? [] }),
  );
  const periods = archivePeriods(allItems);
  const years = archiveYears(periods);
  const monthLabel = (period) => `${period.year} 年 ${Number(period.month)} 月`;
  const archiveMonths = monthsFor(allItems);
  const monthChips = periods.map((period) => ({ label: monthLabel(period), href: `/archive/${period.key}`, count: period.items.length }));
  const yearChips = years.map((entry) => ({ label: `${entry.year} 年`, href: `/archive/${entry.year}`, count: entry.count }));
  const chipsFor = (period) => ({
    monthChips: monthChips.map((chip) => ({ ...chip, active: chip.href === (period ? `/archive/${period.key}` : '/archive') })),
    yearChips: yearChips.map((chip) => ({ ...chip, active: period ? chip.href === `/archive/${period.year}` : chip.href === `/archive/${years[0]?.year}` })),
  });
  const archiveUrls = [];
  await write(
    path.join(distDir, 'archive.html'),
    renderArchive({
      ...common,
      digests,
      monthChips: monthChips.map((chip) => ({ ...chip, active: false })),
      yearChips: yearChips.map((chip) => ({ ...chip, active: false })),
      // 归档首页放全部条目：年/月筛选才有可筛的池，排序默认按质量评分。
      current: { label: '全部归档条目', items: sortEntries(allItems, 'quality') },
      months: archiveMonths,
    }),
  );
  for (const period of periods) {
    await write(
      path.join(distDir, 'archive', `${period.key}.html`),
      renderArchive({ ...common, digests, ...chipsFor(period), current: { label: monthLabel(period), items: period.items } }),
    );
    archiveUrls.push(`${base}/archive/${period.key}`);
  }
  for (const year of years) {
    const items = sortEntries(year.periods.flatMap((period) => period.items), 'quality');
    await write(
      path.join(distDir, 'archive', `${year.year}.html`),
      renderArchive({
        ...common,
        digests,
        monthChips: monthChips.map((chip) => ({ ...chip, active: false })),
        yearChips: yearChips.map((chip) => ({ ...chip, active: chip.href === `/archive/${year.year}` })),
        current: { label: `${year.year} 年`, items },
        months: monthsFor(items),
        year: year.year,
      }),
    );
    archiveUrls.push(`${base}/archive/${year.year}`);
  }
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
    ...subUrls,
    ...archiveUrls,
    ...days.map((day) => `${base}/day/${day}`),
    ...itemUrls,
  ];
  await write(path.join(distDir, 'sitemap.xml'), htmlSitemap(base, sitemapUrls));
  await write(path.join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  for (const digest of digests) {
    await write(path.join(distDir, 'markdown', `${digest.day}.md`), digestToMarkdown(digest, { siteUrl: base }));
  }
  await cp(path.join(ROOT, 'public'), distDir, { recursive: true });
  // 浏览器端脚本要 import 同一份排序/筛选规则，所以把这个共享模块也发一份到站点里。
  await cp(path.join(ROOT, 'src', 'lib', 'listview.mjs'), path.join(distDir, 'listview.mjs'));

  const pageCount = 1 + days.length + sectionCount + subUrls.length + itemCount + tagPageCount + 5;
  const hiddenNote = hiddenCount ? ` · 剔除下架 ${hiddenCount} 条` : '';
  console.log(`build: dist ready (${digests.length} digests, ${pageCount} html + ${days.length} markdown: ${days.length} 日报 / ${sectionCount} 栏目 / ${subUrls.length} 子类 / ${tagPageCount} 标签 / ${itemCount} 条目 / 5 固定页, latest ${latest.day}${hiddenNote})`);
}

await main();
