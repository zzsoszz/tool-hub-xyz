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

async function fetchWithRetries(url, { timeoutMs, retries, headers }) {
  let lastError = 'fetch failed';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        headers: headersFor(url, headers),
      });
      const body = await response.text();
      if (response.ok) {
        return { ok: true, status: response.status, body, contentType: response.headers.get('content-type') ?? '' };
      }
      lastError = `HTTP ${response.status}`;
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === retries) {
        return { ok: false, status: response.status, error: lastError, body };
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
