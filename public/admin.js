// 管理员侧：登录状态、条目下架/恢复、已下架条目兜底隐藏。
// 只走站内 API，带 x-requested-with 头配合服务端的 CSRF 校验。
const CSRF_HEADER = 'x-requested-with';
const CSRF_HEADER_VALUE = 'tool-hub';

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_HEADER_VALUE, ...options.headers },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `请求失败（HTTP ${response.status}）`);
  return payload;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function note(bar, text, kind = 'info') {
  const line = el('span', `admin-note is-${kind}`, text);
  bar.append(line);
  return line;
}

async function loadIndex() {
  try {
    const response = await fetch('/data/items.json', { credentials: 'same-origin' });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

function hideRow(slug) {
  for (const row of document.querySelectorAll(`li[data-slug="${slug}"]`)) row.hidden = true;
}

function rowButton(slug) {
  const rows = [...document.querySelectorAll(`li[data-slug="${slug}"]`)];
  for (const row of rows) {
    const subtext = row.querySelector('.subtext');
    if (!subtext || subtext.querySelector('[data-admin-action]')) continue;
    subtext.append(adminAction(slug, row.dataset.title ?? ''));
  }
}

function adminAction(slug, title) {
  const button = el('button', 'admin-toggle');
  button.type = 'button';
  button.dataset.adminAction = slug;
  button.textContent = '下架';
  button.addEventListener('click', async () => {
    const reason = window.prompt(`下架《${title || slug}》的原因（可留空）`, '内容质量不达标');
    if (reason === null) return;
    button.disabled = true;
    button.textContent = '处理中';
    try {
      const payload = await api(`/api/items/${slug}/hide`, { method: 'POST', body: JSON.stringify({ reason }) });
      button.textContent = '已下架';
      for (const row of document.querySelectorAll(`li[data-slug="${slug}"]`)) row.hidden = true;
      const mount = document.querySelector(`[data-admin-mount][data-slug="${slug}"]`);
      if (mount && document.querySelector('.item')) {
        note(mount, '这条内容已下架，刷新前页面仍会显示。', 'ok');
      }
      for (const slugValue of payload.hiddenSlugs ?? []) hideRow(slugValue);
    } catch (error) {
      button.disabled = false;
      button.textContent = '下架失败';
      const bar = button.closest('.admin-bar') ?? button.parentElement;
      if (bar) note(bar, error.message, 'bad');
    }
  });
  return button;
}

function loginForm(bar) {
  const details = el('details', 'admin-login');
  const summary = el('summary', '', '管理员登录');
  const form = el('form', 'admin-form');
  form.method = 'post';
  const user = el('input', 'admin-user');
  user.type = 'text';
  user.name = 'user';
  user.autocomplete = 'username';
  user.required = true;
  const password = el('input', 'admin-password');
  password.type = 'password';
  password.name = 'password';
  password.autocomplete = 'current-password';
  password.required = true;
  const submit = el('button', 'admin-submit');
  submit.type = 'submit';
  submit.textContent = '登录';
  const status = el('p', 'admin-status');
  form.append(
    el('label', '', '账号'), user,
    el('label', '', '密码'), password,
    submit,
    status,
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = '正在登录……';
    try {
      const payload = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ user: user.value, password: password.value }) });
      status.textContent = `已登录：${payload.user}`;
      window.location.reload();
    } catch (error) {
      submit.disabled = false;
      status.textContent = error.message;
    }
  });
  details.append(summary, form);
  bar.append(details);
}

function renderAdminBar(bar, session) {
  bar.classList.add('is-active');
  bar.append(el('span', 'admin-badge', `管理员：${session.user ?? '已登录'}`));
  const logout = el('button', 'admin-logout');
  logout.type = 'button';
  logout.textContent = '退出登录';
  logout.addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
      window.location.reload();
    } catch (error) {
      note(bar, error.message, 'bad');
    }
  });
  bar.append(logout);
  bar.append(el('span', 'admin-hint', '列表和条目页会出现「下架」按钮；下架后该条目在归档与 Markdown 导出里一并剔除。'));
}

async function renderHiddenPanel(bar) {
  const payload = await api('/api/hidden');
  const slugs = payload.slugs ?? [];
  if (!slugs.length) return;
  const index = await loadIndex();
  const panel = el('div', 'admin-hidden');
  panel.append(el('span', 'admin-hidden-title', `已下架 ${slugs.length} 条`));
  for (const slug of slugs) {
    const row = el('span', 'admin-hidden-row');
    row.append(el('span', 'admin-hidden-name', index[slug]?.title ?? slug));
    const restore = el('button', 'admin-restore');
    restore.type = 'button';
    restore.textContent = '恢复';
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      try {
        await api(`/api/items/${slug}/unhide`, { method: 'POST' });
        restore.textContent = '已恢复（下次构建后生效）';
      } catch (error) {
        restore.disabled = false;
        restore.textContent = '恢复失败';
        note(bar, error.message, 'bad');
      }
    });
    row.append(restore);
    panel.append(row);
  }
  bar.append(panel);
}

async function main() {
  const bar = document.querySelector('[data-admin-bar]');
  const mounts = [...document.querySelectorAll('[data-admin-mount]')];
  if (!bar && !mounts.length) return;

  let hidden = [];
  try {
    hidden = (await api('/api/hidden')).slugs ?? [];
  } catch {
    // 论坛后端不可用时，页面照常展示，只是没有管理功能。
    return;
  }
  for (const slug of hidden) hideRow(slug);

  let session = { admin: false, user: null };
  try {
    session = await api('/api/admin/session');
  } catch {
    return;
  }

  if (!session.admin) {
    if (bar) loginForm(bar);
    return;
  }

  if (bar) {
    renderAdminBar(bar, session);
    await renderHiddenPanel(bar);
  }
  for (const mount of mounts) {
    const slug = mount.dataset.slug;
    if (!slug) continue;
    mount.append(adminAction(slug, document.querySelector('.item h1')?.textContent ?? ''));
  }
  for (const row of document.querySelectorAll('li[data-slug]:not([hidden])')) {
    rowButton(row.dataset.slug);
  }
}

main();
