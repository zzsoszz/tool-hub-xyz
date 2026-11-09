import { timeAgo } from './normalize.mjs';
import { domainOf, itemImage, itemSlug, rankCompare } from './items.mjs';
import { monthKey, sortMode, sortModes } from './listview.mjs';
import { repairArticle } from './content.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(value) {
  return escapeHtml(value);
}

export function zhLabel(digest) {
  const [year, month, day] = digest.day.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

export function displayTitle(item) {
  return item.zhTitle || item.title;
}

export function displaySummary(item) {
  return item.zhSummary || item.summary || '';
}

function metricsLabel(item) {
  const metrics = item.metrics ?? {};
  const parts = [];
  if (metrics.points) parts.push(`${metrics.points} 分`);
  if (metrics.stars) parts.push(`★ ${metrics.stars}`);
  if (metrics.upvotes) parts.push(`▲ ${metrics.upvotes}`);
  if (metrics.comments) parts.push(`${metrics.comments} 评论`);
  return parts.join(' · ');
}

export function menuFor(sections, activeId) {
  const links = (sections ?? []).map((section) => {
    const href = section.href ?? `/s/${section.id}`;
    const active = section.id === activeId ? ' class="active"' : '';
    return `<a${active} href="${escapeHtml(href)}">${escapeHtml(section.label)}</a>`;
  });
  return `  <nav class="menu">${links.join('')}</nav>`;
}

function page({ title, description, canonical, siteUrl, repoUrl = 'https://github.com/zzsoszz/tool-hub-xyz', menu = '', body, scripts = [] }) {
  const tags = [...scripts, { src: '/admin.js', type: 'module' }].map((entry) => {
    const { src, type } = typeof entry === 'string' ? { src: entry } : entry;
    return `<script${type ? ` type="${escapeHtml(type)}"` : ''} src="${escapeHtml(src)}" defer></script>`;
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="/favicon.svg">
<link rel="alternate" type="application/rss+xml" title="AI 资讯日报" href="${escapeHtml(siteUrl)}/feed.xml">
</head>
<body>
<header class="masthead">
  <a class="wordmark" href="/"><span>AI 折腾日报</span><span class="domain">tool-hub.xyz</span></a>
  <p class="masthead-note">每天 06:30 与 18:30 更新<a href="/about">关于本站</a><a href="/search">搜索历史条目</a></p>
</header>
${menu}
<main>
  <div class="admin-bar" data-admin-bar></div>
${body}
</main>
<footer class="site-footer">
  <p>面向普通用户、自由职业者与低配玩家的 AI 折腾日报：每天自动采集、去重、按内容质量排序，标题译成中文，原文链接保留。</p>
  <p><a href="/discuss">去讨论区</a><a href="/feed.xml">订阅 RSS</a><a href="/llms.txt">给 LLM 的纯文本</a><a href="${escapeHtml(repoUrl)}">看源码</a></p>
</footer>
${tags}
</body>
</html>
`;
}

const DEPTH_MAX = 14;
const DEPTH_GATE = 6;
const PRACTICAL_MAX = 6;
const PRACTICAL_GATE = 3;

function tagChips(item, { limit = 3, labels = {} } = {}) {
  return (item.tags ?? [])
    .slice(0, limit)
    .map((tag) => `<a class="chip tag" href="/t/${escapeHtml(tag)}">${escapeHtml(labels[tag] ?? tag)}</a>`)
    .join('');
}

// 量条把深度 / 实用画成刻度，竖线就是质量闸门线：越过竖线才算过关。
function metersFor(item) {
  const depth = Math.min(Number(item.quality ?? 0), DEPTH_MAX);
  const practical = Math.min(Number(item.practical ?? 0), PRACTICAL_MAX);
  const parts = [];
  if (depth >= DEPTH_GATE) {
    parts.push(`<span class="meter depth" title="内容质量 ${depth} / ${DEPTH_MAX}，闸门 ${DEPTH_GATE}"><b>${depth}</b><span class="track" style="--fill:${depth};--max:${DEPTH_MAX};--gate-at:${DEPTH_GATE}"><i></i></span></span>`);
  }
  if (practical >= PRACTICAL_GATE) {
    parts.push(`<span class="meter practical" title="实用度 ${practical} / ${PRACTICAL_MAX}"><b>${practical}</b><span class="track" style="--fill:${practical};--max:${PRACTICAL_MAX};--gate-at:${PRACTICAL_GATE}"><i></i></span></span>`);
  }
  return parts.length ? `<span class="meters">${parts.join('')}</span>` : '';
}

// 子类是栏目内部的细分入口，点击进到 /s/<栏目>/<子类>。
function subChip(item) {
  if (!item.subcategory || !item.subcategoryLabel) return '';
  return `<a class="chip sub" href="/s/${escapeHtml(item.category)}/${escapeHtml(item.subcategory)}">${escapeHtml(item.subcategoryLabel)}</a>`;
}

function storyTagsFor(item) {
  const chips = `${subChip(item)}${tagChips(item, { limit: 3, labels: item.tagLabels })}`;
  return chips ? `<p class="story-tags">${chips}</p>` : '';
}

// 宽表格在小屏上横向滚动，避免把正文挤成一列。
function decorateTables(html) {
  return String(html ?? '')
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

// 年月筛选与排序在浏览器里完成：控件状态写进 URL，链接可直接分享，静态站不必为每种组合各生成一页。
export function listControls({ months = [], month = '', year = '', sort = 'quality' } = {}) {
  const years = [...new Set(months.map((entry) => entry.year))];
  const monthField = months.length
    ? `      <label class="filter-field"><span>月份</span>
        <select name="month" data-filter-month>
          <option value="">全部月份</option>
${years.map((yearValue) => `          <optgroup label="${escapeHtml(yearValue)} 年">
${months.filter((entry) => entry.year === yearValue).map((entry) => `            <option value="${escapeHtml(entry.key)}"${entry.key === month ? ' selected' : ''}>${escapeHtml(`${Number(entry.month)} 月`)}（${entry.count}）</option>`).join('\n')}
          </optgroup>`).join('\n')}
        </select>
      </label>`
    : '';
  const yearField = years.length > 1
    ? `      <label class="filter-field"><span>年份</span>
        <select name="year" data-filter-year>
          <option value="">全部年份</option>
${years.map((yearValue) => `          <option value="${escapeHtml(yearValue)}"${yearValue === year ? ' selected' : ''}>${escapeHtml(yearValue)} 年</option>`).join('\n')}
        </select>
      </label>`
    : '';
  const mode = sortMode(sort);
  const sortField = `      <label class="filter-field"><span>排序</span>
        <select name="sort" data-sort-mode>
${Object.entries(sortModes).map(([key, meta]) => `          <option value="${key}"${key === mode ? ' selected' : ''}>${escapeHtml(meta.label)}</option>`).join('\n')}
        </select>
      </label>`;
  return `  <form class="filters" method="get">
${[yearField, monthField, sortField].filter(Boolean).join('\n')}
    <p class="filter-note"><span data-filter-count>0</span> 条 · <span data-sort-hint>${escapeHtml(sortModes[mode].hint)}</span></p>
  </form>`;
}

export function storyRow(item, { rank, showDay = false }) {
  const title = displayTitle(item);
  const original = item.zhTitle && item.zhTitle !== item.title ? item.title : '';
  const summary = displaySummary(item);
  const published = item.published ? new Date(item.published) : null;
  const metrics = metricsLabel(item);
  const rankCell = rank ? `<span class="rank">${rank}</span>` : '';
  const dayChip = showDay ? `<span class="chip day">${escapeHtml(item.day ?? '')}</span>` : '';
  const image = itemImage(item);
  const thumb = image ? `<a class="story-thumb-link" href="/item/${escapeHtml(item.slug)}" tabindex="-1" aria-hidden="true"><img class="story-thumb" src="${escapeHtml(image)}" alt="" loading="lazy"></a>` : '';
  return `    <li class="story${item.lead ? ' is-lead' : ''}" data-slug="${escapeHtml(item.slug)}" data-month="${escapeHtml(monthKey(item))}" data-rank="${escapeHtml(String(Number(item.rank ?? 0)))}" data-quality="${escapeHtml(String(Number(item.quality ?? 0)))}" data-score="${escapeHtml(String(Number(item.score ?? 0)))}" data-published="${escapeHtml(item.published ?? item.day ?? '')}">
${rankCell}${thumb}      <div class="story-body">
        <h2 class="story-title"><a href="/item/${escapeHtml(item.slug)}">${escapeHtml(title)}</a></h2>
        ${storyTagsFor(item)}
        ${original ? `<p class="story-original">${escapeHtml(original)}</p>` : ''}
        ${summary ? `<p class="story-summary">${escapeHtml(summary)}</p>` : ''}
        <p class="subtext">
          <button class="vote" type="button" data-vote="${escapeHtml(item.slug)}" title="顶一下">顶</button>
          <span class="score" data-score>0</span>
          <span class="source">${escapeHtml(item.sourceName)}</span>${dayChip}
          ${published ? `<time datetime="${escapeHtml(item.published)}">${escapeHtml(timeAgo(published, new Date()))}</time>` : '<time>时间未知</time>'}
          <a class="discuss-link" href="/item/${escapeHtml(item.slug)}#comments"><span data-count>评论</span></a>
          <a class="original-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">原文</a>
          ${metrics ? `<span class="metrics">${escapeHtml(metrics)}</span>` : ''}
          ${metersFor(item)}
        </p>
      </div>
    </li>`;
}

export function storyList(items, { showDay = false, lead = false, tagLabels = {} } = {}) {
  const rows = items.map((item, index) => storyRow(
    { ...item, lead: lead && index === 0, tagLabels },
    { rank: index + 1, showDay },
  ));
  return `  <ol class="stories">
${rows.join('\n')}
  </ol>`;
}

function groupDigits(value) {
  return String(Number(value) || 0).replace(/\B(?=(\d{3})+$)/g, ',');
}

// 日报每天跑两班，早班 / 晚班按生成时的本地钟点判断。
function localClock(generatedAt, timezone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(generatedAt));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  if (!Number.isFinite(hour)) return { shift: '本期', clock: '' };
  return { shift: hour < 12 ? '早班' : '晚班', clock: `${String(hour).padStart(2, '0')}:${minute}` };
}

function gateHero(digest) {
  const counts = digest.counts ?? {};
  const failed = (digest.sources ?? []).filter((source) => !source.ok);
  const clock = localClock(digest.generatedAt, digest.timezone);
  const dropped = [];
  if (Number(counts.duplicates ?? 0)) dropped.push(`${groupDigits(counts.duplicates)} 条重复`);
  if (Number(counts.lowQuality ?? 0)) dropped.push(`${groupDigits(counts.lowQuality)} 条没过质量闸门`);
  const note = [
    `${counts.okSources ?? 0} 个信息源共抓到 ${groupDigits(counts.fetched)} 条，去掉${dropped.length ? ` ${dropped.join('、')}` : '掉重复的'}，留下 ${groupDigits(counts.published)} 条。`,
    `本期为${clock.shift}，${clock.clock} 生成。`,
    failed.length ? `<span class="failed">${failed.length} 个源本次抓取失败</span>，缺的内容沿用上一版。` : '',
  ].filter(Boolean).join(' ');
  return `  <section class="gate">
    <h1 class="gate-date"><time datetime="${escapeHtml(digest.day)}">${escapeHtml(zhLabel(digest))}</time><span class="shift">${escapeHtml(clock.shift)}</span></h1>
    <p class="gate-flow">
      <span class="gate-step"><b data-count-to="${escapeHtml(String(counts.fetched ?? 0))}">${groupDigits(counts.fetched)}</b><span>抓下来</span></span>
      <span class="gate-arrow" aria-hidden="true">&rarr;</span>
      <span class="gate-step is-out"><b data-count-to="${escapeHtml(String(counts.published ?? 0))}">${groupDigits(counts.published)}</b><span>今天入选</span></span>
    </p>
    <p class="gate-note">${note}</p>
    <p class="gate-why">排序看内容质量，不看热度：<strong>有实测数据、有对比或原理解释、能照着做</strong>的排前面。标题已译成中文，事实请回<strong>原文</strong>核对。</p>
  </section>`;
}

function digestBody(digest, { days, limit = 0, tagLabels = {} }) {
  const items = (digest.categories ?? []).flatMap((group) => group.items.map((entry) => ({ ...entry, day: digest.day })));
  items.sort(rankCompare);
  const shown = limit > 0 ? items.slice(0, limit) : items;
  const more = shown.length < items.length
    ? `  <p class="lede-more">首页只留质量最高的 ${shown.length} 条，<a href="/day/${escapeHtml(digest.day)}">查看全部 ${items.length} 条</a></p>\n`
    : '';
  return `${gateHero(digest)}
${storyList(shown, { showDay: false, lead: true, tagLabels })}
${more}  <section class="daynav">
    <h2>按日期</h2>
    <nav class="day-chips">${days.map((day) => `<a href="/day/${escapeHtml(day)}" class="${day === digest.day ? 'active' : ''}">${escapeHtml(day)}</a>`).join('')}</nav>
    <p class="daynav-note"><a href="/markdown/${escapeHtml(digest.day)}.md">下载当日 Markdown</a>（${escapeHtml(digest.day)}.md，含标题、摘要与正文摘录）</p>
  </section>`;
}

export function renderDigestPage(digest, { sections = [], days = [], siteUrl = '', repoUrl, sectionId = 'latest', limit = 0, tagLabels = {} } = {}) {
  return page({
    title: `${zhLabel(digest)} AI 日报 · tool-hub.xyz`,
    description: `${zhLabel(digest)} AI 前沿资讯，共 ${digest.counts?.published ?? 0} 条，已翻译成中文并附原文链接。`,
    canonical: digest.day === days[0] ? `${siteUrl}/` : `${siteUrl}/day/${digest.day}`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, sectionId),
    body: digestBody(digest, { days, limit, tagLabels }),
    scripts: ['/forum.js', '/funnel.js'],
  });
}

export function renderSectionPage({ section, items, days, siteUrl, repoUrl, sections, lookbackDays, tagLabels = {}, months = [], month = '', year = '', sort = 'quality' }) {
  const subnav = section.subsections ?? [];
  const body = `  <section class="lede">
    <h1>${escapeHtml(section.label)}</h1>
    <p class="lede-meta">最近 ${lookbackDays} 天，共 ${items.length} 条</p>
    ${subnav.length ? `<nav class="subnav">${subnav.map((sub) => `<a href="/s/${escapeHtml(section.id)}/${escapeHtml(sub.id)}">${escapeHtml(sub.label)}<span>${sub.count}</span></a>`).join('')}</nav>` : ''}
  </section>
${listControls({ months, month, year, sort })}
${items.length ? storyList(items, { showDay: true, lead: true, tagLabels }) : '  <p class="empty">这一栏最近没有新内容，换个栏目看看。</p>'}
  <section class="daynav">
    <h2>按日期</h2>
    <nav class="day-chips">${days.map((day) => `<a href="/day/${escapeHtml(day)}">${escapeHtml(day)}</a>`).join('')}</nav>
  </section>`;
  return page({
    title: `${section.label} · tool-hub.xyz`,
    description: `${section.label}：面向普通用户与自由职业者的 AI 资讯。`,
    canonical: `${siteUrl}/s/${section.id}`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, section.id),
    body,
    scripts: ['/forum.js', { src: '/list.js', type: 'module' }],
  });
}

export function renderSubsectionPage({ section, sub, items, days, siteUrl, repoUrl, sections, lookbackDays, tagLabels = {}, months = [], month = '', year = '', sort = 'quality' }) {
  const subnav = section.subsections ?? [];
  const heading = `${section.label} · ${sub.label}`;
  const body = `  <section class="lede">
    <h1><a href="/s/${escapeHtml(section.id)}">${escapeHtml(section.label)}</a> · ${escapeHtml(sub.label)}</h1>
    <p class="lede-meta">最近 ${lookbackDays} 天，共 ${items.length} 条</p>
    ${subnav.length ? `<nav class="subnav">${subnav.map((entry) => `<a${entry.id === sub.id ? ' class="active"' : ''} href="/s/${escapeHtml(section.id)}/${escapeHtml(entry.id)}">${escapeHtml(entry.label)}<span>${entry.count}</span></a>`).join('')}</nav>` : ''}
  </section>
${listControls({ months, month, year, sort })}
${items.length ? storyList(items, { showDay: true, lead: true, tagLabels }) : '  <p class="empty">这个子类最近没有新内容。</p>'}`;
  return page({
    title: `${heading} · tool-hub.xyz`,
    description: `${heading}：${section.label}里的细分内容。`,
    canonical: `${siteUrl}/s/${section.id}/${sub.id}`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, section.id),
    body,
    scripts: ['/forum.js', { src: '/list.js', type: 'module' }],
  });
}

export function renderItemPage({ item, siteUrl, repoUrl, sections, related = [], tagLabels = {} }) {
  const title = displayTitle(item);
  const original = item.zhTitle && item.zhTitle !== item.title ? item.title : '';
  const summary = displaySummary(item);
  const published = item.published ? new Date(item.published) : null;
  const metrics = metricsLabel(item);
  const relatedRows = related.map((entry) => `      <li><a href="/item/${escapeHtml(entry.slug)}">${escapeHtml(displayTitle(entry))}</a></li>`).join('\n');
  const note = item.content
    ? item.content.truncated
      ? `原文约 ${item.content.chars} 字，这里保留前 ${item.content.shown} 字，完整表格与数据请`
      : `原文约 ${item.content.chars} 字，`
    : '';
  const article = item.content?.html
    ? `      <section class="item-body">
        <h2>${item.lang === 'zh' ? '原文正文' : '原文正文（未翻译）'}</h2>
        <div class="article">${decorateTables(repairArticle(item.content.html))}</div>
        <p class="article-note">${note}<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">读原文</a></p>
      </section>`
    : `${summary ? `      <div class="item-summary"><p>${escapeHtml(summary)}</p></div>` : ''}`;
  const lead = item.zhSummary && item.content
    ? `      <section class="item-lead">
        <h2>中文导读</h2>
        <p>${escapeHtml(item.zhSummary)}</p>
        <p class="lead-note">导读由机器生成，结论与数字请以原文为准。</p>
      </section>`
    : '';
  const body = `  <article class="item">
    <h1>${escapeHtml(title)}</h1>
    ${original ? `<p class="item-original">${escapeHtml(original)}</p>` : ''}
    <p class="subtext">
      <button class="vote" type="button" data-vote="${escapeHtml(item.slug)}" title="顶一下">顶</button>
      <span class="score" data-score>0</span>
      <span class="source">${escapeHtml(item.sourceName)}</span>
      <span class="chip day">${escapeHtml(item.day ?? '')}</span>
      ${published ? `<time datetime="${escapeHtml(item.published)}">${escapeHtml(timeAgo(published, new Date()))}</time>` : ''}
      ${metrics ? `<span class="metrics">${escapeHtml(metrics)}</span>` : ''}
      <a class="original-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读原文</a>
      ${metersFor(item)}
    </p>
    <div class="admin-bar inline" data-admin-mount data-slug="${escapeHtml(item.slug)}"></div>
    ${domainOf(item.url) ? `<p class="item-domain">原文链接：<code>${escapeHtml(item.url)}</code></p>` : ''}
${lead}
${article}
    ${item.subcategoryLabel ? `    <p class="item-sub">子类：${subChip(item)}</p>` : ''}
    ${tagChips(item, { limit: 6, labels: tagLabels }) ? `<p class="item-tags">标签：${tagChips(item, { limit: 6, labels: tagLabels })}</p>` : ''}
    ${original && !item.content && item.summary ? `<details class="item-raw"><summary>原始摘要（${escapeHtml(item.lang === 'zh' ? '中文' : '英文')}）</summary><p>${escapeHtml(item.summary)}</p></details>` : ''}
  </article>
  <section class="comments" id="comments" data-item="${escapeHtml(item.slug)}">
    <h2>讨论<span class="count" data-count>0</span></h2>
    <form class="comment-form" data-comment-form>
      <input type="text" name="website" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label>昵称（可留空，默认匿名）<input type="text" name="author" maxlength="24" placeholder="例如：夜行猫"></label>
      <label>留言<textarea name="body" rows="4" required minlength="3" maxlength="2000" placeholder="踩过什么坑、有没有免费替代、配置怎么省……"></textarea></label>
      <button type="submit">发布留言</button>
      <p class="form-note" data-form-note>无需登录；同一 IP 每小时最多 8 条，发言请不要包含攻击性内容。</p>
    </form>
    <div class="comment-list" data-comment-list><p class="loading">正在加载讨论……</p></div>
  </section>
${relatedRows ? `  <section class="related">
    <h2>同栏目其他内容</h2>
    <ul>
${relatedRows}
    </ul>
  </section>` : ''}`;
  return page({
    title: `${title} · tool-hub.xyz`,
    description: summary || title,
    canonical: `${siteUrl}/item/${item.slug}`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, null),
    body,
    scripts: ['/forum.js'],
  });
}

export function renderDiscussPage({ siteUrl, repoUrl, sections, days }) {
  const body = `  <section class="lede">
    <h1>讨论区</h1>
    <p class="lede-meta">最新留言来自各条 AI 资讯的评论区 · 共 ${days.length} 天归档</p>
    <p class="lede-hint">无需登录，匿名也能发言；留言会公开显示在对应条目下。</p>
  </section>
  <section class="comments recent" data-recent>
    <div class="comment-list" data-comment-list><p class="loading">正在加载最新讨论……</p></div>
  </section>
  <section class="daynav">
    <h2>按日期</h2>
    <nav class="day-chips">${days.map((day) => `<a href="/day/${escapeHtml(day)}">${escapeHtml(day)}</a>`).join('')}</nav>
  </section>`;
  return page({
    title: '讨论区 · tool-hub.xyz',
    description: 'AI 资讯条目的最新评论与讨论。',
    canonical: `${siteUrl}/discuss`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, 'discuss'),
    body,
    scripts: ['/forum.js'],
  });
}

export function renderSearchPage({ siteUrl, repoUrl, sections, tagLabels = {} }) {
  const body = `  <section class="lede">
    <h1>搜索历史条目</h1>
    <p class="lede-hint">在浏览器本地检索已收录的条目（标题、摘要、来源）。</p>
  </section>
  <section class="search" data-search data-tag-labels="${escapeHtml(JSON.stringify(tagLabels))}">
    <form data-search-form><input type="search" name="q" placeholder="例如：ollama 免费 本地" required><button type="submit">搜索</button></form>
    <ol class="stories" data-search-results></ol>
  </section>`;
  return page({
    title: '搜索 · tool-hub.xyz',
    description: '搜索已收录的 AI 资讯条目。',
    canonical: `${siteUrl}/search`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, null),
    body,
    scripts: ['/forum.js'],
  });
}

export function renderAboutPage({ siteUrl, repoUrl, sections, sources = [] }) {
  const sourceRows = sources.map((source) => `<li>${escapeHtml(source.name)}${source.ok ? '' : '（最近一次抓取失败）'}</li>`).join('\n');
  const body = `  <section class="lede">
    <h1>关于本站</h1>
    <p class="lede-meta">面向普通用户、自由职业者与低配玩家的 AI 折腾日报</p>
  </section>
  <section class="about">
    <p>每天 06:30 与 18:30（北京时间）自动抓取 ${sources.length} 个信息源，去重、按实用度排序，并用机器翻译把标题和摘要译成中文。<strong>每条都保留原文链接</strong>，译文仅供参考，涉及事实请回到原文核对。</p>
    <p>评论区无需登录：留个昵称或直接匿名发言，聊踩坑、免费替代、低配跑法、接单思路。</p>
    <h2>栏目</h2>
    <ul>${(sections ?? []).map((section) => `<li>${escapeHtml(section.label)} — ${section.href ?? `/s/${section.id}`}</li>`).join('\n')}</ul>
    <h2>信息源</h2>
    <ul class="sources">
${sourceRows}
    </ul>
  </section>`;
  return page({
    title: '关于 · tool-hub.xyz',
    description: '本站的采集方式、栏目与信息源。',
    canonical: `${siteUrl}/about`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, null),
    body,
  });
}

export function renderArchive({ digests, days, siteUrl, repoUrl, sections, yearChips = [], monthChips = [], current = null, tagLabels = {}, months = [], month = '', year = '', sort = 'quality' }) {
  const rows = digests.map((digest) => `      <li><a href="/day/${escapeHtml(digest.day)}">${escapeHtml(digest.day)}</a><span>${digest.counts?.published ?? 0} 条</span><a class="md-link" href="/markdown/${escapeHtml(digest.day)}.md">Markdown</a></li>`);
  const chipLinks = (list) => list.map((chip) => `<a${chip.active ? ' class="active"' : ''} href="${escapeHtml(chip.href)}">${escapeHtml(chip.label)}<span>${chip.count}</span></a>`).join('');
  const total = monthChips.reduce((sum, chip) => sum + chip.count, 0);
  const listing = current?.items?.length
    ? `  <section class="category">
    <h2>${escapeHtml(current.label)}：<span class="sort-note">按质量评分从高到低</span></h2>
${storyList(current.items, { showDay: true, tagLabels })}
  </section>`
    : '  <p class="empty">这段时间还没有条目。</p>';
  const body = `  <section class="lede">
    <h1>归档</h1>
    <p class="lede-meta">共 ${days.length} 天、${total} 条条目；选定年月后按质量评分排序</p>
    ${yearChips.length ? `<nav class="subnav">${chipLinks(yearChips)}</nav>` : ''}
    ${monthChips.length ? `<nav class="subnav">${chipLinks(monthChips)}</nav>` : ''}
  </section>
${listControls({ months, month, year, sort })}
${listing}
  <section class="daynav">
    <h2>按日期</h2>
    <nav class="day-chips">${days.map((day) => `<a href="/day/${escapeHtml(day)}">${escapeHtml(day)}</a>`).join('')}</nav>
    <p class="daynav-note"><a href="/llms.txt">全站索引 llms.txt</a> · 每天一份 Markdown 在 <code>/markdown/日期.md</code></p>
  </section>
  <section class="category">
    <ul class="archive">
${rows.join('\n')}
    </ul>
  </section>`;
  return page({
    title: '归档 · tool-hub.xyz',
    description: 'AI 资讯日报归档',
    canonical: `${siteUrl}/archive`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, 'archive'),
    body,
    scripts: [{ src: '/list.js', type: 'module' }],
  });
}

export function renderRss(digest, { siteUrl = '' }) {
  const items = (digest.categories ?? []).flatMap((group) => group.items).slice(0, 40);
  const entries = items.map((item) => {
    const slug = item.slug ?? itemSlug(item);
    const description = [displaySummary(item), `原文链接：${item.url}`].filter(Boolean).join('\n');
    return `    <item>
      <title>${escapeXml(displayTitle(item))}</title>
      <link>${escapeXml(`${siteUrl}/item/${slug}`)}</link>
      <guid isPermaLink="true">${escapeXml(item.id)}</guid>
      <pubDate>${escapeXml(rssDate(item.published))}</pubDate>
      <description>${escapeXml(description)}</description>
      <source url="${escapeXml(item.url)}">${escapeXml(item.sourceName)}</source>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI 折腾日报 · tool-hub.xyz</title>
    <link>${escapeHtml(siteUrl)}/</link>
    <description>面向普通用户与自由职业者的 AI 资讯，中文译文 + 原文链接</description>
    <language>zh-CN</language>
    <lastBuildDate>${escapeXml(rssDate(digest.generatedAt))}</lastBuildDate>
${entries.join('\n')}
  </channel>
</rss>
`;
}

function rssDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
}

export function itemSlugFallback(item) {
  return item?.slug ?? itemSlug(item);
}

function tagNav(tags, activeId) {
  return `  <nav class="tag-nav">${(tags ?? []).map((tag) => `<a class="${tag.id === activeId ? 'active' : ''}" href="/t/${escapeHtml(tag.id)}">${escapeHtml(tag.label)}</a>`).join('')}</nav>`;
}

export function renderTagPage({ tag, items, tags = [], lookbackDays = 7, siteUrl, repoUrl, sections, months = [], month = '', year = '', sort = 'quality' }) {
  const tagLabels = Object.fromEntries(tags.map((entry) => [entry.id, entry.label]));
  const body = `  <section class="lede">
    <h1>标签：${escapeHtml(tag.label)}</h1>
    <p class="lede-meta">最近 ${lookbackDays} 天，共 ${items.length} 条</p>
  </section>
${tagNav(tags, tag.id)}
${listControls({ months, month, year, sort })}
${items.length ? storyList(items, { showDay: true, lead: true, tagLabels }) : '  <p class="empty">这个标签最近没有条目。</p>'}`;
  return page({
    title: `${tag.label} · 标签 · tool-hub.xyz`,
    description: `${tag.label}：可实操、可复现的 AI 条目合集。`,
    canonical: `${siteUrl}/t/${tag.id}`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, 'tags'),
    body,
    scripts: ['/forum.js', { src: '/list.js', type: 'module' }],
  });
}

export function renderTagsIndex({ tags = [], counts = {}, siteUrl, repoUrl, sections }) {
  const rows = tags.map((tag) => `      <li><a href="/t/${escapeHtml(tag.id)}">${escapeHtml(tag.label)}</a><span>${counts[tag.id] ?? 0} 条</span></li>`);
  const body = `  <section class="lede">
    <h1>按关键词标签浏览</h1>
    <p class="lede-hint">条目按关键词自动归类：本地部署、低配硬件、实测跑分、教程步骤、Agent 工具、生成内容、免费开源、接单变现、隐私数据、硬件折腾。</p>
  </section>
  <section class="category">
    <ul class="archive">
${rows.join('\n')}
    </ul>
  </section>`;
  return page({
    title: '标签 · tool-hub.xyz',
    description: '按关键词标签浏览 AI 实操条目。',
    canonical: `${siteUrl}/tags`,
    siteUrl,
    repoUrl,
    menu: menuFor(sections, 'tags'),
    body,
  });
}

export function renderLlms(digest, { siteUrl = '' }) {
  const items = (digest.categories ?? []).flatMap((group) => group.items);
  const lines = items.map((item) => {
    const slug = item.slug ?? itemSlugFallback(item);
    const metrics = metricsLabel(item);
    const suffix = metrics ? `（${metrics}）` : '';
    return `- [${displayTitle(item)}](${siteUrl || 'https://tool-hub.xyz'}/item/${slug}) — ${item.sourceName}${item.published ? `，${item.published.slice(0, 10)}` : ''}${suffix}\n  ${displaySummary(item)}\n  原文：${item.url}`;
  });
  return `# AI 折腾日报 · tool-hub.xyz

> ${zhLabel(digest)} 自动采集的 AI 资讯，共 ${items.length} 条，已翻译成中文并保留原文链接。生成时间：${digest.generatedAt}

## 当日条目

${lines.join('\n')}

## 其他

- 讨论区：${siteUrl || 'https://tool-hub.xyz'}/discuss
- 归档索引：${siteUrl || 'https://tool-hub.xyz'}/archive
- RSS：${siteUrl || 'https://tool-hub.xyz'}/feed.xml
- 条目全量 JSON：${siteUrl || 'https://tool-hub.xyz'}/data/items.json
- 源码：https://github.com/zzsoszz/tool-hub-xyz
`;
}
