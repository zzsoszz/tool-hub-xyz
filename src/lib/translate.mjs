import { cleanText } from './normalize.mjs';

export function translateConfig(env = process.env) {
  const key = env.TRANSLATE_API_KEY ?? '';
  const base = (env.TRANSLATE_API_BASE ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.TRANSLATE_MODEL ?? 'gpt-4o-mini';
  const enabled = Boolean(key) && env.TRANSLATE !== '0';
  return { enabled, base, key, model };
}

function extractJson(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function translateBatch(items, config, timeoutMs) {
  const prompt = items
    .map((item, index) => `${index + 1}. ${item.title}\n${(item.summary ?? '').slice(0, 400)}`)
    .join('\n\n');
  const response = await fetch(`${config.base}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是中文科技编辑。把每条 AI 资讯翻译成简洁的中文标题，并给出 1-2 句中文摘要。只输出 JSON：{"items":[{"i":1,"title":"中文标题","summary":"中文摘要"}]}',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`翻译接口返回 HTTP ${response.status}`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? '';
  const parsed = extractJson(typeof content === 'string' ? content : JSON.stringify(content));
  if (!parsed) return null;
  const rows = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(rows)) return null;
  const byIndex = new Map();
  for (const row of rows) {
    if (!row || typeof row.i !== 'number') continue;
    byIndex.set(row.i, row);
  }
  return byIndex;
}

export async function translateItems(items, { config = translateConfig(), batchSize = 15, timeoutMs = 45_000, log = () => {} } = {}) {
  if (!config.enabled) {
    log('未配置 TRANSLATE_API_KEY，跳过中文摘要');
    return { translated: 0, failed: 0 };
  }
  let translated = 0;
  let failed = 0;
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize);
    try {
      const byIndex = await translateBatch(batch, config, timeoutMs);
      if (!byIndex) {
        failed += batch.length;
        continue;
      }
      batch.forEach((item, index) => {
        const row = byIndex.get(index + 1);
        if (!row) return;
        item.zhTitle = cleanText(row.title, 220) || undefined;
        item.zhSummary = cleanText(row.summary, 400) || undefined;
        translated += 1;
      });
    } catch (error) {
      failed += batch.length;
      log(`翻译批次失败：${error.message}`);
    }
  }
  return { translated, failed };
}
