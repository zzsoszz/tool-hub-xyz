import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  renderAboutPage,
  renderArchive,
  renderDigestPage,
  renderDiscussPage,
  renderItemPage,
  renderLlms,
  renderNotFoundPage,
  renderRss,
  renderSearchPage,
  renderTagPage,
  renderSectionPage,
  renderSubsectionPage,
  renderBenchDatasetPage,
  renderBenchIndexPage,
  renderTagsIndex,
} from './lib/render.mjs';
import { LIST_PAGE_SIZE } from './lib/render.mjs';
import { datasetChartSvg } from './lib/bench.mjs';
import { localizeItems, readManifest } from './lib/images.mjs';
import {
  archivePeriods,
  archiveYears,
  flattenItems,
  itemsForSection,
  itemsForSubsection,
  itemsIndex,
  itemSlug,
  stampIssues,
  subsectionsFor,
} from './lib/items.mjs';
import { sortEntries } from './lib/listview.mjs';
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
  const actionWeight = Number(filterConfig.quality?.actionWeight ?? 1.6);
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
  // 期号、名次序号与「第几次上榜」在剔除下架条目之后才算，榜上的编号才和页面一致。
  stampIssues(digests);
  await rm(distDir, { recursive: true, force: true });

  // 正文配图换成本地副本：data/images 里有才换，没有就保留原来的外链。
  // 构建不联网，所以缺件时宁可继续热链，也绝不留一个指向不存在文件的坏图。
  const imagesDir = path.join(dataDir, 'images');
  const digestItems = digests.flatMap((digest) => (digest.categories ?? []).flatMap((group) => group.items ?? []));
  const images = await localizeItems(digestItems, { imagesDir, manifest: await readManifest(imagesDir) });
  if (images.files.size) {
    const distImages = path.join(distDir, 'images');
    await mkdir(distImages, { recursive: true });
    for (const file of images.files.keys()) await cp(path.join(imagesDir, file), path.join(distImages, file));
  }

  const days = digests.map((digest) => digest.day);
  const latest = digests[0];
  const allItems = flattenItems(digests);
  for (const item of allItems) {
    item.subcategoryLabel = item.subcategory ? subLabels.get(`${item.category}/${item.subcategory}`) ?? null : null;
  }
  const recentCutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  const recentItems = allItems.filter((item) => new Date(item.published ?? `${item.day}T00:00:00Z`) >= recentCutoff);
  const navSections = sections.filter((section) => section.id !== 'discuss' && section.id !== 'archive');
  const common = { sections, siteUrl: base, repoUrl: repo, days, digests, tagLabels, actionWeight };

  let listExtraPages = 0;
  // 查找型列表按页切开：第 1 页沿用原来的文件，之后每页写在同一目录的 p/N.html，
  // 这样每一页都放得下、也看得到真实收尾，翻页链接对读者和爬虫都成立。
  async function writeListPages(distFile, urlBase, itemCount, render) {
    const pageCount = Math.max(1, Math.ceil(itemCount / LIST_PAGE_SIZE));
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const url = pageNumber === 1 ? urlBase : `${urlBase}/p/${pageNumber}`;
      const target = pageNumber === 1 ? distFile : path.join(distDir, ...urlBase.split('/').filter(Boolean), 'p', `${pageNumber}.html`);
      if (pageNumber > 1) listExtraPages += 1;
      await write(target, render({ pageNumber, path: url }));
    }
    return pageCount;
  }

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
    await writeListPages(path.join(distDir, 's', `${section.id}.html`), `/s/${section.id}`, items.length, (pager) => (
      renderSectionPage({ ...common, section: view, items, lookbackDays, ...pager })
    ));
    sectionCount += 1;
    sectionUrls.push(`${base}/s/${section.id}`);
    for (const sub of subs) {
      await writeListPages(path.join(distDir, 's', section.id, `${sub.id}.html`), `/s/${section.id}/${sub.id}`, sub.items.length, (pager) => (
        renderSubsectionPage({ ...common, section: view, sub, items: sub.items, lookbackDays, ...pager })
      ));
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
    await writeListPages(path.join(distDir, 't', `${tag.id}.html`), `/t/${tag.id}`, items.length, (pager) => (
      renderTagPage({ ...common, tag, items, tags: tagConfig, lookbackDays, ...pager })
    ));
    tagPageCount += 1;
    if (items.length) tagUrls.push(`${base}/t/${tag.id}`);
  }
  await write(
    path.join(distDir, 'about.html'),
    renderAboutPage({ ...common, sources: latest.sources ?? [] }),
  );
  await write(path.join(distDir, '404.html'), renderNotFoundPage(common));
  const periods = archivePeriods(allItems);
  // 评测数据页：数字来自 data/bench/*.json（npm run bench 采集），中文表头与结论来自 config/bench.json。
  const benchConfig = await loadJson(path.join(ROOT, 'config', 'bench.json'), { datasets: [] });
  const benchEntries = [];
  for (const dataset of benchConfig.datasets ?? []) {
    const data = await loadJson(path.join(dataDir, 'bench', `${dataset.id}.json`), null);
    if (!data) {
      console.warn(`build: 缺少 data/bench/${dataset.id}.json（先跑 npm run bench），这一页暂时不生成`);
      continue;
    }
    benchEntries.push({ dataset, data });
  }
  const benchUrls = [];
  if (benchEntries.length) {
    await write(path.join(distDir, 'bench.html'), renderBenchIndexPage({ ...common, benchConfig, benchData: benchEntries }));
    benchUrls.push(`${base}/bench`);
    for (const entry of benchEntries) {
      const chart = datasetChartSvg(entry.dataset, entry.data);
      if (chart) await write(path.join(distDir, 'bench', `${entry.dataset.id}-chart.svg`), chart);
      await write(path.join(distDir, 'bench', `${entry.dataset.id}.json`), `${JSON.stringify(entry.data, null, 2)}\n`);
      await write(path.join(distDir, 'bench', `${entry.dataset.id}.html`), renderBenchDatasetPage({ ...common, benchConfig, ...entry }));
      benchUrls.push(`${base}/bench/${entry.dataset.id}`);
    }
  }
  const years = archiveYears(periods);
  const monthLabel = (period) => `${period.year} 年 ${Number(period.month)} 月`;
  const monthChips = periods.map((period) => ({ label: monthLabel(period), href: `/archive/${period.key}`, count: period.items.length }));
  const yearChips = years.map((entry) => ({ label: `${entry.year} 年`, href: `/archive/${entry.year}`, count: entry.count }));
  const chipsFor = (period) => ({
    monthChips: monthChips.map((chip) => ({ ...chip, active: chip.href === (period ? `/archive/${period.key}` : '/archive') })),
    yearChips: yearChips.map((chip) => ({ ...chip, active: period ? chip.href === `/archive/${period.year}` : chip.href === `/archive/${years[0]?.year}` })),
  });
  const archiveUrls = [];
  async function writeArchivePages(distFile, urlBase, props) {
    await writeListPages(distFile, urlBase, props.current?.items?.length ?? 0, (pager) => renderArchive({ ...props, ...pager }));
  }
  await writeArchivePages(path.join(distDir, 'archive.html'), '/archive', {
    ...common,
    digests,
    monthChips: monthChips.map((chip) => ({ ...chip, active: false })),
    yearChips: yearChips.map((chip) => ({ ...chip, active: false })),
    // 归档首页放按质量评分排好序的第一页；整月条目走下面的年 / 月入口。
    current: { label: '全部归档条目', items: sortEntries(allItems, 'quality') },
  });
  for (const period of periods) {
    await writeArchivePages(path.join(distDir, 'archive', `${period.key}.html`), `/archive/${period.key}`, {
      ...common,
      digests,
      ...chipsFor(period),
      current: { label: monthLabel(period), items: period.items },
    });
    archiveUrls.push(`${base}/archive/${period.key}`);
  }
  for (const year of years) {
    const items = sortEntries(year.periods.flatMap((period) => period.items), 'quality');
    await writeArchivePages(path.join(distDir, 'archive', `${year.year}.html`), `/archive/${year.year}`, {
      ...common,
      digests,
      monthChips: monthChips.map((chip) => ({ ...chip, active: false })),
      yearChips: yearChips.map((chip) => ({ ...chip, active: chip.href === `/archive/${year.year}` })),
      current: { label: `${year.year} 年`, items },
      year: year.year,
    });
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
    ...benchUrls,
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

  const pageCount = 1 + listExtraPages + days.length + sectionCount + subUrls.length + itemCount + tagPageCount + 5 + benchUrls.length;
  const hiddenNote = hiddenCount ? ` · 剔除下架 ${hiddenCount} 条` : '';
  const benchNote = benchEntries.length ? ` / ${benchEntries.length} 评测数据页` : '';
  const imageNote = images.files.size ? ` · 配图本地 ${images.localized} 张 / 外链 ${images.remote} 张` : '';
  console.log(`build: dist ready (${digests.length} digests, ${pageCount} html + ${days.length} markdown: ${days.length} 日报 / ${sectionCount} 栏目 / ${subUrls.length} 子类 / ${tagPageCount} 标签 / ${itemCount} 条目 / 5 固定页 / ${listExtraPages} 列表分页${benchNote}${imageNote}, latest ${latest.day}${hiddenNote})`);
}

await main();
