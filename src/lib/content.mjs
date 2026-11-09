import { decodeEntities } from './xml.mjs';
import { absoluteUrl, collapseWhitespace } from './normalize.mjs';

const VOID_TAGS = new Set(['br', 'hr', 'img']);
const DROP_TAGS = new Set([
  'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select',
  'textarea', 'svg', 'math', 'template', 'head', 'meta', 'link', 'title', 'canvas', 'video', 'audio',
  'source', 'picture', 'noscript',
]);
const KEEP_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'blockquote', 'pre', 'code', 'kbd', 'samp', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'figure', 'figcaption', 'dl', 'dt', 'dd',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'small', 'mark', 'sup', 'sub', 'span', 'a', 'img',
  'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);
const HEADING_MAP = { h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4' };
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead',
  'tbody', 'tfoot', 'tr', 'th', 'td', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'br',
]);

function prepare(raw) {
  let text = String(raw ?? '');
  if (!text) return '';
  text = text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<!\[CDATA\[|\]\]>/g, ' ');
  if (/^\s*&lt;[a-z]/i.test(text)) text = decodeEntities(text);
  return text;
}

function parseAttributes(blob) {
  const attrs = {};
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = pattern.exec(blob))) {
    const name = match[1].toLowerCase();
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function tokenize(html) {
  const tokens = [];
  const pattern = /<(\/)?([A-Za-z][A-Za-z0-9:._-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(html))) {
    if (match.index > cursor) tokens.push({ type: 'text', text: html.slice(cursor, match.index) });
    const name = match[2].toLowerCase();
    const type = match[1] ? 'close' : match[4] || VOID_TAGS.has(name) ? 'void' : 'open';
    tokens.push({ type, name, attrs: parseAttributes(match[3] ?? '') });
    cursor = pattern.lastIndex;
  }
  if (cursor < html.length) tokens.push({ type: 'text', text: html.slice(cursor) });
  return tokens;
}

function safeLink(attrs, baseUrl) {
  const target = absoluteUrl(attrs.href ?? '', baseUrl);
  if (!target || !/^https?:/i.test(target)) return null;
  return target;
}

function safeImage(attrs, baseUrl) {
  const target = absoluteUrl(attrs.src ?? '', baseUrl);
  if (!target || !/^https?:/i.test(target)) return null;
  const alt = collapseWhitespace(attrs.alt ?? '').slice(0, 160);
  return `<img src="${escapeAttribute(target)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function textOf(html) {
  return collapseWhitespace(html.replace(/<\/(p|li|tr|blockquote|pre|h[1-6])>/gi, '\n').replace(/<[^>]{0,200}>/g, ' '));
}

function segmentText(segment) {
  return segment.pieces.map((piece) => piece.text).join('');
}

function cutText(text, room) {
  const limit = Math.min(text.length, Math.max(room, 0));
  let cut = limit;
  const sentenceEnd = /[。！？；.!?;]/;
  for (let at = limit; at > Math.floor(limit * 0.55); at -= 1) {
    if (sentenceEnd.test(text[at - 1])) {
      cut = at;
      break;
    }
  }
  const newline = text.lastIndexOf('\n', limit);
  if (newline > Math.floor(limit * 0.55)) cut = Math.max(cut, newline);
  return `${text.slice(0, cut).trimEnd()}…`;
}

// 把第三方正文收敛成安全子集：保留段落/列表/表格/代码，丢弃脚本与事件属性，
// 并按段落为边界截断，避免条目页出现「半张表格」或糊成一坨的长串。
export function sanitizeArticle(raw, { baseUrl = '', maxChars = 3200, minChars = 80 } = {}) {
  const source = prepare(raw);
  if (!source.trim()) return null;

  const segments = [];
  const stack = [];
  let segment = null;
  let skipTag = null;
  let skipDepth = 0;

  const flush = () => {
    if (segment && segment.pieces.some((piece) => piece.html.trim() || piece.text.trim())) segments.push(segment);
    segment = null;
  };
  const ensure = () => {
    if (!segment) segment = { pieces: [], visible: '' };
    return segment;
  };
  const append = (target, html, text) => {
    if (!text) {
      target.pieces.push({ html, text: '' });
      return;
    }
    const prefix = target.visible && !/[ \n]$/.test(target.visible) ? ' ' : '';
    target.pieces.push({ html, text: `${prefix}${text}` });
    target.visible = `${target.visible}${prefix}${text}`;
  };

  for (const token of tokenize(source)) {
    if (skipTag) {
      if (token.type === 'open' && token.name === skipTag) skipDepth += 1;
      else if (token.type === 'close' && token.name === skipTag) {
        skipDepth -= 1;
        if (skipDepth === 0) skipTag = null;
      }
      continue;
    }

    if (token.type === 'text') {
      const text = collapseWhitespace(decodeEntities(token.text));
      if (!text) continue;
      ensure();
      append(segment, escapeHtml(text), text);
      continue;
    }

    if (DROP_TAGS.has(token.name)) {
      if (token.type !== 'close') {
        skipTag = token.name;
        skipDepth = 1;
      }
      continue;
    }

    if (!KEEP_TAGS.has(token.name)) continue;

    if (token.type === 'void') {
      ensure();
      if (token.name === 'img') {
        const image = safeImage(token.attrs, baseUrl);
        if (!image) continue;
        append(segment, image, '');
        continue;
      }
      append(segment, `<${token.name}>`, token.name === 'br' ? '\n' : ' ');
      continue;
    }

    if (token.type === 'open') {
      if (token.name === 'a') {
        const href = safeLink(token.attrs, baseUrl);
        if (!href) continue;
        ensure();
        append(segment, `<a href="${escapeAttribute(href)}" target="_blank" rel="nofollow noopener noreferrer">`, '');
        stack.push({ name: 'a', tag: 'a' });
        continue;
      }
      ensure();
      const tag = HEADING_MAP[token.name] ?? token.name;
      append(segment, `<${tag}>`, '');
      stack.push({ name: token.name, tag });
      continue;
    }

    const index = stack.findIndex((entry) => entry.name === token.name);
    if (index === -1) continue;
    for (let at = stack.length - 1; at >= index; at -= 1) {
      append(segment, `</${stack[at].tag}>`, '');
      stack.pop();
    }
    if (BLOCK_TAGS.has(token.name)) append(segment, '', '\n');
    if (!stack.length) flush();
  }
  flush();

  if (!segments.length) return null;
  const totalChars = segments.reduce((sum, entry) => sum + segmentText(entry).length, 0);
  if (totalChars < minChars) return null;

  const kept = [];
  const keptText = [];
  let used = 0;
  let truncated = false;
  for (const entry of segments) {
    if (truncated) break;
    const taken = [];
    const takenText = [];
    for (let at = 0; at < entry.pieces.length; at += 1) {
      const piece = entry.pieces[at];
      if (truncated) {
        if (!piece.text) taken.push(piece.html);
        continue;
      }
      if (used + piece.text.length <= maxChars) {
        taken.push(piece.html);
        takenText.push(piece.text);
        used += piece.text.length;
        continue;
      }
      const room = Math.max(0, maxChars - used);
      if (room > 20) {
        const cut = cutText(piece.text, room);
        taken.push(piece.html.slice(0, 0) + escapeHtml(cut));
        takenText.push(cut);
        used += cut.length;
      }
      for (let rest = at + 1; rest < entry.pieces.length; rest += 1) {
        if (!entry.pieces[rest].text) taken.push(entry.pieces[rest].html);
      }
      truncated = true;
    }
    kept.push(taken.join(''));
    keptText.push(takenText.join(''));
  }

  const leadParts = [];
  for (const entry of segments) {
    if (entry.pieces.some((piece) => /<(table|pre)/i.test(piece.html))) break;
    const text = segmentText(entry).trim();
    if (text) leadParts.push(text);
    if (leadParts.join('\n').length >= 420) break;
  }

  return {
    html: kept.join('\n'),
    text: collapseWhitespace(keptText.join('\n')).slice(0, 6000),
    lead: collapseWhitespace(leadParts.join('\n')).slice(0, 460) || collapseWhitespace(segmentText(segments[0])).slice(0, 460),
    chars: totalChars,
    shown: used,
    truncated,
  };
}

export function textToArticle(text, options = {}) {
  const plain = collapseWhitespace(String(text ?? ''));
  if (!plain) return null;
  const paragraphs = plain.split(/\n{1,}/).map((part) => part.trim()).filter(Boolean);
  return sanitizeArticle(paragraphs.map((part) => `<p>${escapeHtml(part)}</p>`).join('\n'), options);
}
