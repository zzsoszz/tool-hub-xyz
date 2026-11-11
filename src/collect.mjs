import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFilter } from './lib/filter.mjs';
import { filterNewItems, itemKeys, normalizeSeen, pruneSeen, serializeSeen } from './lib/dedupe.mjs';
import { dayKey } from './lib/normalize.mjs';
import { repairArticle } from './lib/content.mjs';
import { selectByCategoryQuota } from './lib/select.mjs';
import { fetchAllSources, parseSourceBody } from './lib/sources.mjs';
import { itemSlug, rankCompare } from './lib/items.mjs';
import { digestToMarkdown } from './lib/markdown.mjs';
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
    queries: result.queries ?? 1,
    error: result.error ?? null,
  }));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const config = await readJson(path.join(ROOT, 'config/sources.json'));
  const filters = await readJson(path.join(ROOT, 'config/filters.json'));
  const timezone = flags.timezone ?? config.timezone ?? 'Asia/Shanghai';
  // --now=<ISO> 把「现在」钉死：窗口、兜底线和日报日期都从它算，测试与回填才复现得出来。
  const now = flags.now ? new Date(flags.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`--now 不是合法时间：${flags.now}`);
    process.exitCode = 1;
    return;
  }
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
  // 显式窗口用于按天回填：--since/--until 都是 ISO 时间，给了就只认落在区间里的条目，不做旧文兜底。
  const windowStart = flags.since ? new Date(flags.since) : null;
  const windowEnd = flags.until ? new Date(flags.until) : null;
  const strictWindow = Boolean(windowStart && windowEnd);
  const stamp = (value) => new Date(value).toISOString();

  const windowCutoff = (sourceId) => {
    const hours = Number(sourceById.get(sourceId)?.windowHours ?? defaultWindow);
    if (!cutoffCache.has(hours)) cutoffCache.set(hours, new Date(now.getTime() - hours * 3_600_000).toISOString());
    return cutoffCache.get(hours);
  };
  // 增量起点只是「上次运行到现在」的补漏线，真正的窗口由信息源自己的 windowHours 决定：
  // 论坛栏目更新慢，窗口按 120 小时配置，就不该被 12 小时的增量线悄悄收窄。
  const cutoffFor = (sourceId) => {
    const window = windowCutoff(sourceId);
    if (!incrementalFrom) return window;
    return incrementalFrom < window ? window : incrementalFrom;
  };

  const results = flags.offline
    ? await offlineResults(config.sources, path.join(ROOT, flags.fixtures ?? 'tests/fixtures'))
    : await fetchAllSources(config.sources, {
        concurrency: Number(flags.concurrency ?? 5),
        timeoutMs: Number(flags.timeout ?? 15_000),
        retries: Number(flags.retries ?? 2),
        searchKeywords: config.searchKeywords ?? [],
        timezone,
        // 补正文是要花请求的：只为「来源门槛已过、只差正文」的条目花这笔预算，
        // 否则预算会落在必被闸门淘汰的存档条目上，入选条目反而没有正文。
        worthEnriching: (item, source) => filter.isRelevant(item) && filter.passesGuards(item, source),
      });

  const fetched = results.flatMap((result) => result.items);
  const seenPath = path.join(dataDir, 'seen.json');
  const seenRaw = await readFile(seenPath, 'utf8').catch(() => null);
  const seen = normalizeSeen(seenRaw ? JSON.parse(seenRaw) : null);
  const previousDigest = JSON.parse(await readFile(digestPath, 'utf8').catch(() => 'null'));
  const published = publishedItemsOf(previousDigest).map((item) =>
    item.content?.html ? { ...item, content: { ...item.content, html: repairArticle(item.content.html) } } : item,
  );
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
  // 只有落在信息源窗口里的条目才算「处理过」。窗口外的存档条目留到以后再看，
  // 否则一次全量抓取就能把整站历史写进 seen.json，之后几天的日报只能靠兜底。
  const inSourceWindow = (item) => {
    if (!item.published) return true;
    return stamp(item.published) >= (windowStart?.toISOString() ?? cutoffFor(item.sourceId));
  };
  const { fresh, duplicates } = filterNewItems(unseen, seen, { day, markSeen: inSourceWindow });

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
    const cutoff = windowStart?.toISOString() ?? cutoffFor(sourceId);
    const inWindow = [];
    const older = [];
    for (const item of eligible) {
      if (!item.published) {
        if (!strictWindow) older.push(item);
        continue;
      }
      const publishedAt = stamp(item.published);
      if (windowEnd && publishedAt > windowEnd.toISOString()) continue;
      if (publishedAt >= cutoff) inWindow.push(item);
      else older.push(item);
    }
    older.sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')));
    const room = Math.max(0, perSourceCap - (usedPerSource.get(sourceId) ?? 0));
    let chosen = inWindow.slice(0, room);
    if (!chosen.length && !strictWindow) {
      chosen = older.filter((item) => item.published && item.published >= oldestAllowed).slice(0, fallbackCount);
      for (const item of chosen) item.fallback = true;
      fallbackUsed += chosen.length;
    }
    for (const item of chosen) {
      usedPerSource.set(sourceId, (usedPerSource.get(sourceId) ?? 0) + 1);
      item.score = filter.score(item, now);
      item.category = filter.categorize(item);
      item.subcategory = filter.subcategoryFor(item, item.category);
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
    item.subcategory ??= filter.subcategoryFor(item, item.category);
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
    window: { since: windowStart?.toISOString() ?? null, until: windowEnd?.toISOString() ?? null },
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
  await mkdir(path.join(dataDir, 'markdown'), { recursive: true });
  await writeFile(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
  await writeFile(path.join(dataDir, 'markdown', `${day}.md`), digestToMarkdown(digest, { siteUrl: process.env.SITE_URL ?? 'https://tool-hub.xyz' }));
  // 回填某天（带 --since/--until）时不写 seen.json：那一天的窗口已经保证条目只落在这一天。
  // 写了会把同一批信息源里属于后面几天的条目全判成「已经见过」，后面那几天就什么都采不到。
  if (!strictWindow) {
    pruneSeen(seen, { retentionDays: config.seenRetentionDays ?? 45, timezone, now, limit: Number(config.seenLimit ?? 20_000) });
    await writeFile(seenPath, `${JSON.stringify(serializeSeen(seen), null, 2)}\n`);
  }
  await writeFile(statePath, `${JSON.stringify({ version: 1, day, lastRunAt: now.toISOString() }, null, 2)}\n`);

  const qualityTally = lowQuality.length
    ? ` 质量淘汰=${lowQuality.length}（${Object.entries(lowQuality.reduce((acc, reason) => { acc[reason] = (acc[reason] ?? 0) + 1; return acc; }, {})).map(([reason, count]) => `${reason}×${count}`).join(' ')}）`
    : '';
  const distribution = digest.categories.map((group) => `${group.label}=${group.items.length}`).join(' ');
  const mode = strictWindow
    ? `窗口(${windowStart.toISOString()} → ${windowEnd.toISOString()})`
    : incrementalFrom ? `增量(自 ${state.lastRunAt})` : '首次全量';
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
