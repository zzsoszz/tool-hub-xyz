import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFilter } from './lib/filter.mjs';
import { filterNewItems, itemKeys, normalizeSeen, pruneSeen, serializeSeen } from './lib/dedupe.mjs';
import { dayKey } from './lib/normalize.mjs';
import { selectByCategoryQuota } from './lib/select.mjs';
import { fetchAllSources, parseSourceBody } from './lib/sources.mjs';
import { itemSlug, rankCompare } from './lib/items.mjs';
import { translateConfig, translateItems } from './lib/translate.mjs';

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

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function offlineResults(sources, fixturesDir) {
  const results = [];
  for (const source of sources) {
    const candidates = [`${source.id}.json`, `${source.id}.xml`, `${source.id}.rss.xml`, `${source.id}.atom.xml`];
    let body = null;
    for (const name of candidates) {
      try {
        body = await readFile(path.join(fixturesDir, name), 'utf8');
        break;
      } catch {
        continue;
      }
    }
    if (body === null) {
      results.push({ source, url: 'fixture://missing', ok: false, items: [], status: 0, error: '本地样例缺失' });
      continue;
    }
    try {
      results.push({ source, url: 'fixture://local', ok: true, items: parseSourceBody(source, body), status: 200, error: null });
    } catch (error) {
      results.push({ source, url: 'fixture://local', ok: false, items: [], status: 0, error: `解析失败: ${error.message}` });
    }
  }
  return results;
}

function publishedItemsOf(digest) {
  return (digest?.categories ?? []).flatMap((group) => group.items);
}

function acceptedKeysOf(previousItems) {
  const accepted = new Set();
  for (const item of previousItems) {
    for (const key of itemKeys(item)) accepted.add(key);
  }
  return accepted;
}

