import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/worker.mjs';
import { createSessionToken } from '../src/lib/admin.mjs';

const ORIGIN = 'https://tool-hub.xyz';
const INDEX = {
  abcd0123ef56: { title: '可下架的条目', url: 'https://example.com/a', source: '来源' },
  111122223333: { title: '留下的条目', url: 'https://example.com/b', source: '来源' },
};

function fakeDb() {
  const store = { hidden_items: [], admin_attempts: [] };
  const statements = [
    {
      test: /FROM admin_attempts/,
      first: ([ipHash, windowStart]) => ({ total: store.admin_attempts.filter((row) => row.ip_hash === ipHash && row.ok === 0 && row.created_at >= windowStart).length }),
    },
    {
      test: /INSERT INTO admin_attempts/,
      run: ([ipHash, ok, createdAt]) => { store.admin_attempts.push({ ip_hash: ipHash, ok, created_at: createdAt }); },
    },
    {
      test: /SELECT slug FROM hidden_items ORDER BY/,
      all: () => ({ results: [...store.hidden_items] }),
    },
    {
      test: /SELECT slug FROM hidden_items WHERE slug/,
      first: ([slug]) => store.hidden_items.find((row) => row.slug === slug) ?? null,
    },
    {
      test: /INSERT OR REPLACE INTO hidden_items/,
      run: ([slug, url, title, reason, actor, hiddenAt]) => {
        store.hidden_items = [slug, ...store.hidden_items.filter((row) => row.slug !== slug)].map((value) => ({
          slug: value, url, title, reason, actor, hidden_at: hiddenAt,
        }));
      },
    },
    {
      test: /DELETE FROM hidden_items WHERE slug/,
      run: ([slug]) => { store.hidden_items = store.hidden_items.filter((row) => row.slug !== slug); },
    },
  ];
  const db = {
    store,
    prepare(sql) {
      const statement = statements.find((entry) => entry.test.test(sql));
      if (!statement) throw new Error(`测试替身没实现这条 SQL: ${sql}`);
      let bound = [];
      const api = {
        bind(...args) { bound = args; return api; },
        async first() { return statement.first ? statement.first(bound) : null; },
        async all() { return statement.all ? statement.all(bound) : { results: [] }; },
        async run() {
          if (statement.run) statement.run(bound);
          return { meta: { changes: 1 } };
        },
      };
      return api;
    },
  };
  return db;
}

function fakeAssets() {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/data/items.json') return new Response(JSON.stringify(INDEX), { headers: { 'content-type': 'application/json' } });
      return new Response(`asset:${path}`, { headers: { 'content-type': 'text/html' } });
    },
  };
}

function envFor(db) {
  return { DB: db, ASSETS: fakeAssets(), ADMIN_USER: 'editor', ADMIN_PASSWORD: 'correct-horse', MODERATION_TOKEN: 'unit-test-secret', COMMENT_SALT: 'salt' };
}

function apiRequest(path, { body, method = body === undefined ? 'GET' : 'POST', headers = {}, cookie } = {}) {
  const all = new Headers(headers);
  if (cookie) all.set('cookie', cookie);
  if (body) {
    all.set('content-type', 'application/json');
    all.set('x-requested-with', 'tool-hub');
    all.set('origin', ORIGIN);
  }
  return new Request(`${ORIGIN}${path}`, { method, headers: all, body: body ? JSON.stringify(body) : undefined });
}

test('adminLoginRejectsCsrfAndBadCredentialsThenIssuesSessionCookie', async () => {
  const env = envFor(fakeDb());
  const noCsrf = new Request(`${ORIGIN}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ user: 'editor', password: 'correct-horse' }),
  });
  const csrf = await worker.fetch(noCsrf, env);
  assert.equal(csrf.status, 403);

  const wrong = await worker.fetch(apiRequest('/api/admin/login', { body: { user: 'editor', password: '错的' } }), env);
  assert.equal(wrong.status, 401);

  const ok = await worker.fetch(apiRequest('/api/admin/login', { body: { user: 'editor', password: 'correct-horse' } }), env);
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /^toolhub_admin=/);
  assert.match(cookie, /HttpOnly/);

  const session = await worker.fetch(apiRequest('/api/admin/session', { headers: { cookie } }), env);
  assert.deepEqual(await session.json(), { ok: true, admin: true, user: 'editor' });
});

test('adminLoginRateLimitsRepeatedFailures', async () => {
  const env = envFor(fakeDb());
  let status = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    status = (await worker.fetch(apiRequest('/api/admin/login', { body: { user: 'editor', password: '错的' } }), env)).status;
  }
  assert.equal(status, 401);
  const blocked = await worker.fetch(apiRequest('/api/admin/login', { body: { user: 'editor', password: 'correct-horse' } }), env);
  assert.equal(blocked.status, 429);
});

test('hidingAnItemNeedsAdminAndMakesTheItemPageReturn410', async () => {
  const env = envFor(fakeDb());
  const anonymous = await worker.fetch(apiRequest('/api/items/abcd0123ef56/hide', { body: { reason: '内容质量不达标' } }), env);
  assert.equal(anonymous.status, 401);

  const cookie = 'toolhub_admin=' + await createSessionToken(env.MODERATION_TOKEN, { user: 'editor' });
  const hidden = await worker.fetch(apiRequest('/api/items/abcd0123ef56/hide', { body: { reason: '内容过少' }, headers: { cookie } }), env);
  assert.equal(hidden.status, 200);
  assert.deepEqual((await hidden.json()).hiddenSlugs, ['abcd0123ef56']);

  const itemPage = await worker.fetch(new Request(`${ORIGIN}/item/abcd0123ef56`), env);
  assert.equal(itemPage.status, 410);
  assert.match(await itemPage.text(), /这条内容已下架/);

  const kept = await worker.fetch(new Request(`${ORIGIN}/item/111122223333`), env);
  assert.equal(kept.status, 200);

  const listed = await worker.fetch(new Request(`${ORIGIN}/api/hidden`), env);
  assert.deepEqual((await listed.json()).slugs, ['abcd0123ef56']);

  const index = await worker.fetch(new Request(`${ORIGIN}/data/items.json`), env);
  assert.deepEqual(Object.keys(await index.json()), ['111122223333']);

  const restored = await worker.fetch(apiRequest('/api/items/abcd0123ef56/unhide', { body: {}, headers: { cookie } }), env);
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).hiddenSlugs, []);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/item/abcd0123ef56`), env)).status, 200);
});

test('apiWithoutD1BindingFailsLoudlyInsteadOfServingAssets', async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/hidden`), { ASSETS: fakeAssets() });
  assert.equal(response.status, 503);
});
