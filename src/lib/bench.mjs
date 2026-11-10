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
];

// 上游格子里成句的英文说明整句换中文：先整句、后单词，免得只换半个短语把句子切碎。
const SETUP_SENTENCES = [
  [/\bcold prefill in README\b/gi, '冷启动读取见原报告'],
  [/\bwith processor groups kept\b/gi, '保留处理器分组'],
  [/\bwith the two gfx103x switches\b/gi, '带两个 gfx103x 开关'],
  [/\bwith matching hipBLASLt\b/gi, '带匹配的 hipBLASLt'],
  [/\bfinal arm\b/gi, '最后一组'],
  [/\bsame runs?\b/gi, '同一批运行'],
  [/\bneedles to (\d+[KM])\b/gi, '捞针命中 $1'],
  [/\bms per draft round\b/gi, '每轮草稿毫秒'],
  [/\bin docker desktop on windows\b/gi, '在 Windows 的 Docker Desktop 里'],
  [/\bon ([a-z0-9-]+\/Strata)\b/gi, '（仓库 $1）'],
  [/\bit contains the code of my open PRs\b/gi, '其中包含作者那些开放 PR 的代码'],
  [/\ba modified, locally built engine, not an official release\b/gi, '本地编译的修改版引擎，不是官方发行版'],
  [/\baccepted-decode median of (\d+)\b/gi, '$1 次运行的接受解码中位数'],
  [/\bmedians of the five tasks\b/gi, '五个任务的中位数'],
  [/\bfive opt-ins off\b/gi, '五个可选开关关闭'],
  [/\bfresh and cached tail\b/gi, '全新缓存与已缓存尾部'],
  [/\btwo order-swapped pairs\b/gi, '两组顺序互换的配对'],
  [/\bbit-identical tokens\b/gi, 'token 逐位一致'],
  [/\bmatched synthetic prompts\b/gi, '配对的合成提示词'],
  [/\bshort-increment pairs\b/gi, '短增量配对'],
  [/\bsame lengths, one stream\b/gi, '同样长度，单流'],
  [/\bfor two streams\b/gi, '双流'],
  [/\(my script\)/gi, '（作者脚本）'],
  [/\bnot redistributed\b/gi, '未重新分发'],
  [/\bas expert helper\b/gi, '作为专家辅助模型'],
  [/\(helper\)/gi, '（辅助卡）'],
  [/\bmodified local build\b/gi, '本地修改版构建'],
  [/\bofficial windows release\b/gi, '官方 Windows 发行版'],
  [/\bprebuilt windows hip\b/gi, '预编译 Windows HIP'],
  [/\bsource hip build\b/gi, '源码 HIP 编译'],
  [/\bbatch mtp on a split\b/gi, '拆分模式批量 MTP'],
  [/\bbeside slots\b/gi, '与槽位同时启用'],
  [/\bpinned arena\b/gi, '固定内存池'],
  [/\bthe two switches, and with\b/gi, '两个开关，以及带'],
  [/\bthe two gfx103x switches\b/gi, '两个 gfx103x 开关'],
  [/\bthe two switches\b/gi, '两个开关'],
  [/\bhipBLASLt table\b/gi, 'hipBLASLt 表'],
  [/\bmatching hipBLASLt\b/gi, '匹配的 hipBLASLt'],
  [/\bhelper with the PRs\b/gi, '辅助卡带那些 PR'],
  [/\bwith the PRs\b/gi, '带那些 PR'],
  [/\bwith them\b/gi, '带这些开关'],
  [/\bone card stock\b/gi, '单卡官方发行版'],
  [/\bprocessor groups kept\b/gi, '保留处理器分组'],
  [/\bwith the exact switches\b/gi, '带指定开关'],
  [/\bcoding weighted decode\b/gi, '编程加权解码'],
  [/\blong coding\b/gi, '长编程任务'],
  [/\bexisting auto\b/gi, '现有自动档'],
  [/\bfixed (\d+)\b/gi, '固定 $1'],
  [/\b512 and 7,000-token tasks\b/gi, '512 与 7,000 token 任务'],
  [/\band others\b/gi, '与其余档位'],
  [/\bshared-expert stream on\b/gi, '共享专家流已开'],
  [/\bon ([\d.,]+K)-token prompts?\b/gi, '在 $1 提示词上'],
  [/\bat the full 1M depth\b/gi, '在完整 1M 深度'],
  [/\bnative 1M disk restore\b/gi, '原生 1M 磁盘恢复'],
  [/\bby task\b/gi, '按任务'],
  [/\bcap each\b/gi, '每卡上限'],
  [/\bneedles\b/gi, '捞针命中'],
];

