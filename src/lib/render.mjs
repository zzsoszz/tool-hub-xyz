import { timeAgo } from './normalize.mjs';

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

function zhLabel(digest) {
  const [year, month, day] = digest.day.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function displayTitle(item) {
  return item.zhTitle || item.title;
}

function displaySummary(item) {
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

function page({ title, description, canonical, siteUrl, repoUrl = 'https://github.com/zzsoszz/tool-hub-xyz', body }) {
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
<header class="site-header">
  <a class="brand" href="/">tool-hub<span>.xyz</span></a>
  <p class="tagline">AI 前沿资讯日报 · 每日自动采集</p>
  <nav class="site-nav">
    <a href="/">今日</a>
    <a href="/archive">归档</a>
    <a href="/feed.xml">RSS</a>
    <a href="/llms.txt">纯文本</a>
    <a class="ghost" href="${escapeHtml(repoUrl)}">源码</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>本站由定时任务自动采集、去重并排序，人工不逐条审校。点击标题直达原始来源。</p>
  <p><a href="/feed.xml">RSS</a> · <a href="/llms.txt">llms.txt</a> · <a href="${escapeHtml(repoUrl)}">GitHub</a></p>
</footer>
</body>
</html>
`;
}

function dayNav(days, currentDay) {
  const chips = days.slice(0, 10).map((day) => {
    const active = day === currentDay ? ' class="active"' : '';
    return `<a${active} href="/day/${day}">${day}</a>`;
  });
  return `<nav class="day-nav">${chips.join('')}</nav>`;
}

function card(item, { timezone }) {
  const title = displayTitle(item);
  const original = item.zhTitle && item.zhTitle !== item.title ? item.title : '';
  const summary = displaySummary(item);
  const published = item.published ? new Date(item.published) : null;
  const hot = Number(item.score) >= 16 ? '<span class="hot">HOT</span>' : '';
  const tags = (item.categories ?? []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const metrics = metricsLabel(item);
  return `      <article class="card">
        <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${hot}</h3>
        ${original ? `<p class="original">${escapeHtml(original)}</p>` : ''}
        ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ''}
        <p class="meta">
          <span class="badge">${escapeHtml(item.sourceName)}</span>
          ${published ? `<time datetime="${escapeHtml(item.published)}">${escapeHtml(timeAgo(published, new Date(), timezone))}</time>` : '<time>时间未知</time>'}
          ${metrics ? `<span class="metrics">${escapeHtml(metrics)}</span>` : ''}
          ${tags}
        </p>
      </article>`;
}

function digestBody(digest, { days, siteUrl }) {
  const counts = digest.counts ?? {};
  const sections = (digest.categories ?? [])
    .filter((group) => group.items.length)
    .map((group) => `  <section class="category">
    <h2>${escapeHtml(group.label)}<span class="count">${group.items.length}</span></h2>
    <div class="cards">
${group.items.map((item) => card(item, { timezone: digest.timezone })).join('\n')}
    </div>
  </section>`)
    .join('\n');
  const failed = (digest.sources ?? []).filter((source) => !source.ok);
  const sourceList = (digest.sources ?? []).filter((source) => source.ok).map((source) => source.name).join('、');
  return `  <section class="lede">
    <h1>${escapeHtml(zhLabel(digest))} · AI 日报</h1>
    <p class="lede-meta">共 ${counts.published ?? 0} 条 · 来自 ${counts.okSources ?? 0} 个信息源 · 生成于 ${escapeHtml(digest.generatedAt)}${failed.length ? ` · ${failed.length} 个源本次抓取失败` : ''}</p>
    ${dayNav(days, digest.day)}
  </section>
${sections}
  <section class="sources">
    <h2>本次数据源</h2>
    <p>${escapeHtml(sourceList || '无')}</p>
    ${failed.length ? `<p class="warn">失败：${failed.map((source) => `${escapeHtml(source.name)}（${escapeHtml(source.error ?? '')}）`).join('；')}</p>` : ''}
  </section>`;
}

export function renderDigestPage(digest, { days = [], siteUrl = '', repoUrl } = {}) {
  const title = `${zhLabel(digest)} AI 日报 · tool-hub.xyz`;
  return page({
    title,
    description: `${zhLabel(digest)} AI 前沿资讯，共 ${digest.counts?.published ?? 0} 条，自动采集去重。`,
    canonical: digest.day === days[0] ? `${siteUrl}/` : `${siteUrl}/day/${digest.day}`,
    siteUrl,
    repoUrl,
    body: digestBody(digest, { days, siteUrl }),
  });
}

export function renderArchive({ digests, days, siteUrl = '', repoUrl } = {}) {
  const rows = digests.map((digest) => `      <li><a href="/day/${digest.day}">${digest.day}</a><span>${digest.counts?.published ?? 0} 条</span></li>`);
  const body = `  <section class="lede">
    <h1>归档</h1>
    <p class="lede-meta">共 ${days.length} 天</p>
  </section>
  <section class="category">
    <ul class="archive">
${rows.join('\n')}
    </ul>
  </section>`;
  return page({ title: '归档 · tool-hub.xyz', description: 'AI 资讯日报归档', canonical: `${siteUrl}/archive`, siteUrl, repoUrl, body });
}

export function renderRss(digest, { siteUrl = '' }) {
  const items = (digest.categories ?? []).flatMap((group) => group.items).slice(0, 40);
  const entries = items.map((item) => `    <item>
      <title>${escapeXml(displayTitle(item))}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      ${item.published ? `<pubDate>${new Date(item.published).toUTCString()}</pubDate>` : ''}
      <description>${escapeXml(displaySummary(item))}</description>
      <source url="${escapeXml(item.url)}">${escapeXml(item.sourceName)}</source>
    </item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI 资讯日报 · tool-hub.xyz</title>
    <link>${escapeXml(siteUrl || 'https://tool-hub.xyz')}/</link>
    <description>每日自动采集的 AI 前沿资讯</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date(digest.generatedAt).toUTCString()}</lastBuildDate>
${entries.join('\n')}
  </channel>
</rss>
`;
}

export function renderLlms(digest, { siteUrl = '' }) {
  const items = (digest.categories ?? []).flatMap((group) => group.items);
  const lines = items.map((item) => {
    const suffix = item.zhTitle && item.zhTitle !== item.title ? ` | ${item.title}` : '';
    return `- [${displayTitle(item)}](${item.url}) — ${item.sourceName}${item.published ? `，${item.published.slice(0, 10)}` : ''}${suffix}\n  ${displaySummary(item)}`;
  });
  return `# AI 资讯日报 · tool-hub.xyz

> ${zhLabel(digest)} 自动采集的 AI 前沿资讯，共 ${items.length} 条。生成时间：${digest.generatedAt}

## 当日条目

${lines.join('\n')}

## 其他

- 归档索引：${siteUrl || 'https://tool-hub.xyz'}/archive
- RSS：${siteUrl || 'https://tool-hub.xyz'}/feed.xml
- 源码：https://github.com/zzsoszz/tool-hub-xyz
`;
}
