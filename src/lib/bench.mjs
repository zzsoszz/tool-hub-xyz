// 评测数据解析层：把上游仓库里的 Markdown 结果表解析成结构化行，供构建期渲染成中文表格。
// 这里只做「取数字 + 保留原文」，不做推断；结论写在 config/bench.json，并逐条给出来源链接。
import { createHash } from 'node:crypto';

export const STRATA_REPO = 'Niko1221/Strata';
export const STRATA_RESULTS_DIR = 'bench/results';

const NUMBER_ONLY = /^~?\$?([\d,]+(?:\.\d+)?)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_GAP = /^\s*\|[\s|:-]+\|\s*$/;
const COMMUNITY_ROW = /^\|\s*\[([^\]]+)\]\(([^)]*?)\)\s*\|/;

// 品牌名与量化档位照原文保留，只把括号里的英文说明换成中文。
const PHRASE_LABELS = [
  [/\bsee (the )?README\b/gi, '数字见原报告'],
  [/\(docker\)/gi, '（容器内）'],
  [/\blayer split\b/gi, '跨卡分层'],
  [/\bcode prompts\b/gi, '代码提示词'],
  [/\bRussian prose\b/gi, '俄文文本'],
  [/\(rerun\)/gi, '（复测）'],
  [/\bshort prompt\b/gi, '短提示'],
  [/\bnot measured\b/gi, '未测'],
  [/\bunchanged\b/gi, '无明显变化'],
];

export function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const number = Number(value);
  const fixed = Math.abs(number) >= 100 ? Math.round(number) : Math.round(number * 10) / 10;
  return String(fixed).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 价格保留到美分以下的三位小数，去掉末尾的 0，避免 $0.100 这种读起来含糊的写法。
export function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  if (number === 0) return '0';
  return number.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

