export const USER_AGENT = 'tool-hub-bot/1.0 (+https://tool-hub.xyz; daily AI news digest)';

const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, application/json;q=0.8, text/xml;q=0.7, */*;q=0.5';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt, retryAfter) {
  if (retryAfter && Number.isFinite(retryAfter)) return Math.min(retryAfter * 1000, 30_000);
  return 2_000 * 2 ** attempt;
}

// 同一个站点的请求排队：三个 reddit 源并发时整组 429，GitHub 检索并发时整组 403。
// 按主机串行 + 间隔，比并发撞限流更快也更不容易被封。
const hostChains = new Map();

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function queueHost(host, run) {
  const key = host || '';
  const previous = hostChains.get(key);
  const next = previous
    ? previous.then(async () => {
        await sleep(Number(process.env.FETCH_HOST_SPACING_MS ?? 1_200));
        return run();
      })
    : Promise.resolve().then(run);
  // 队列上挂的是「不会 reject」的那条链：一个请求失败不能把后面排队的请求一起带崩。
  const guard = next.catch(() => undefined);
  guard.then(() => {
    if (hostChains.get(key) === guard) hostChains.delete(key);
  });
  hostChains.set(key, guard);
  return next;
}

export function headersFor(url, extra = {}) {
  const headers = { 'user-agent': USER_AGENT, accept: ACCEPT, ...extra };
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_API_TOKEN;
  if (token) {
    try {
      if (new URL(url).hostname === 'api.github.com') headers.authorization = `Bearer ${token}`;
    } catch {
      return headers;
    }
  }
  return headers;
}

export async function fetchUrl(url, { timeoutMs = 15_000, retries = 2, headers = {} } = {}) {
  return queueHost(hostOf(url), () => fetchWithRetries(url, { timeoutMs, retries, headers }));
}

// 配图是二进制：读成文本会坏字节；超大文件先按 content-length 挡在门外，别下载完才发现太大。
export async function fetchBytes(url, { timeoutMs = 20_000, retries = 1, headers = {}, maxBytes = 4_194_304 } = {}) {
  return queueHost(hostOf(url), () => fetchWithRetries(url, { timeoutMs, retries, headers, binary: true, maxBytes }));
}

async function fetchWithRetries(url, { timeoutMs, retries, headers, binary = false, maxBytes = 4_194_304 }) {
  let lastError = 'fetch failed';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        headers: headersFor(url, headers),
      });
      const contentType = response.headers.get('content-type') ?? '';
      const declared = Number(response.headers.get('content-length') ?? '');
      const oversized = binary && Number.isFinite(declared) && declared > maxBytes ? declared : null;
      let payload = null;
      if (oversized === null) {
        if (binary) payload = response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
        else payload = await response.text();
      }
      if (response.ok && oversized === null) {
        if (!binary) return { ok: true, status: response.status, body: payload, contentType };
        if (payload.byteLength > maxBytes) return { ok: false, status: response.status, error: `图片过大（${payload.byteLength} 字节）` };
        return { ok: true, status: response.status, bytes: payload, contentType };
      }
      if (oversized !== null) return { ok: false, status: response.status, error: `图片过大（${oversized} 字节）` };
      lastError = `HTTP ${response.status}`;
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === retries) {
        return binary
          ? { ok: false, status: response.status, error: lastError }
          : { ok: false, status: response.status, error: lastError, body: payload };
      }
      await sleep(backoffMs(attempt, Number(response.headers.get('retry-after'))));
    } catch (error) {
      lastError = error?.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : (error?.cause?.code ?? error?.message ?? String(error));
      if (attempt === retries) break;
      await sleep(backoffMs(attempt));
    }
  }
  return { ok: false, status: 0, error: lastError };
}
