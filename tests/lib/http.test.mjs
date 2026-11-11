import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUrl } from '../../src/lib/http.mjs';

function withFetch(implementation, run) {
  const original = globalThis.fetch;
  process.env.FETCH_HOST_SPACING_MS = '0';
  globalThis.fetch = implementation;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = original;
      delete process.env.FETCH_HOST_SPACING_MS;
    });
}

function response(body = 'ok') {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    text: async () => body,
  };
}

test('sendsRequestsToTheSameHostOneAtATime', async () => {
  const inFlight = { active: 0, peak: 0 };
  const result = await withFetch(async () => {
    inFlight.active += 1;
    inFlight.peak = Math.max(inFlight.peak, inFlight.active);
    await new Promise((resolve) => setTimeout(resolve, 25));
    inFlight.active -= 1;
    return response();
  }, () => Promise.all([
    fetchUrl('https://reddit.test/r/A/new.rss'),
    fetchUrl('https://reddit.test/r/B/new.rss'),
    fetchUrl('https://reddit.test/r/C/new.rss'),
    fetchUrl('https://other.test/feed'),
  ]));
  assert.equal(result.length, 4);
  assert.equal(inFlight.peak, 2, '同一站点串行、不同站点仍可并发');
});

test('aFailedRequestDoesNotBlockTheRestOfTheHostQueue', async () => {
  let calls = 0;
  const results = await withFetch(async () => {
    calls += 1;
    if (calls === 1) throw new Error('connection reset');
    return response('second');
  }, () => Promise.all([fetchUrl('https://host.test/a', { retries: 0, timeoutMs: 500 }), fetchUrl('https://host.test/b', { retries: 0, timeoutMs: 500 })]));
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
  assert.equal(results[1].body, 'second');
});

test('retriesThrottledResponsesWithBackoff', async () => {
  let calls = 0;
  const result = await withFetch(async () => {
    calls += 1;
    if (calls < 2) return { ok: false, status: 429, headers: { get: () => null }, text: async () => '' };
    return response('second');
  }, () => fetchUrl('https://throttled.test/feed', { retries: 1, timeoutMs: 500 }));
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});
