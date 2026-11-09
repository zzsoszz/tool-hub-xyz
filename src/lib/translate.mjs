import { cleanText } from './normalize.mjs';

const SYSTEM_PROMPT = [
  '你是中文科技编辑，读者是普通用户和自由职业者。',
  '必须把每条 AI 资讯翻译成简体中文：title 为简洁准确的中文标题（品牌名、产品名、模型名保留原文），',
  'summary 为 1-2 句中文摘要，突出「普通人能怎么用、要不要花钱、要不要好配置」。不要添加原文没有的信息。',
  '禁止照抄英文原文：即使原文是英文，也必须输出简体中文（原本已是中文的条目保持中文）。',
  '输出格式：每条一行，写成「序号|中文标题|中文摘要」，序号从 1 开始且与输入一致。',
  '不要输出 JSON、代码块、编号列表或其他任何额外文字。',
].join('');

export function translateConfig(env = process.env) {
  const cloudflareKey = env.CLOUDFLARE_API_TOKEN ?? '';
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? '';
  const openaiKey = env.TRANSLATE_API_KEY ?? '';
  const disabled = env.TRANSLATE === '0';
  if (!disabled && cloudflareKey && accountId) {
    return {
      enabled: true,
      provider: 'cloudflare',
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${env.TRANSLATE_MODEL ?? '@cf/meta/llama-3.1-8b-instruct'}`,
      key: cloudflareKey,
      model: env.TRANSLATE_MODEL ?? '@cf/meta/llama-3.1-8b-instruct',
      batchSize: Number(env.TRANSLATE_BATCH_SIZE ?? 8),
    };
  }
  if (!disabled && openaiKey) {
    return {
      enabled: true,
      provider: 'openai',
      endpoint: `${(env.TRANSLATE_API_BASE ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
      key: openaiKey,
      model: env.TRANSLATE_MODEL ?? 'gpt-4o-mini',
      batchSize: Number(env.TRANSLATE_BATCH_SIZE ?? 15),
    };
  }
  return { enabled: false, provider: null, endpoint: '', key: '', model: '', batchSize: 0 };
}

function extractJsonObjects(text) {
  const raw = String(text ?? '');
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        try {
          objects.push(JSON.parse(raw.slice(start, index + 1)));
        } catch {
          // 忽略残缺片段，继续扫描下一段
        }
        start = -1;
      }
    }
  }
  return objects;
}

function flattenJson(objects) {
  const rows = [];
  for (const object of objects) {
    if (Array.isArray(object)) rows.push(...object);
    else if (Array.isArray(object?.items)) rows.push(...object.items);
    else if (object && (object.title || object.summary)) rows.push(object);
  }
  return rows.filter((row) => row && (row.title || row.summary));
}

function parseLineProtocol(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\d{1,3})\s*(?:[.)]\s*)?\|\s*(.*)$/.exec(trimmed);
    if (match) {
      const parts = match[2].split('|');
      rows.push({ i: Number(match[1]), title: (parts[0] ?? '').trim(), summary: (parts[1] ?? '').trim() });
      continue;
    }
    const previous = rows[rows.length - 1];
    if (previous) previous.summary = `${previous.summary ?? ''} ${trimmed}`.trim();
  }
  return rows.filter((row) => row.title);
}

function buildPrompt(items) {
  return items
    .map((item, index) => `${index + 1}. ${cleanText(item.title, 200)}\n${cleanText(item.summary ?? '', 360)}`)
    .join('\n\n');
}

function rowsToMap(rows, count) {
  const byIndex = new Map();
  for (const row of rows) {
    const index = Number(row.i ?? row.index ?? 0);
    if (!Number.isFinite(index) || index < 1) continue;
    if (!byIndex.has(index)) byIndex.set(index, row);
  }
  if (byIndex.size >= count || count === 0) return byIndex;
  // 小模型经常把序号写乱：数量对得上时按出现顺序回退
  const positional = new Map();
  rows.slice(0, count).forEach((row, index) => positional.set(index + 1, row));
  return positional;
}