function summarizeSources(results) {
  return results.map((result) => ({
    id: result.source.id,
    name: result.source.name,
    ok: result.ok,
    items: result.items.length,
    error: result.error ?? null,
  }));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const config = await readJson(path.join(ROOT, 'config/sources.json'));
  const filters = await readJson(path.join(ROOT, 'config/filters.json'));
  const timezone = flags.timezone ?? config.timezone ?? 'Asia/Shanghai';
  const now = new Date();
  const day = flags.date ?? dayKey(now, timezone);
  const defaultWindow = Number(flags['window-hours'] ?? config.windowHours ?? 48);
  const dataDir = path.join(ROOT, flags.out ?? 'data');
  const digestDir = path.join(dataDir, 'digests');
  const digestPath = path.join(digestDir, `${day}.json`);
  const filter = createFilter(filters);
  const actionWeight = Number(filters.quality?.actionWeight ?? 1.5);
  const sourceById = new Map(config.sources.map((source) => [source.id, source]));
  const cutoffCache = new Map();
  const statePath = path.join(dataDir, 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => 'null'));
  const maxLookback = Number(config.maxLookbackHours ?? 168);
  const incrementalFrom = state?.lastRunAt
    ? new Date(Math.max(new Date(state.lastRunAt).getTime() - 6 * 3_600_000, now.getTime() - maxLookback * 3_600_000)).toISOString()
    : null;

  const windowCutoff = (sourceId) => {
    const hours = Number(sourceById.get(sourceId)?.windowHours ?? defaultWindow);
    if (!cutoffCache.has(hours)) cutoffCache.set(hours, new Date(now.getTime() - hours * 3_600_000).toISOString());
    return cutoffCache.get(hours);
  };

  const results = flags.offline
    ? await offlineResults(config.sources, path.join(ROOT, flags.fixtures ?? 'tests/fixtures'))
    : await fetchAllSources(config.sources, {
        concurrency: Number(flags.concurrency ?? 5),
        timeoutMs: Number(flags.timeout ?? 15_000),
        retries: Number(flags.retries ?? 2),
      });

  const fetched = results.flatMap((result) => result.items);
  const seenPath = path.join(dataDir, 'seen.json');
  const seenRaw = await readFile(seenPath, 'utf8').catch(() => null);
  const seen = normalizeSeen(seenRaw ? JSON.parse(seenRaw) : null);
  const previousDigest = JSON.parse(await readFile(digestPath, 'utf8').catch(() => 'null'));
  const published = publishedItemsOf(previousDigest);
  const accepted = acceptedKeysOf(published);

  const unseen = [];
  let carried = 0;
  for (const item of fetched) {
    const keys = itemKeys(item);
    if (keys.length && accepted.has(keys[0])) {
      carried += 1;
      continue;
    }
    unseen.push(item);
  }
  const { fresh, duplicates } = filterNewItems(unseen, seen, { day });

  const perSourceCap = Number(config.maxItemsPerSource ?? 12);
  const usedPerSource = new Map();
  for (const item of published) usedPerSource.set(item.sourceId, (usedPerSource.get(item.sourceId) ?? 0) + 1);

  const eligibleBySource = new Map();
  const lowQuality = [];
  for (const item of fresh) {
    const source = sourceById.get(item.sourceId);
    if (!filter.isRelevant(item)) continue;
    if (!filter.passesGuards(item, source)) continue;
    const quality = filter.quality(item, source);
    if (!quality.ok) {
      lowQuality.push(quality.reasons[0] ?? '质量不足');
      continue;
    }
    item.quality = quality.score;
    if (!eligibleBySource.has(item.sourceId)) eligibleBySource.set(item.sourceId, []);
    eligibleBySource.get(item.sourceId).push(item);
  }

  const fallbackCount = Number(config.fallbackItemsPerSource ?? 3);
  const oldestAllowed = new Date(now.getTime() - (config.maxAgeDays ?? 14) * 86_400_000).toISOString();
  const additions = [];
  let fallbackUsed = 0;
  for (const [sourceId, eligible] of eligibleBySource) {
    const cutoff = incrementalFrom ?? windowCutoff(sourceId);
    const inWindow = [];
    const older = [];
    for (const item of eligible) {
      if (!item.published || item.published >= cutoff) inWindow.push(item);
      else older.push(item);
    }
    older.sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')));
    const room = Math.max(0, perSourceCap - (usedPerSource.get(sourceId) ?? 0));
    let chosen = inWindow.slice(0, room);
    if (!chosen.length) {
      chosen = older.filter((item) => item.published && item.published >= oldestAllowed).slice(0, fallbackCount);
      for (const item of chosen) item.fallback = true;
      fallbackUsed += chosen.length;
    }
    for (const item of chosen) {
      usedPerSource.set(sourceId, (usedPerSource.get(sourceId) ?? 0) + 1);
      item.score = filter.score(item, now);
      item.category = filter.categorize(item);
      item.practical = filter.practicality(item);
      additions.push(item);
    }
  }

  const limit = Number(flags.limit ?? config.maxItemsPerDay ?? 30);
  const pinned = [...published]
    .filter((item) => {
      const quality = item.quality ?? filter.quality(item, sourceById.get(item.sourceId));
      const ok = typeof quality === 'object' ? quality.ok : true;
      if (ok) item.quality = typeof quality === 'object' ? quality.score : quality;
      else lowQuality.push('旧条目质量不足');
      return ok;
    })
    .sort(rankCompare);
  const selected = pinned.slice(0, limit);
  const room = limit - selected.length;
  if (room > 0) {
    selected.push(...selectByCategoryQuota(additions, { limit: room, categoryOrder: filters.categories.map((category) => category.id) }));
  }

  const translateRequested = flags.translate || (Boolean(process.env.TRANSLATE_API_KEY) && !flags['no-translate']);
  const cloudflareReady = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
  const wantsTranslation = translateRequested || (cloudflareReady && !flags['no-translate']);
  if (wantsTranslation) {
    const outcome = await translateItems(selected.filter((item) => !item.zhTitle), {
      config: translateConfig(),
      log: (message) => console.warn(`[translate] ${message}`),
    });
    console.log(`translate: ok=${outcome.translated} failed=${outcome.failed} 中文源跳过=${outcome.skipped}`);
  }

  const grouped = new Map();
  for (const category of filter.categories) grouped.set(category.id, { id: category.id, label: category.label, items: [] });
  for (const item of selected) {
    item.slug ??= itemSlug(item);
    item.category ??= filter.categorize(item);
    item.practical ??= filter.practicality(item);
    item.quality ??= filter.quality(item, sourceById.get(item.sourceId)).score;
    item.action = filter.actionability(item);
    item.rank = Number(((item.quality ?? 0) + item.action * actionWeight).toFixed(2));
    item.tags = filter.tagsFor(item);
    grouped.get(item.category)?.items.push(item);
  }
  for (const group of grouped.values()) group.items.sort(rankCompare);

  const digest = {
    day,
    generatedAt: now.toISOString(),
    timezone,
    windowHours: defaultWindow,
    counts: {
      sources: config.sources.length,
      okSources: results.filter((result) => result.ok).length,
      fetched: fetched.length,
      duplicates: duplicates.length,
      carried,
      added: selected.filter((item) => !published.includes(item)).length,
      fallback: selected.filter((item) => item.fallback).length,
      lowQuality: lowQuality.length,
      published: selected.length,
    },
    sources: summarizeSources(results),
    categories: [...grouped.values()].filter((group) => group.items.length),
  };

  await mkdir(digestDir, { recursive: true });
  pruneSeen(seen, { retentionDays: config.seenRetentionDays ?? 45, timezone, now });
  await writeFile(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
  await writeFile(seenPath, `${JSON.stringify(serializeSeen(seen), null, 2)}\n`);
  await writeFile(statePath, `${JSON.stringify({ version: 1, day, lastRunAt: now.toISOString() }, null, 2)}\n`);

  const qualityTally = lowQuality.length
    ? ` 质量淘汰=${lowQuality.length}（${Object.entries(lowQuality.reduce((acc, reason) => { acc[reason] = (acc[reason] ?? 0) + 1; return acc; }, {})).map(([reason, count]) => `${reason}×${count}`).join(' ')}）`
    : '';
  const distribution = digest.categories.map((group) => `${group.label}=${group.items.length}`).join(' ');
  const mode = incrementalFrom ? `增量(自 ${state.lastRunAt})` : '首次全量';
  console.log(`collect ${day} ${mode}: sources=${digest.counts.okSources}/${config.sources.length} fetched=${digest.counts.fetched} dup=${digest.counts.duplicates} carried=${digest.counts.carried} added=${digest.counts.added} 兜底=${digest.counts.fallback} published=${digest.counts.published}`);
  if (qualityTally) console.log(qualityTally);
  console.log(`  分布: ${distribution}`);
  for (const source of digest.sources) {
    if (!source.ok) console.log(`  ERR ${source.id.padEnd(20)} ${source.error ?? ''}`);
  }

  if (digest.counts.okSources === 0) {
    console.error('所有信息源均抓取失败，已保留上一版站点（不发布空日报）。');
    process.exitCode = 2;
  }
}

await main();