// 单词级兜底：品牌名、量化档位和版本号不含这些词，不会被换成中文。
const SETUP_WORDS = [
  [/\babout\b/gi, '约'],
  [/\boriginal\b/gi, '原版'],
  [/\bto\b/gi, '至'],
  [/\bwith\b/gi, '带'],
  [/\bwithout\b/gi, '不带'],
  [/\bn\/a\b/gi, '不适用'],
  [/\bmedians\b/gi, '中位数'],
  [/\bmedian\b/gi, '中位数'],
  [/\bvs\b/gi, '对比'],
  [/\bat\b/gi, '在'],
  [/\bin\b/gi, '里'],
  [/\bon\b/gi, '已开'],
  [/\band\b/gi, '与'],
  [/\bby\b/gi, '按'],
  [/\bafter\b/gi, '之后'],
  [/\btable\b/gi, '表'],
  [/\bstreams?\b/gi, '流'],
  [/\barms?\b/gi, '分组'],
  [/\bdepth\b/gi, '深度'],
  [/\bfull\b/gi, '完整'],
  [/\boff\b/gi, '关闭'],
  [/\bfive\b/gi, '五个'],
  [/\bdefault\b/gi, '默认'],
  [/\bfaster\b/gi, '更快'],
  [/\bfast\b/gi, '加速'],
  [/\bplain\b/gi, '未调优'],
  [/\btuned\b/gi, '调优后'],
  [/\bfresh\b/gi, '全新缓存'],
  [/\bmean\b/gi, '平均'],
  [/\bpools?\b/gi, '内存池'],
  [/\bengine\b/gi, '引擎'],
  [/\bcontext\b/gi, '上下文'],
  [/\bunified\b/gi, '统一内存'],
  [/\busable RAM\b/gi, '可用内存'],
  [/\bRAM\b/gi, '内存'],
  [/\blaptop\b/gi, '笔记本'],
  [/\bunused\b/gi, '未使用'],
  [/\bmixed\b/gi, '混合'],
  [/\bruns?\b/gi, '运行'],
  [/\bordinary\b/gi, '常规'],
  [/\bcomparison\b/gi, '对照'],
  [/\bcoding\b/gi, '编程'],
  [/\bdecode\b/gi, '解码'],
  [/\bofficial\b/gi, '官方'],
  [/\bprebuilt\b/gi, '预编译'],
  [/\bnative\b/gi, '原生'],
  [/\bdisk restore\b/gi, '磁盘恢复'],
  [/\bprompts?\b/gi, '提示词'],
  [/\binput\b/gi, '输入'],
  [/\bEnglish\b/gi, '英文文本'],
  [/\bprose\b/gi, '文本'],
  [/\bcalibration\b/gi, '校准'],
  [/\bexact\b/gi, '指定'],
  [/\bkept\b/gi, '保留'],
  [/\bmatching\b/gi, '匹配'],
  [/\bmatched\b/gi, '配对'],
  [/\bsynthetic\b/gi, '合成'],
  [/\bone card\b/gi, '单卡'],
  [/\bswitches\b/gi, '开关'],
  [/\bthe PRs\b/gi, '那些 PR'],
  [/\bhelper\b/gi, '辅助卡'],
  [/\bshort\b/gi, '短提示'],
  [/\bGPUs?\b/gi, '卡'],
  [/\bcap\b/gi, '上限'],
  [/\blimit\b/gi, '上限'],
  [/\bfor\b/gi, '用于'],
  [/\bPRs\b/gi, '那些 PR'],
  [/\blink\b/gi, '通道'],
  [/\bprefill\b/gi, '读取'],
  [/\bseconds?\b/gi, '秒'],
  [/\bs\b/gi, '秒'],
  [/\bthe\s+/gi, ''],
];

function applyLabels(value, labels) {
  let text = String(value ?? '');
  for (const [pattern, label] of labels) text = text.replace(pattern, label);
  return text;
}

export function translateFragment(value) {
  return applyLabels(value, PHRASE_LABELS);
}

// 数字与单位照抄原文，文字按「整句 → 短语 → 单词」三级映射换成中文。
export function translateSetup(value) {
  return applyLabels(applyLabels(applyLabels(translateFragment(value), SETUP_SENTENCES), SETUP_LABELS), SETUP_WORDS);
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
      promptRaw: translateSetup(promptCell),
      outputRaw: translateSetup(outputCell),
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
