// 论坛前端：点赞数、评论数、评论树、留言提交。零依赖。文章搜索在 /search.js。
(() => {
  'use strict';

  const esc = (value) => String(value ?? '');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `请求失败（HTTP ${response.status}）`);
    return payload;
  }

  function timeAgo(value) {
    const stamp = Date.parse(value ?? '');
    if (Number.isNaN(stamp)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - stamp) / 60000));
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.round(hours / 24);
    return days <= 30 ? `${days} 天前` : new Date(stamp).toISOString().slice(0, 10);
  }

  function commentNode(comment) {
    const wrap = el('article', `comment depth-${Math.min(Number(comment.depth) || 0, 3)}`);
    const head = el('p', 'comment-head');
    head.append(el('strong', 'comment-author', comment.author || '匿名'));
    head.append(el('span', 'comment-time', timeAgo(comment.createdAt)));
    if (comment.itemTitle) {
      const link = el('a', 'comment-item', comment.itemTitle);
      link.href = `/item/${comment.item}`;
      head.append(link);
    }
    wrap.append(head);
    wrap.append(el('p', 'comment-body', comment.body));
    const actions = el('p', 'comment-actions');
    const reply = el('button', 'reply');
    reply.type = 'button';
    reply.textContent = '回复';
    reply.dataset.reply = String(comment.id);
    actions.append(reply);
    wrap.append(actions);
    return wrap;
  }

  function renderComments(list, comments) {
    list.textContent = '';
    if (!comments.length) {
      list.append(el('p', 'empty', '还没有留言，坐个沙发。'));
      return;
    }
    for (const comment of comments) list.append(commentNode(comment));
  }

  const counts = new Map();

  async function loadCounts(slugs) {
    for (let offset = 0; offset < slugs.length; offset += 40) {
      const chunk = slugs.slice(offset, offset + 40);
      try {
        const payload = await api(`/api/counts?items=${chunk.join(',')}`);
        Object.assign(counts, payload.counts ?? {});
      } catch {
        for (const slug of chunk) counts[slug] = { comments: 0, votes: 0 };
      }
    }
    for (const [slug, value] of Object.entries(counts)) applyCounts(slug, value);
  }

  function applyCounts(slug, value) {
    const row = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (row) {
      const count = row.querySelector('[data-count]');
      if (count) count.textContent = value.comments ? `${value.comments} 条讨论` : '评论';
      const score = row.querySelector('[data-score]');
      if (score) score.textContent = String(value.votes ?? 0);
    }
    const section = document.querySelector(`.comments[data-item="${CSS.escape(slug)}"]`);
    if (section) {
      const heading = section.querySelector('.count[data-count]');
      if (heading) heading.textContent = String(value.comments ?? 0);
      const score = section.querySelector('[data-score]');
      if (score) score.textContent = String(value.votes ?? 0);
    }
  }

  function wireVotes() {
    for (const button of document.querySelectorAll('[data-vote]')) {
      button.addEventListener('click', async () => {
        const slug = button.dataset.vote;
        button.disabled = true;
        try {
          const payload = await api(`/api/votes/${slug}`, { method: 'POST' });
          counts[slug] = { comments: counts[slug]?.comments ?? 0, votes: payload.votes };
          applyCounts(slug, counts[slug]);
        } catch (error) {
          button.disabled = false;
          button.title = error.message;
        }
      });
    }
  }

  function wireCommentForm(section) {
    const form = section.querySelector('[data-comment-form]');
    const list = section.querySelector('[data-comment-list]');
    const note = section.querySelector('[data-form-note]');
    const slug = section.dataset.item;
    if (!form || !list) return;
    let parentId = null;

    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-reply]');
      if (!button) return;
      parentId = Number(button.dataset.reply);
      form.querySelector('textarea[name="body"]')?.focus();
      note.textContent = `正在回复 #${parentId}，取消请把表单里的“回复”再点一次。`;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      if (String(data.get('website') ?? '').length) return;
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      note.textContent = '正在发布……';
      try {
        const payload = await api(`/api/comments/${slug}`, {
          method: 'POST',
          body: JSON.stringify({
            item: slug,
            author: data.get('author'),
            body: data.get('body'),
            parent: parentId,
          }),
        });
        list.append(commentNode(payload.comment));
        form.reset();
        parentId = null;
        note.textContent = '已发布，谢谢分享。';
        const next = { comments: (counts[slug]?.comments ?? 0) + 1, votes: counts[slug]?.votes ?? 0 };
        counts[slug] = next;
        applyCounts(slug, next);
      } catch (error) {
        note.textContent = `发布失败：${error.message}`;
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  async function loadItemComments(section) {
    const list = section.querySelector('[data-comment-list]');
    try {
      const payload = await api(`/api/comments/${section.dataset.item}`);
      renderComments(list, payload.comments ?? []);
    } catch (error) {
      list.textContent = '';
      list.append(el('p', 'empty', `讨论暂时不可用：${error.message}`));
    }
  }

  async function loadRecent() {
    const section = document.querySelector('[data-recent]');
    if (!section) return;
    const list = section.querySelector('[data-comment-list]');
    try {
      const payload = await api('/api/comments?limit=30');
      renderComments(list, payload.comments ?? []);
    } catch (error) {
      list.textContent = '';
      list.append(el('p', 'empty', `讨论暂时不可用：${error.message}`));
    }
  }

  async function main() {
    wireVotes();
    const itemSection = document.querySelector('.comments[data-item]');
    if (itemSection) {
      wireCommentForm(itemSection);
      await loadItemComments(itemSection);
    }
    if (document.querySelector('[data-recent]')) await loadRecent();
    const slugs = [...document.querySelectorAll('[data-slug]')].map((node) => node.dataset.slug).filter(Boolean);
    const single = itemSection?.dataset.item;
    if (single && !slugs.includes(single)) slugs.push(single);
    if (slugs.length) await loadCounts(slugs);
  }

  main().catch(() => {});
})();
