export const COMMENT_LIMITS = {
  minBody: 3,
  maxBody: 2000,
  maxAuthor: 24,
  maxDepth: 3,
  minIntervalMs: 20_000,
  maxPerHour: 8,
  maxParentIds: 200,
};

const SLUG_PATTERN = /^[0-9a-f]{12}$/;

export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

export function sanitizeAuthor(value) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COMMENT_LIMITS.maxAuthor);
  return text || '匿名';
}

export function sanitizeBody(value) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();
  return text;
}

export function validateComment(payload) {
  const errors = [];
  const item = String(payload?.item ?? '');
  if (!isValidSlug(item)) errors.push('条目编号无效');
  const body = sanitizeBody(payload?.body);
  if (body.length < COMMENT_LIMITS.minBody) errors.push('评论太短（至少 3 个字符）');
  if (body.length > COMMENT_LIMITS.maxBody) errors.push(`评论太长（最多 ${COMMENT_LIMITS.maxBody} 字）`);
  const parent = payload?.parent === undefined || payload?.parent === null || payload?.parent === ''
    ? null
    : Number(payload.parent);
  if (parent !== null && (!Number.isInteger(parent) || parent <= 0)) errors.push('回复对象无效');
  if (payload?.website) errors.push('反垃圾校验失败');
  return { ok: errors.length === 0, errors, item, body, author: sanitizeAuthor(payload?.author), parent };
}

export function checkRateLimit({ lastCommentAt, recentCount, now = new Date(), intervalMs = COMMENT_LIMITS.minIntervalMs, perHour = COMMENT_LIMITS.maxPerHour }) {
  if (lastCommentAt) {
    const gap = now.getTime() - new Date(lastCommentAt).getTime();
    if (gap < intervalMs) return { ok: false, reason: `太快了，请再等 ${Math.ceil((intervalMs - gap) / 1000)} 秒`, retryAfter: Math.ceil((intervalMs - gap) / 1000) };
  }
  if (recentCount >= perHour) return { ok: false, reason: '本小时评论次数已用完，稍后再来', retryAfter: 3600 };
  return { ok: true, retryAfter: 0 };
}

export function buildCommentTree(rows) {
  const nodes = rows.map((row) => ({ ...row, replies: [] }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];
  for (const node of nodes) {
    const parent = node.parent ? byId.get(node.parent) : null;
    if (parent) {
      node.depth = (parent.depth ?? 0) + 1;
      if (node.depth >= COMMENT_LIMITS.maxDepth) {
        node.parent = parent.parent ?? null;
        const grand = node.parent ? byId.get(node.parent) : null;
        node.depth = (grand?.depth ?? 0) + 1;
        (grand ?? parent).replies.push(node);
      } else {
        parent.replies.push(node);
      }
    } else {
      node.depth = 0;
      roots.push(node);
    }
  }
  const ordered = [];
  const walk = (node) => {
    ordered.push(node);
    for (const child of node.replies) walk(child);
  };
  for (const root of roots) walk(root);
  return ordered;
}
