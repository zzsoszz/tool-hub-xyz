// 按天回填：把最近 N 天各自的信息源条目写成 data/digests/<日期>.json。
// 采集脚本的窗口本来相对「现在」，回填历史某天必须显式给出那一天的起止时间，
// 所以这里逐天调用 node src/collect.mjs --date=... --since=... --until=...（严格窗口，不做旧文兜底）。
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function parseArgs(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    flags[key] = value === undefined ? true : value;
  }
  return flags;
}

// 找出「该时区里这一天的 00:00」对应的 UTC 瞬间：试遍可能的 UTC 偏移，取本地时间正好是当天零点的那个。
function dayStartUtc(day, timeZone) {
  const clock = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const base = Date.parse(`${day}T00:00:00Z`);
  for (let offset = -14; offset <= 14; offset += 1) {
    const instant = new Date(base + offset * 3_600_000);
    const parts = Object.fromEntries(
      clock.formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    if (`${parts.year}-${parts.month}-${parts.day}` === day && parts.hour === '00' && parts.minute === '00') return instant;
  }
  throw new Error(`无法确定 ${timeZone} 里 ${day} 的起点`);
}

function shiftDay(day, days) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(date);
}

// 只保留「已经发布出去的条目」的指纹：采集脚本会把抓到的一切先记成已见过，
// 按天回填时这份名单会让后面几天的条目全被判成重复，所以回填前要先按日报正文重建。
async function reseedSeen(digestDir) {
  const { itemKeys } = await import('../src/lib/dedupe.mjs');
  const seen = new Map();
  for (const name of await readdir(digestDir).catch(() => [])) {
    if (!name.endsWith('.json')) continue;
    const digest = JSON.parse(await readFile(path.join(digestDir, name), 'utf8'));
    for (const group of digest.categories ?? []) {
      for (const item of group.items ?? []) {
        for (const key of itemKeys(item)) seen.set(key, digest.day);
      }
    }
  }
  const sorted = [...seen.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  await writeFile(path.join(DATA_DIR, 'seen.json'), `${JSON.stringify({ version: 1, count: sorted.length, entries: Object.fromEntries(sorted) }, null, 2)}\n`);
  console.log(`seen 重建：${sorted.length} 条指纹，全部来自已发布的日报`);
}

// 某天回填后一条都没有就别留空页：归档列一天却是空的，读者只会以为那天没内容。
async function pruneEmpty(days) {
  const digestDir = path.join(DATA_DIR, 'digests');
  const removed = [];
  for (const day of days) {
    const file = path.join(digestDir, `${day}.json`);
    const digest = JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
    if (!digest || (digest.counts?.published ?? 0) > 0) continue;
    await rm(file);
    await rm(path.join(DATA_DIR, 'markdown', `${day}.md`), { force: true });
    removed.push(day);
  }
  if (removed.length) console.log(`空日报已撤下：${removed.join(' ')}`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(path.join(ROOT, 'config/sources.json'), 'utf8'));
  const timeZone = config.timezone ?? 'Asia/Shanghai';
  const days = Math.max(1, Number(flags.days ?? 7));
  const end = flags.end ?? new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  const now = new Date();
  const digestDir = path.join(DATA_DIR, 'digests');
  await mkdir(digestDir, { recursive: true });
  const covered = [];
  for (let index = days - 1; index >= 0; index -= 1) covered.push(shiftDay(end, -index));

  if (flags['reseed-seen'] || flags['seed-only']) await reseedSeen(digestDir);

  if (!flags['seed-only']) {
    for (let index = days - 1; index >= 0; index -= 1) {
      const day = shiftDay(end, -index);
      const start = dayStartUtc(day, timeZone);
      const next = dayStartUtc(shiftDay(day, 1), timeZone);
      const until = next > now ? now : next;
      const args = ['src/collect.mjs', `--date=${day}`, `--since=${start.toISOString()}`, `--until=${until.toISOString()}`];
      for (const extra of (flags.extra ?? '').split(',').filter(Boolean)) args.push(extra);
      console.log(`\nbackfill ${day} (${timeZone} 00:00 → ${until.toISOString()})`);
      const outcome = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
      if (outcome.status !== 0) {
        console.error(`backfill ${day} 失败（退出码 ${outcome.status}），停止后续日期。`);
        process.exitCode = outcome.status ?? 1;
        return;
      }
    }
    await pruneEmpty(covered);
    // 回填那几天不写 seen，所以收尾再按已发布的日报重建一次：这些条目的指纹必须回到 seen，
    // 否则后面的增量运行会把它们重新捞进新的某一天。
    if (flags['reseed-seen']) await reseedSeen(digestDir);
  }
}

await main();