// 描述列（显卡 / 模型 / 引擎）里常见的英文说法，翻成中文；只翻确定的词，数字与品牌名照原文。
const SETUP_LABELS = [
  [/\ban open PR by another contributor that keeps the RAM copy of the split lend regions\b/gi, '另一位贡献者的一个开放 PR，保留拆分专家区域的内存副本'],
  [/\bplus the open PRs\b/gi, '加上那些开放 PR'],
  [/\bfork build of\b/gi, '分支构建，基于'],
  [/\bnot upstream\b/gi, '不是上游'],
  [/\bin a second round\b/gi, '第二轮'],
  [/\bupdated for\b/gi, '为'],
  [/\blocal patches\b/gi, '本地补丁'],
  [/\bsource branch\b/gi, '源码分支'],
  [/\bAMD engine\b/gi, 'AMD 引擎'],
  [/\badaptive cache\b/gi, '自适应缓存'],
  [/\ba dense 27B\b/gi, '一个稠密 27B'],
  [/\bthird quant\b/gi, '第三种量化'],
  [/\bquants\b/gi, '量化'],
  [/\btwo arms each\b/gi, '每种各两轮'],
  [/\bcontrast\b/gi, '对照'],
  [/\bcells\b/gi, '格'],
  [/\blineage\b/gi, '版本来源'],
  [/\ba private patched build and two larger files are listed separately in the README\b/gi, '另有一份自行打补丁的构建与两个更大的文件，在 README 里单列'],
  [/\bin a short section\b/gi, '其中一小节'],
  [/\bexperimental speed projection on\b/gi, '实验性速度预测已开'],
  [/\bof experts\b/gi, '的专家数据'],
  [/\bstock (v?[\d.]+)\b/gi, '官方发行版 $1'],
  [/\bstock\b/gi, '官方发行版'],
  [/\bprivate patched build\b/gi, '自行打补丁的构建'],
  [/\blisted separately in the README\b/gi, '在 README 里单列'],
  [/\ba modified, locally built engine, not an official release\b/gi, '本地编译的修改版引擎，不是官方发行版'],
  [/\bnot an official release\b/gi, '不是官方发行版'],
  [/\bLocally compiled\b/gi, '本地编译'],
  [/\bsource build\b/gi, '源码编译'],
  [/\bhost build\b/gi, '主机编译'],
  [/\bon the distribution's\b/gi, '用发行版自带的'],
  [/\bhelper cache\b/gi, '辅助缓存'],
  [/\bexperimental speed projection\b/gi, '实验性速度预测'],
  [/\bnative-experts pack\b/gi, '原生专家包'],
  [/\bshared KV pool\b/gi, '共享 KV 池'],
  [/\btool-call hotfix\b/gi, '工具调用修复版'],
  [/\bopt-ins\b/gi, '可选开关'],
  [/\bprefill sweep\b/gi, '读取扫描'],
  [/\bcoding-agent task\b/gi, '编程代理任务'],
  [/\bfirst NVIDIA measurement\b/gi, '首个 NVIDIA 实测'],
  [/\bfrozen experimental\b/gi, '冻结的实验版'],
  [/\bcold\b/gi, '冷启动'],
  [/\bgreedy\b/gi, '贪心'],
  [/\bre-reads\b/gi, '重复读取'],
  [/\bworkers\b/gi, '工作线程'],
  [/\bsingle runs?\b/gi, '单次运行'],
  [/\bone run\b/gi, '一次运行'],
  [/\bboth cards\b/gi, '两张卡'],
  [/\blanes?\b/gi, '通道'],
  [/\bvariants?\b/gi, '变体'],
  [/\brecall\b/gi, '召回'],
  [/\babout\b/gi, '约'],
  [/\boriginal\b/gi, '原版'],
  [/\bto\b/gi, '至'],
  [/\bwith\b/gi, '带'],
  [/\bwithout\b/gi, '不带'],
];

function applyLabels(value, labels) {
  let text = String(value ?? '');
  for (const [pattern, label] of labels) text = text.replace(pattern, label);
  return text;
}

export function translateFragment(value) {
  return applyLabels(value, PHRASE_LABELS);
}

// 描述列走更完整的映射；「原表写法」列只用轻量映射，尽量照抄原文。
export function translateSetup(value) {
  return applyLabels(translateFragment(value), SETUP_LABELS);
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

// 只有整格都是「a / b / c」这种纯数字序列时才采信，带解释文字的格子一律留给原报告。
export function parseNumberSeries(cell) {
  const parts = String(cell ?? '').split('/');
  if (parts.length < 2) return null;
  const values = [];
  for (const part of parts) {
    const match = NUMBER_ONLY.exec(part.trim());
    if (!match) return null;
    values.push(Number(match[1].replace(/,/g, '')));
  }
  return values;
}

export function prUrl(number) {
  const match = /#(\d+)/.exec(String(number ?? ''));
  return match ? `https://github.com/${STRATA_REPO}/pull/${match[1]}` : null;
}

export function readmeUrl(folder, commit) {
  return `https://github.com/${STRATA_REPO}/blob/${commit}/${STRATA_RESULTS_DIR}/${folder}/README.md`;
}

// COMMUNITY.md 的表被「Notes」段落切成几截，所以按行认「| [目录](目录/) |」而不是按表认。
export function parseCommunityRows(markdown) {
  const rows = [];
  for (const line of String(markdown ?? '').split('\n')) {
    if (!COMMUNITY_ROW.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length !== 7) continue;
    const [folderCell, hardware, model, promptCell, outputCell, engine, pr] = cells;
    const folder = /\[([^\]]+)\]/.exec(folderCell)?.[1] ?? '';
    if (!folder) continue;
    rows.push({
      folder,
      hardware: translateSetup(hardware),
      model: translateSetup(model),
      engine: translateSetup(engine),
      pr: String(pr),
      prUrl: prUrl(pr),
      prompt: parseNumberSeries(promptCell),
      output: parseNumberSeries(outputCell),
      promptRaw: translateFragment(promptCell),
      outputRaw: translateFragment(outputCell),
    });
  }
  return rows;
}

// 官方速度矩阵：表头是 1K/4K/32K/…，上一级标题说明这张表测的是读取还是输出。
export function parseSpeedMatrices(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const tables = [];
  let heading = '';
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^#{2,4}\s/.test(line)) {
      heading = line.replace(/^#+\s*/, '');
      index += 1;
      continue;
    }
    if (TABLE_ROW.test(line) && index + 1 < lines.length && TABLE_GAP.test(lines[index + 1])) {
      const header = splitRow(lines[index]);
      index += 2;
      const rows = [];
      while (index < lines.length && TABLE_ROW.test(lines[index])) {
        const cells = splitRow(lines[index]);
        if (cells.length === header.length) rows.push(cells);
        index += 1;
      }
      tables.push({ heading, header, rows });
      continue;
    }
    index += 1;
  }
  return tables.filter((table) => /prompt|output/i.test(table.heading) && /model/i.test(table.header[0] ?? ''));
}

