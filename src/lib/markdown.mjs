import { displaySummary, displayTitle } from './render.mjs';

function metricsLine(item) {
  const metrics = item.metrics ?? {};
  const parts = [];
  if (metrics.points) parts.push(`热度 ${metrics.points}`);
  if (metrics.stars) parts.push(`star ${metrics.stars}`);
  if (metrics.upvotes) parts.push(`赞 ${metrics.upvotes}`);
  if (metrics.comments) parts.push(`评论 ${metrics.comments}`);
  if (metrics.sharp) parts.push(`安装 ${metrics.sharp}`);
  if (metrics.rankPosition) parts.push(`榜单第 ${metrics.rankPosition}`);
  return parts.join(' · ');
}

function tagsLine(item) {
  const chips = [];
  if (item.subcategoryLabel) chips.push(`子类 ${item.subcategoryLabel}`);
  if ((item.tags ?? []).length) chips.push(`标签 ${item.tags.join(' / ')}`);
  return chips.join(' · ');
}

export function itemToMarkdown(item, { index = 0, siteUrl = '', bodyChars = 1200 } = {}) {
  const title = displayTitle(item);
  const original = item.zhTitle && item.zhTitle !== item.title ? item.title : '';
  const summary = displaySummary(item);
  const body = String(item.content?.text ?? '').replace(/\r\n/g, '\n').trim();
  const clipped = body.length > bodyChars ? `${body.slice(0, bodyChars)}\n\n（正文约 ${item.content?.chars ?? body.length} 字，此处截断）` : body;
  const meta = [
    item.day ? `收录 ${item.day}` : '',
    item.published ? `发布 ${item.published.slice(0, 10)}` : '',
    item.sourceName ? `来源 ${item.sourceName}` : '',
    metricsLine(item),
    item.lead ? '版主精选' : '',
  ].filter(Boolean);
  const lines = [
    `### ${index ? `${index}. ` : ''}${title}`,
    '',
    `- 原文：${item.url}`,
    siteUrl && item.slug ? `- 本站条目页：${siteUrl}/item/${item.slug}` : '',
    `- 质量：深度 ${item.quality ?? 0}${item.practical ? ` / 实用 ${item.practical}` : ''}${item.rank ? ` / 排名分 ${item.rank}` : ''}`,
    meta.length ? `- ${meta.join(' · ')}` : '',
    tagsLine(item) ? `- ${tagsLine(item)}` : '',
    original ? `- 原标题：${original}` : '',
    '',
    summary ? `> ${summary.replace(/\n+/g, ' ')}` : '',
    '',
    clipped ? clipped : '',
    '',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function digestToMarkdown(digest, { siteUrl = '', bodyChars = 1200 } = {}) {
  const counts = digest.counts ?? {};
  const groups = (digest.categories ?? []).filter((group) => (group.items ?? []).length);
  const head = [
    `# AI 折腾日报 ${digest.day}`,
    '',
    `- 生成时间：${digest.generatedAt ?? ''}（时区 ${digest.timezone ?? ''}）`,
    `- 漏斗：抓取 ${counts.fetched ?? 0} → 去重 ${counts.duplicates ?? 0} → 入选 ${counts.published ?? groups.reduce((sum, group) => sum + group.items.length, 0)}`,
    `- 来源：${counts.okSources ?? 0}/${counts.sources ?? 0} 个信息源可用`,
    '',
    '筛选口径：只保留有数据或有复现步骤的实践内容；按「深度 ≥ 6」的质量闸门淘汰低质条目。',
    '',
  ];
  const sections = groups.map((group) => [
    `## ${group.label}（${group.items.length} 条）`,
    '',
    group.items.map((item, index) => itemToMarkdown(item, { index: index + 1, siteUrl, bodyChars })).join('\n\n'),
  ].join('\n'));
  return `${[...head, ...sections].join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
