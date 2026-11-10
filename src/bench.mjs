// 评测数据采集：把上游仓库的实测结果抓成 data/bench/<id>.json，构建期再渲染成中文表格。
// 每一批文件都记下抓取时的 commit 与 SHA-256，页面上可以直接回到那一版原文核对。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchUrl } from './lib/http.mjs';
import {
  STRATA_REPO,
  buildCommunityTables,
  communityStats,
  mergeSpeedMatrices,
  parseCommunityRows,
  parseOpenRouterModels,
  sha256,
  speedTableRows,
} from './lib/bench.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function arg(name, fallback = '') {
  const hit = process.argv.slice(2).find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const options = {
  dataDir: path.join(ROOT, process.env.DATA_DIR ?? 'data'),
  offline: process.argv.includes('--offline'),
  strataCommit: arg('strata-commit'),
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

const RAW_ACCEPT = 'application/vnd.github.raw+json';

async function fetchFile(url, headers = {}) {
  const result = await fetchUrl(url, { timeoutMs: 30_000, retries: 1, headers });
  if (!result.ok) throw new Error(`${url} → ${result.error ?? `HTTP ${result.status}`}`);
  return { body: result.body, sha256: sha256(result.body), bytes: Buffer.byteLength(result.body, 'utf8') };
}

// 有些网络到 raw.githubusercontent.com 不通，同一份内容改用 GitHub API 的 raw 取法，取到的字节完全一样。
async function fetchStrataFile(commit, filePath) {
  const attempts = [
    { url: `https://raw.githubusercontent.com/${STRATA_REPO}/${commit}/${filePath}` },
    { url: `https://api.github.com/repos/${STRATA_REPO}/contents/${filePath}?ref=${commit}`, headers: { accept: RAW_ACCEPT } },
  ];
  let lastError = '未知错误';
  for (const attempt of attempts) {
    try {
      return await fetchFile(attempt.url, attempt.headers);
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(`${filePath}: ${lastError}`);
}

async function strataHead() {
  if (options.strataCommit) return options.strataCommit;
  const result = await fetchUrl(`https://api.github.com/repos/${STRATA_REPO}/commits?per_page=1`, { timeoutMs: 20_000 });
  if (!result.ok) throw new Error(`取 ${STRATA_REPO} 最新 commit 失败: ${result.error ?? `HTTP ${result.status}`}`);
  const sha = JSON.parse(result.body)?.[0]?.sha;
  if (!sha) throw new Error(`取 ${STRATA_REPO} 最新 commit 失败: 返回里没有 sha`);
  return sha;
}

function strataBlobUrl(commit, filePath) {
  return `https://github.com/${STRATA_REPO}/blob/${commit}/${filePath}`;
}

async function fetchStrataFiles(commit, files) {
  const fetched = await Promise.all(files.map((filePath) => fetchStrataFile(commit, filePath)));
  const records = files.map((filePath, index) => ({
    path: filePath,
    url: strataBlobUrl(commit, filePath),
    sha256: fetched[index].sha256,
    bytes: fetched[index].bytes,
  }));
  const bodies = new Map(files.map((filePath, index) => [filePath, fetched[index].body]));
  return { records, bodies };
}

function collectCommunity(markdown, { commit, files }) {
  const rows = parseCommunityRows(markdown);
  const tables = buildCommunityTables(rows);
  return {
    tables: {
      output: { rows: tables.output.map((row) => ({ ...row, readmeUrl: strataBlobUrl(commit, `bench/results/${row.folder}/README.md`) })) },
      prompt: { rows: tables.prompt.map((row) => ({ ...row, readmeUrl: strataBlobUrl(commit, `bench/results/${row.folder}/README.md`) })) },
      others: { rows: tables.others.map((row) => ({ ...row, readmeUrl: strataBlobUrl(commit, `bench/results/${row.folder}/README.md`) })) },
    },
    stats: { ...communityStats(tables), rowTotal: rows.length },
    files,
  };
}

function collectMatrix(dataset, bodies, { commit, files }) {
  const sources = dataset.matrixSources.map((entry) => ({ engine: entry.engine, markdown: bodies.get(entry.path) ?? '' }));
  const entries = mergeSpeedMatrices(sources);
  const linkFor = (path) => strataBlobUrl(commit, path);
  return {
    tables: {
      prompt: { rows: speedTableRows(entries, { kind: 'prompt', contexts: dataset.contexts }).map((row) => ({ ...row, sourceUrl: linkFor(dataset.matrixSources.find((entry) => entry.engine === row.engine)?.path ?? '') })) },
      output: { rows: speedTableRows(entries, { kind: 'output', contexts: dataset.contexts }).map((row) => ({ ...row, sourceUrl: linkFor(dataset.matrixSources.find((entry) => entry.engine === row.engine)?.path ?? '') })) },
    },
    stats: { engines: [...new Set(entries.map((entry) => entry.engine))], models: [...new Set(entries.map((entry) => entry.model))] },
    files,
  };
}

function collectPricing(payload, { files }) {
  const rows = parseOpenRouterModels(payload, { limit: 40 });
  return {
    tables: { pricing: { rows } },
    stats: { models: rows.length, free: rows.filter((row) => row.free).length },
    files,
  };
}

async function collectDataset(dataset) {
  const target = path.join(options.dataDir, 'bench', `${dataset.id}.json`);
  const previous = await readJson(target, null);
  if (options.offline) {
    if (previous) return { id: dataset.id, ok: true, offline: true, rows: countRows(previous) };
    return { id: dataset.id, ok: false, error: '--offline 且没有已提交的数据' };
  }
  try {
    if (dataset.kind === 'strata-community') {
      const commit = await strataHead();
      const { records, bodies } = await fetchStrataFiles(commit, dataset.sourcePaths.map((entry) => entry.path));
      const built = collectCommunity(bodies.get(dataset.sourcePaths[0].path), { commit, files: records });
      await writeJson(target, { id: dataset.id, kind: dataset.kind, collectedAt: new Date().toISOString(), upstream: dataset.upstream, commit, ...built });
      return { id: dataset.id, ok: true, rows: countRows(built), commit: commit.slice(0, 8) };
    }
    if (dataset.kind === 'strata-matrix') {
      const commit = await strataHead();
      const paths = [...dataset.matrixSources.map((entry) => entry.path), ...dataset.sourcePaths.map((entry) => entry.path)];
      const { records, bodies } = await fetchStrataFiles(commit, paths);
      const built = collectMatrix(dataset, bodies, { commit, files: records });
      await writeJson(target, { id: dataset.id, kind: dataset.kind, collectedAt: new Date().toISOString(), upstream: dataset.upstream, commit, ...built });
      return { id: dataset.id, ok: true, rows: countRows(built), commit: commit.slice(0, 8) };
    }
    if (dataset.kind === 'openrouter-pricing') {
      const url = dataset.sourcePaths[0].path;
      const fetched = await fetchFile(url);
      const built = collectPricing(JSON.parse(fetched.body), {
        files: [{ path: url, url, sha256: fetched.sha256, bytes: fetched.bytes }],
      });
      await writeJson(target, { id: dataset.id, kind: dataset.kind, collectedAt: new Date().toISOString(), upstream: dataset.upstream, commit: null, ...built });
      return { id: dataset.id, ok: true, rows: countRows(built) };
    }
    return { id: dataset.id, ok: false, error: `未知的数据集类型 ${dataset.kind}` };
  } catch (error) {
    if (previous) {
      await writeFile(target, `${JSON.stringify(previous, null, 2)}\n`);
      return { id: dataset.id, ok: true, stale: true, rows: countRows(previous), error: error.message };
    }
    return { id: dataset.id, ok: false, error: error.message };
  }
}

function countRows(record) {
  return Object.values(record?.tables ?? {}).reduce((sum, table) => sum + (table?.rows?.length ?? 0), 0);
}

async function main() {
  const config = await readJson(path.join(ROOT, 'config', 'bench.json'), { datasets: [] });
  const datasets = config.datasets ?? [];
  if (!datasets.length) {
    console.error('bench: config/bench.json 里没有数据集');
    process.exitCode = 1;
    return;
  }
  const results = [];
  for (const dataset of datasets) {
    const result = await collectDataset(dataset);
    results.push(result);
    const note = result.offline ? '（沿用已提交数据）' : result.stale ? `（抓取失败，沿用上一版：${result.error}）` : '';
    if (!result.ok) console.warn(`bench: ${result.id} 采集失败 → ${result.error}`);
    else console.log(`bench: ${result.id} 写入 ${result.rows} 行${note}${result.commit ? ` · commit ${result.commit}` : ''}`);
  }
  if (results.every((result) => !result.ok)) process.exitCode = 1;
}

await main();
