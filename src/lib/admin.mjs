// 管理员会话与登录限制：签名 cookie + 失败次数限流，全部在 Worker 边缘完成，不引入第三方依赖。
import { isValidSlug } from './forum.mjs';

export const SESSION_COOKIE = 'toolhub_admin';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'tool-hub';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const LOGIN_LIMITS = { maxFailures: 10, windowMinutes: 15 };

const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    cookies[name] = rest.join('=');
  }
  return cookies;
}

function base64url(value) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unbase64url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
}

export async function createSessionToken(secret, { issuedAt = new Date(), maxAgeSeconds = SESSION_MAX_AGE_SECONDS, user = 'admin' } = {}) {
  const payload = base64url(JSON.stringify({ user, iat: issuedAt.toISOString(), exp: new Date(issuedAt.getTime() + maxAgeSeconds * 1000).toISOString() }));
  const signature = await hmac(secret, payload);
  return `${payload}.${signature}`;
}

export async function readSessionToken(secret, token) {
  const [payload, signature] = String(token ?? '').split('.');
  if (!payload || !signature) return { valid: false, reason: 'missing' };
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(signature, expected)) return { valid: false, reason: 'signature' };
  let claims;
  try {
    claims = JSON.parse(unbase64url(payload));
  } catch {
    return { valid: false, reason: 'payload' };
  }
  const expiresAt = Date.parse(claims.exp ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, user: claims.user ?? 'admin', expiresAt: new Date(expiresAt).toISOString() };
}

export function sessionCookieHeader(token, { maxAgeSeconds = SESSION_MAX_AGE_SECONDS } = {}) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax; Secure`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export function timingSafeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (const [index, char] of left.split('').entries()) diff |= char.charCodeAt(0) ^ right.charCodeAt(index);
  return diff === 0;
}

// 改状态的请求必须带自定义头并来自同源，浏览器跨站表单没法同时满足这两条。
export function sameOriginAndCsrf(request) {
  if (request.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) return { ok: false, reason: 'csrf' };
  const origin = request.headers.get('origin');
  if (!origin) return { ok: false, reason: 'origin' };
  return origin === new URL(request.url).origin ? { ok: true } : { ok: false, reason: 'origin' };
}

export function normalizeSlug(value) {
  const slug = String(value ?? '').trim();
  return isValidSlug(slug) ? slug : null;
}

export function normalizeReason(value) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim();
  return text.slice(0, 160);
}

// 读不到失败次数时按“已经用完额度”处理：限流这种控制宁可拒绝，不能因为数据异常放行。
export function loginAllowed({ failures, limit = LOGIN_LIMITS.maxFailures }) {
  const count = Number(failures);
  if (!Number.isFinite(count)) return false;
  return count < limit;
}
