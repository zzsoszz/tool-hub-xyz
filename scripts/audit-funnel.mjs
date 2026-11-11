// 采集漏斗审计：每个信息源抓到多少条、死在哪一关、其中多少条是「压根没有正文」。
// node scripts/audit-funnel.mjs [--only=id,id] [--concurrency=5]
// 只读，不写 data/，用来判断该扩哪个源、该给哪个源开 fetchBody。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFilter } from '../src/lib/filter.mjs';
import { fetchAllSources } from '../src/lib/sources.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function flag(name, fallback) {
  const arg = process.argv.slice(2).find((entry) => entry.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

const config = JSON.parse(await readFile(path.join(ROOT, 'config/sources.json'), 'utf8'));
const filters = JSON.parse(await readFile(path.join(ROOT, 'config/filters.json'), 'utf8'));
const filter = createFilter(filters);
const only = (flag('only', '') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
const sources = only.length ? config.sources.filter((source) => only.includes(source.id)) : config.sources;

const results = await fetchAllSources(sources, {
  concurrency: Number(flag('concurrency', 5)),
  timeoutMs: 15_000,
  retries: 2,
  searchKeywords: config.searchKeywords ?? [],
  timezone: config.timezone,
  worthEnriching: (item, source) => filter.isRelevant(item) && filter.passesGuards(item, source),
});

const rows = [];
for (const result of results) {
  const source = config.sources.find((entry) => entry.id === result.source.id);
  const stats = { id: source.id, fetched: result.items.length, queries: result.queries ?? 1, irrelevant: 0, guard: 0, killed: 0, bodyless: 0, eligible: 0, chars: [], categories: new Map(), reasons: new Map() };
  for (const item of result.items) {
    if (!filter.isRelevant(item)) { stats.irrelevant += 1; continue; }
    if (!filter.passesGuards(item, source)) { stats.guard += 1; continue; }
    const quality = filter.quality(item, source);
    if (!quality.ok) {
      stats.killed += 1;
      const reason = quality.reasons[0] ?? '质量不足';
      stats.reasons.set(reason, (stats.reasons.get(reason) ?? 0) + 1);
      if (!item.content) stats.bodyless += 1;
      continue;
    }
    stats.eligible += 1;
    stats.chars.push(Math.max(String(item.summary ?? '').length, String(item.content?.text ?? '').length));
    const category = filter.categorize(item);
    stats.categories.set(category, (stats.categories.get(category) ?? 0) + 1);
  }
  stats.avg = stats.chars.length ? Math.round(stats.chars.reduce((a, b) => a + b, 0) / stats.chars.length) : 0;
  rows.push(stats);
}

rows.sort((a, b) => b.eligible - a.eligible || b.fetched - a.fetched);
const column = (value, width) => String(value).padStart(width);
console.log('源'.padEnd(20), '检索'.padStart(5), '抓到'.padStart(6), '无关'.padStart(6), '门槛'.padStart(6), '闸门'.padStart(6), '无正文'.padStart(7), '合格'.padStart(6), '均正文'.padStart(7));
for (const row of rows) {
  console.log(
    row.id.padEnd(20),
    column(row.queries, 5),
    column(row.fetched, 6),
    column(row.irrelevant, 6),
    column(row.guard, 6),
    column(row.killed, 6),
    column(row.bodyless, 7),
    column(row.eligible, 6),
    column(row.avg, 7),
  );
}

const totalReasons = new Map();
for (const row of rows) for (const [reason, count] of row.reasons) {
  totalReasons.set(reason, (totalReasons.get(reason) ?? 0) + count);
}
const killed = [...totalReasons.values()].reduce((a, b) => a + b, 0);
const bodyless = rows.reduce((a, row) => a + row.bodyless, 0);
const categories = new Map();
for (const row of rows) for (const [category, count] of row.categories) categories.set(category, (categories.get(category) ?? 0) + count);
console.log('\n闸门淘汰原因合计：');
for (const [reason, count] of [...totalReasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${reason.padEnd(28)} ${count}`);
console.log('\n合格条目的栏目归属：');
for (const [category, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(category).padEnd(12)} ${count}`);
console.log(`\n抓到 ${rows.reduce((a, row) => a + row.fetched, 0)} 条，闸门淘汰 ${killed} 条（其中 ${bodyless} 条完全没有正文），合格 ${rows.reduce((a, row) => a + row.eligible, 0)} 条。`);