function contextLabels(header) {
  return header.slice(1).map((label) => label.replace(/[^0-9Kk]/g, '').toUpperCase());
}

// 把「同一台机器、不同引擎版本」的多张矩阵并成一张：每个量化一行，读取/输出各三个长度。
export function mergeSpeedMatrices(sources) {
  const merged = new Map();
  for (const source of sources) {
    for (const table of parseSpeedMatrices(source.markdown)) {
      const kind = /output/i.test(table.heading) ? 'output' : 'prompt';
      const labels = contextLabels(table.header);
      for (const row of table.rows) {
        const model = row[0].replace(/\*\*/g, '').trim();
        if (!model || model === '-') continue;
        const key = `${source.engine}|${model}`;
        const entry = merged.get(key) ?? { engine: source.engine, model, prompt: {}, output: {}, contextLabels: [] };
        entry.contextLabels = [...new Set([...entry.contextLabels, ...labels])];
        row.slice(1).forEach((cell, position) => {
          const label = labels[position];
          if (!label) return;
          const match = NUMBER_ONLY.exec(cell.replace(/\*\*/g, '').trim());
          if (!match) return;
          entry[kind][label] = Number(match[1].replace(/,/g, ''));
        });
        merged.set(key, entry);
      }
    }
  }
  return [...merged.values()];
}

export function speedTableRows(entries, { kind = 'output', contexts = ['4K', '32K', '128K'] } = {}) {
  const rows = [];
  for (const entry of entries) {
    const values = entry[kind] ?? {};
    const picked = contexts.map((context) => (values[context] === undefined ? null : values[context]));
    if (picked.every((value) => value === null)) continue;
    rows.push({ engine: entry.engine, model: entry.model, contexts, values: picked });
  }
  rows.sort((a, b) => (b.values[1] ?? b.values[0] ?? 0) - (a.values[1] ?? a.values[0] ?? 0));
  return rows;
}

// 社区表的数字格按「短 / 中 / 长」三段读取，中间那段当 32K 用，用来排序与出图。
export function communitySortValue(series) {
  if (!Array.isArray(series) || !series.length) return null;
  if (series.length >= 3) return series[1];
  return Math.max(...series);
}

export function buildCommunityTables(rows) {
  const numeric = (kind) => rows
    .filter((row) => Array.isArray(row[kind]) && row[kind].length >= 3)
    .sort((a, b) => communitySortValue(b[kind]) - communitySortValue(a[kind]))
    .map((row) => ({
      folder: row.folder,
      hardware: row.hardware,
      model: row.model,
      engine: row.engine,
      pr: row.pr,
      prUrl: row.prUrl,
      values: row[kind].slice(0, 3),
      raw: kind === 'prompt' ? row.promptRaw : row.outputRaw,
    }));
  const withNumbers = numeric('output');
  const withPrompt = numeric('prompt');
  const covered = new Set([...withNumbers.map((row) => row.folder), ...withPrompt.map((row) => row.folder)]);
  const others = rows.filter((row) => !covered.has(row.folder)).map((row) => ({
    folder: row.folder,
    hardware: row.hardware,
    model: row.model,
    engine: row.engine,
    pr: row.pr,
    prUrl: row.prUrl,
    note: [row.promptRaw, row.outputRaw].filter(Boolean).join(' ｜ '),
  }));
  return { output: withNumbers, prompt: withPrompt, others };
}

export function communityStats(tables) {
  const valuesOf = (rows) => rows.map((row) => communitySortValue(row.values)).filter((value) => value !== null);
  const outputs = valuesOf(tables.output);
  const prompts = valuesOf(tables.prompt);
  const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  return {
    outputRows: tables.output.length,
    promptRows: tables.prompt.length,
    otherRows: tables.others.length,
    medianOutput: median(outputs),
    medianPrompt: median(prompts),
    fastestOutput: outputs.length ? Math.max(...outputs) : null,
    slowestOutput: outputs.length ? Math.min(...outputs) : null,
    fastestPrompt: prompts.length ? Math.max(...prompts) : null,
  };
}

const PRICING_SKIP = /^(openrouter\/|typesafe\/|nvidia\/switchyard)/;

