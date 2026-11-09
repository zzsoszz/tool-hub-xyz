export const USER_AGENT = 'tool-hub-bot/1.0 (+https://tool-hub.xyz; daily AI news digest)';

const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, application/json;q=0.8, text/xml;q=0.7, */*;q=0.5';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt, retryAfter) {
  if (retryAfter && Number.isFinite(retryAfter)) return Math.min(retryAfter * 1000, 20_000);
  return 800 * 2 ** attempt;
}

export async function fetchUrl(url, { timeoutMs = 15_000, retries = 2, headers = {} } = {}) {
  let lastError = 'fetch failed';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: ACCEPT, ...headers },
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
