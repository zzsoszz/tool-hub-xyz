// 用当前 config/filters.json 重新给历史日报打分类/子类/标签，并按现行质量闸门重筛。
// 配置改了以后不必重新采集：node scripts/reclassify.mjs [--dry] [--data=data]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFilter } from '../src/lib/filter.mjs';
import { itemSlug, rankCompare } from '../src/lib/items.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const dataDir = path.join(ROOT, (args.find((arg) => arg.startsWith('--data=')) ?? '--data=data').slice(7));
  const filters = await loadJson('config/filters.json', {});
  const sources = await loadJson('config/sources.json', { sources: [] });
  const sourceById = new Map((sources.sources ?? []).map((source) => [source.id, source]));
  const filter = createFilter(filters);
  const subLabels = new Map(filter.subcategories.map((sub) => [`${sub.parent}/${sub.id}`, sub.label]));

  const names = (await readdir(path.join(dataDir, 'digests')).catch(() => []))
    .filter((name) => name.endsWith('.json'))
    .sort();
  let kept = 0;
  let dropped = 0;
  const reasons = new Map();
  const categoryCount = new Map();

  for (const name of names) {
    const file = path.join(dataDir, 'digests', name);
    const digest = JSON.parse(await readFile(file, 'utf8'));
    const items = (digest.categories ?? []).flatMap((group) => group.items ?? []);
    const survivors = [];
    for (const item of items) {
      item.slug ??= itemSlug(item);
      item.category = filter.categorize(item);
      item.practical = filter.practicality(item);
      item.action = filter.actionability({ ...item, category: item.category });
      const verdict = filter.quality(item, sourceById.get(item.sourceId));
      if (!verdict.ok) {
        dropped += 1;
        const reason = verdict.reasons[0] ?? '质量不足';
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        continue;
      }
      item.quality = verdict.score;
      item.tags = filter.tagsFor(item);
      item.subcategory = filter.subcategoryFor(item, item.category);
      item.subcategoryLabel = item.subcategory ? subLabels.get(`${item.category}/${item.subcategory}`) : null;
      item.rank = Number(((item.quality ?? 0) + item.action * Number(filters.quality?.actionWeight ?? 1.6)).toFixed(2));
      categoryCount.set(item.category, (categoryCount.get(item.category) ?? 0) + 1);
      survivors.push(item);
    }
    const grouped = new Map();
    for (const category of filter.categories) grouped.set(category.id, { id: category.id, label: category.label, items: [] });
    for (const item of survivors) grouped.get(item.category)?.items.push(item);
    for (const group of grouped.values()) group.items.sort(rankCompare);
    digest.categories = [...grouped.values()];
    digest.counts = { ...(digest.counts ?? {}), published: survivors.length, reclassified: items.length - survivors.length };
    digest.reclassifiedAt = new Date().toISOString();
    kept += survivors.length;
    if (!dry) await writeFile(file, `${JSON.stringify(digest, null, 2)}\n`);
  }

  console.log(`reclassify ${dry ? '(dry) ' : ''}${names.length} 份日报: 保留 ${kept} 条，淘汰 ${dropped} 条`);
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  淘汰 ${count} 条 <- ${reason}`);
  for (const { id, label } of filter.categories) console.log(`  ${label}: ${categoryCount.get(id) ?? 0}`);
}

await main();
