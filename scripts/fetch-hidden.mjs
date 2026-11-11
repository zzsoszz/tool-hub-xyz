// 把线上 D1 里管理员下架的条目编号拉回本地，写进 data/hidden.json 供构建期剔除。
// 拉取失败时保留上一份文件（宁可保留下架状态，也不要把已下架的内容重新发出去）。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'hidden.json');

function readEnvOrFile(envName, filePath) {
  if (process.env[envName]) return process.env[envName].trim();
  const text = readFile(filePath, 'utf8').catch(() => '');
  return text.then((value) => value.trim());
}

async function accountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID.trim();
  const text = await readFile(path.join(ROOT, 'credentials.local.md'), 'utf8').catch(() => '');
  return (text.match(/Account ID：`([0-9a-f]{10,})`/)?.[1] ?? '').trim();
}

async function databaseId() {
  const config = await readFile(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  return (config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ?? '').trim();
}

async function main() {
  const strict = process.argv.includes('--strict');
  const token = await readEnvOrFile('CLOUDFLARE_API_TOKEN', path.join(process.env.HOME ?? '', '.config/tool-hub/cloudflare.token'));
  const account = await accountId();
  const database = await databaseId();
  if (!token || !account || !database) {
    console.warn('fetch-hidden: 缺少 Cloudflare 凭据或 database_id，沿用上一份 data/hidden.json');
    process.exitCode = strict ? 1 : 0;
    return;
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql: 'SELECT slug FROM hidden_items' }),
  });
  const payload = await response.json().catch(() => ({}));
  const rows = payload?.result?.[0]?.results;
  if (!response.ok || !Array.isArray(rows)) {
    console.warn(`fetch-hidden: 查询失败（HTTP ${response.status} ${payload?.errors?.[0]?.message ?? '未知错误'}），沿用上一份 data/hidden.json`);
    process.exitCode = strict ? 1 : 0;
    return;
  }
  const slugs = [...new Set(rows.map((row) => row.slug).filter((slug) => /^[0-9a-f]{12}$/.test(slug)))];
  // D1 里存的是管理员手动下架；审查拦下的机器下架只写在本地 hidden.json，两边都要保留。
  const previous = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{}'));
  const machine = [...new Set(previous.machine ?? [])].filter((slug) => /^[0-9a-f]{12}$/.test(slug));
  const merged = [...new Set([...slugs, ...machine])];
  // 按天的审查结论要一起保留：压平成扁平 machine 会让「重跑某一天」失去可覆盖的桶，旧下架结论又变回永久。
  const state = { updatedAt: new Date().toISOString(), slugs: merged, admin: slugs, machine };
  if (previous.machineByDay) state.machineByDay = previous.machineByDay;
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`fetch-hidden: 管理员下架 ${slugs.length} 条 + 审查下架 ${machine.length} 条 → data/hidden.json`);
}

await main();
