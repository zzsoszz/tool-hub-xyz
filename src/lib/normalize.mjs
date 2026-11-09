import { createHash } from 'node:crypto';
import { decodeEntities } from './xml.mjs';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fb_ref', 'fb_source', 'ref', 'referer', 'source', 'src', 'gclid', 'mc_cid', 'mc_eid',
  'igshid', 'spm', 'cmp', 'share_token', 'scid', 'ck', 'wm', 'from',
];

export function stripHtml(value) {
  let text = String(value ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]{0,400}>/g, ' ')
    .replace(/&lt;[^<]{0,200}&gt;/g, ' ');
  text = decodeEntities(text);
  return collapseWhitespace(text);
}

export function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

export function cleanText(value, maxLength = 200) {
  const text = collapseWhitespace(String(value ?? '').replace(/\n/g, ' '));
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}\u2026` : text;
}

export function summarize(value, maxLength = 320) {
  const text = stripHtml(value).replace(/\n/g, ' ');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}\u2026` : text;
}

export function parseDate(value) {
  const raw = collapseWhitespace(String(value ?? '').replace(/\n/g, ' '));
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000 && numeric <= 4_102_444_800) {
    return new Date(numeric * 1000);
  }
  if (Number.isFinite(numeric) && numeric > 4_102_444_800 && numeric <= 4_102_444_800_000) {
    return new Date(numeric);
  }
  const normalized = raw
    .replace(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})/, '$1T$2')
    .replace(/ (\+|\-)(\d{2})(\d{2})$/, ' $1$2:$3')
    .replace(/GMT([+-]\d{4})$/, 'GMT$1');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const loose = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (loose) {
    const fallback = new Date(`${loose[1]}-${loose[2]}-${loose[3]}T00:00:00Z`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return null;
}

export function normalizeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  for (const param of TRACKING_PARAMS) parsed.searchParams.delete(param);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.replace(/^www\./, '');
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '').toLowerCase();
}

export function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

export function urlKey(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  return createHash('sha1').update(normalized).digest('hex');
}

export function titleKey(title) {
  const cleaned = cleanText(title, 160).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (cleaned.length < 12) return null;
  return createHash('sha1').update(cleaned).digest('hex');
}

export function dayKey(date, timeZone = 'Asia/Shanghai') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date instanceof Date ? date : new Date());
}

export function timeAgo(date, now = new Date(), timeZone = 'Asia/Shanghai') {
  const minutes = Math.round((now.getTime() - new Date(date).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  const local = new Intl.DateTimeFormat('zh-CN', { timeZone, month: '2-digit', day: '2-digit' }).format(new Date(date));
  return local;
}