export function parseTranslation(text, count) {
  const lines = parseLineProtocol(text);
  if (lines.length) return rowsToMap(lines, count);
  const loose = parseLooseLines(text);
  if (loose.length) return rowsToMap(loose, count);
  const jsonRows = flattenJson(extractJsonObjects(text));
  if (jsonRows.length) return rowsToMap(jsonRows, count);
  return null;
}

function parseLooseLines(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim().replace(/^[*>-]+\s*/, '');
    const match = /^(\d{1,3})\s*[.)、]?\s*[|:：-]?\s*(.+)$/.exec(trimmed);
    if (!match) continue;
    const rest = match[2].trim();
    if (rest.length < 2) continue;
    const parts = rest.split(/\s*(?:\||—|–|\s-\s)\s*/);
    rows.push({ i: Number(match[1]), title: (parts[0] ?? '').trim(), summary: parts.slice(1).join(' ').trim() });
  }
  return rows.filter((row) => row.title);
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

function isChineseOutput(item, title) {
  if (CJK.test(title)) return true;
  return CJK.test(String(item?.title ?? ''));
}

async function translateBatch(items, config, timeoutMs) {
  const prompt = buildPrompt(items);
  const body = config.provider === 'cloudflare'
    ? {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        max_tokens: 90 * items.length + 200,
      }
    : {
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      };
  const response = await fetch(config.endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 160);
    throw new Error(`翻译接口返回 HTTP ${response.status} ${detail}`);
  }
  const payload = await response.json();
  const content = payload?.result?.message?.content ?? payload?.result?.response ?? payload?.result?.output ?? payload?.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error(`翻译接口没有返回正文（finish_reason=${payload?.result?.finish_reason ?? '未知'}）`);
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return parseTranslation(text, items.length);
}

export function needsTranslation(item) {
  return !item?.zhTitle && item?.lang !== 'zh';
}

export async function translateItems(items, { config = translateConfig(), batchSize, timeoutMs = 60_000, log = () => {} } = {}) {
  if (!config.enabled) {
    log('未配置翻译凭据（CLOUDFLARE_API_TOKEN 或 TRANSLATE_API_KEY），跳过中文翻译');
    return { translated: 0, failed: 0 };
  }
  const size = batchSize ?? config.batchSize ?? 8;
  let translated = 0;
  let untranslated = 0;
  // 中文源保持原标题：模型会把中文标题改写得更短，反而丢掉型号与实测数字。
  const targets = items.filter(needsTranslation);
  const skipped = items.length - targets.length;
  if (skipped) log(`${skipped} 条条目保持原标题（中文源或已翻译）`);

  async function runPass(pool, passSize, label) {
    for (let offset = 0; offset < pool.length; offset += passSize) {
      const batch = pool.slice(offset, offset + passSize);
      try {
        const byIndex = await translateBatch(batch, config, timeoutMs);
        if (!byIndex) {
          log(`${label}批次 ${offset + 1} 的输出无法解析`);
          continue;
        }
        batch.forEach((item, index) => {
          const row = byIndex.get(index + 1);
          if (!row) return;
          const title = cleanText(row.title, 220);
          if (!title || !isChineseOutput(item, title)) {
            untranslated += 1;
            return;
          }
          item.zhTitle = title;
          item.zhSummary = cleanText(row.summary, 420) || undefined;
          translated += 1;
        });
      } catch (error) {
        log(`${label}批次失败：${error.message}`);
      }
    }
  }

  await runPass(targets, size, '翻译');
  const leftovers = targets.filter((item) => !item.zhTitle);
  if (leftovers.length > 1) {
    const retrySize = Math.min(2, size);
    log(`重试 ${leftovers.length} 条未译条目（每批 ${retrySize}）`);
    await runPass(leftovers, retrySize, '重试');
  }
  if (untranslated) log(`${untranslated} 条译文仍是英文，已保留原文标题`);
  return { translated, failed: targets.filter((item) => !item.zhTitle).length, untranslated, skipped };
}
