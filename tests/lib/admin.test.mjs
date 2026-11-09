import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSessionCookieHeader,
  createSessionToken,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  loginAllowed,
  normalizeReason,
  normalizeSlug,
  parseCookies,
  readSessionToken,
  sameOriginAndCsrf,
  SESSION_COOKIE,
  sessionCookieHeader,
  timingSafeEqual,
} from '../../src/lib/admin.mjs';

const secret = 'unit-test-secret-value';

test('sessionTokenRoundTripsAndRejectsTampering', async () => {
  const token = await createSessionToken(secret, { user: 'editor' });
  const read = await readSessionToken(secret, token);
  assert.equal(read.valid, true);
  assert.equal(read.user, 'editor');

  const [, signature] = token.split('.');
  assert.equal((await readSessionToken(secret, `${token.slice(0, token.length - signature.length)}deadbeef`)).valid, false);
  assert.equal((await readSessionToken('另一个密钥', token)).valid, false);
  assert.equal((await readSessionToken(secret, '')).valid, false);
});

test('sessionTokenExpires', async () => {
  const token = await createSessionToken(secret, { issuedAt: new Date(Date.now() - 7200_000), maxAgeSeconds: 3600 });
  const read = await readSessionToken(secret, token);
  assert.equal(read.valid, false);
  assert.equal(read.reason, 'expired');
});

test('sessionCookiesAreHttpOnlyAndClearOnLogout', async () => {
  const token = await createSessionToken(secret);
  const header = sessionCookieHeader(token);
  assert.ok(header.startsWith(`${SESSION_COOKIE}=`));
  assert.ok(header.includes('HttpOnly'));
  assert.ok(header.includes('SameSite=Lax'));
  assert.ok(header.includes('Secure'));
  assert.ok(clearSessionCookieHeader().includes('Max-Age=0'));
  assert.deepEqual(parseCookies(`other=1; ${SESSION_COOKIE}=${token}`)[SESSION_COOKIE], token);
});

function fakeRequest({ method = 'POST', origin = 'https://tool-hub.xyz', headers = {} } = {}) {
  const all = new Headers(headers);
  return { method, url: 'https://tool-hub.xyz/api/items/abcd0123ef56/hide', headers: all, origin };
}

test('stateChangingRequestsNeedCsrfHeaderAndSameOrigin', () => {
  const withGuard = fakeRequest({ headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, origin: 'https://tool-hub.xyz' } });
  assert.equal(sameOriginAndCsrf(withGuard).ok, true);
  assert.equal(sameOriginAndCsrf(fakeRequest({ headers: { origin: 'https://tool-hub.xyz' } })).reason, 'csrf');
  assert.equal(sameOriginAndCsrf(fakeRequest({ headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, origin: 'https://evil.example' } })).reason, 'origin');
  assert.equal(sameOriginAndCsrf(fakeRequest({ headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE } })).reason, 'origin');
});

test('loginRateLimitBlocksAfterTooManyFailures', () => {
  assert.equal(loginAllowed({ failures: 9 }), true);
  assert.equal(loginAllowed({ failures: 10 }), false);
  assert.equal(loginAllowed({ failures: '乱写' }), false);
});

test('slugAndReasonNormalizationKeepInputBounded', () => {
  assert.equal(normalizeSlug('abcd0123ef56'), 'abcd0123ef56');
  assert.equal(normalizeSlug('  ABCD0123EF56  '), null);
  assert.equal(normalizeSlug('短'), null);
  assert.equal(normalizeReason('内容违法\n\n').length, 4);
  assert.equal(normalizeReason('x'.repeat(400)).length, 160);
});

test('timingSafeEqualHandlesDifferentLengthsWithoutThrowing', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});