export function parseOpenRouterModels(payload, { limit = 36, minContext = 128_000 } = {}) {
  const models = Array.isArray(payload?.data) ? payload.data : [];
  const rows = [];
  for (const model of models) {
    const id = String(model?.id ?? '');
    const prompt = Number(model?.pricing?.prompt);
    const completion = Number(model?.pricing?.completion);
    const context = Number(model?.context_length);
    if (!id || PRICING_SKIP.test(id)) continue;
    if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;
    if (!Number.isFinite(context) || context < minContext) continue;
    const modalities = model?.architecture?.input_modalities ?? [];
    if (!modalities.includes('text')) continue;
    if (modalities.some((entry) => entry !== 'text' && entry !== 'image')) continue;
    rows.push({
      name: String(model?.name ?? id),
      id,
      url: `https://openrouter.ai/${id}`,
      context,
      promptPerMillion: prompt * 1_000_000,
      completionPerMillion: completion * 1_000_000,
      free: prompt === 0 && completion === 0,
      created: Number(model?.created ?? 0),
    });
  }
  rows.sort((a, b) => a.promptPerMillion - b.promptPerMillion || b.context - a.context);
  return rows.slice(0, limit);
}

// 横向条形图：不引第三方库，直接写 SVG。样式写在文件内部，作为独立图片被 <img> 引用时也能正常显示。
export function barChartSvg({ title, unit, items = [], note = '' }) {
  const rows = items.length;
  if (!rows) return '';
  const rowHeight = 26;
  const labelWidth = 330;
  const width = 980;
  const height = 78 + rows * rowHeight + (note ? 26 : 0);
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  const bars = items.map((item, index) => {
    const top = 58 + index * rowHeight;
    const barWidth = Math.max(2, ((width - labelWidth - 96) * Number(item.value)) / max);
    return [
      `  <text x="${labelWidth - 12}" y="${top + 14}" text-anchor="end" class="chart-label">${escapeSvg(String(item.label).slice(0, 46))}</text>`,
      `  <rect x="${labelWidth}" y="${top + 3}" width="${barWidth.toFixed(1)}" height="15" class="chart-bar"></rect>`,
      `  <text x="${(labelWidth + barWidth + 8).toFixed(1)}" y="${top + 15}" class="chart-value">${escapeSvg(formatNumber(item.value))}</text>`,
    ].join('\n');
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeSvg(`${title}（${unit}）`)}">
<title>${escapeSvg(title)}</title>
<desc>${escapeSvg(`横向条形图，单位 ${unit}，共 ${rows} 项。数值取自上游报告，同一页面的表格里每一行都给了原报告链接。`)}</desc>
<style>
.chart-title { font: 600 20px/1.4 Georgia, "Songti SC", serif; fill: #16231f; }
.chart-note { font: 13px/1.5 "PingFang SC", system-ui, sans-serif; fill: #576561; }
.chart-label { font: 13px/1.5 "PingFang SC", system-ui, sans-serif; fill: #16231f; }
.chart-value { font: 13px/1.5 ui-monospace, Menlo, monospace; fill: #4d605a; }
.chart-bar { fill: #0e5c48; }
</style>
<text x="0" y="26" class="chart-title">${escapeSvg(title)}</text>
<text x="0" y="46" class="chart-note">单位：${escapeSvg(unit)}${note ? ` · ${escapeSvg(note)}` : ''}</text>
${bars}
${note ? `<text x="0" y="${height - 8}" class="chart-note">${escapeSvg(note)}</text>` : ''}
</svg>
`;
}

// 图表项从已采集的表格行里取，标签与列名都来自 config/bench.json，构建期与页面表格用的是同一批行。
export function datasetChartItems(dataset, data) {
  const chart = dataset?.chart;
  if (!chart) return [];
  const rows = data?.tables?.[chart.table]?.rows ?? [];
  const items = [];
  for (const row of rows.slice(0, chart.top ?? 20)) {
    const label = (chart.labelFields ?? []).map((field) => row[field]).filter((entry) => entry !== undefined && entry !== null && entry !== '').join(' · ');
    const value = chart.valueField ? row[chart.valueField] : row.values?.[chart.valueIndex ?? 1];
    if (!label || value === null || value === undefined || Number.isNaN(Number(value))) continue;
    items.push({ label, value: Number(value) });
  }
  return items;
}

export function datasetChartSvg(dataset, data) {
  const chart = dataset?.chart;
  if (!chart) return '';
  return barChartSvg({
    title: chart.title,
    unit: chart.unit,
    note: chart.note,
    items: datasetChartItems(dataset, data),
  });
}

function escapeSvg(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
