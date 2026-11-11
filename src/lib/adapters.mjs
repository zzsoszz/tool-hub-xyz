import { cleanText, parseDate, summarize } from './normalize.mjs';
import { markdownToHtml, sanitizeArticle, textToArticle } from './content.mjs';

function base(source) {
  return {
    sourceId: source.id,
    sourceName: source.name,
    lang: source.lang ?? 'en',
    tier: source.tier ?? 2,
    trustCategory: Boolean(source.trustCategory),
    declaredCategory: source.category ?? null,
    categories: [],
    author: '',
    id: '',
  };
}

const adapters = {
  'hn-algolia': (payload, source) => {
    const hits = Array.isArray(payload?.hits) ? payload.hits : [];
    return hits.map((hit) => {
      const url = hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const body = hit.story_text ?? hit.comment_text ?? '';
      const content = sanitizeArticle(body, { baseUrl: url });
      return {
        ...base(source),
        title: cleanText(hit.title, 220),
        url,
        id: String(hit.objectID ?? ''),
        published: iso(hit.created_at ?? hit.created_at_i),
        summary: summarize(content ? content.lead : body || `Hacker News 讨论：${hit.title ?? ''}`),
        content: content ?? undefined,
        categories: Array.isArray(hit._tags) ? hit._tags.map((tag) => cleanText(tag, 40)) : [],
        metrics: { points: hit.points ?? 0, comments: hit.num_comments ?? 0 },
      };
    });
  },
  'hf-daily-papers': (payload, source) => {
    const entries = Array.isArray(payload) ? payload : [];
    return entries.map((entry) => {
      const paper = entry.paper ?? entry;
      const content = textToArticle(paper.abstract, { baseUrl: `https://huggingface.co/papers/${paper.id}` });
      return {
        ...base(source),
        title: cleanText(paper.title, 220),
        url: `https://huggingface.co/papers/${paper.id}`,
        id: String(paper.id ?? ''),
        published: iso(paper.publishedAt ?? entry.publishedAt ?? entry.date),
        summary: summarize(content ? content.lead : paper.abstract),
        content: content ?? undefined,
        metrics: { upvotes: paper.upvotes ?? 0 },
      };
    });
  },
  'github-search': (payload, source) => {
    const repos = Array.isArray(payload?.items) ? payload.items : [];
    return repos.map((repo) => {
      const stats = [
        repo.stargazers_count ? `★ ${repo.stargazers_count}` : null,
        repo.language || null,
        Array.isArray(repo.topics) ? repo.topics.slice(0, 4).join(' / ') : null,
      ].filter(Boolean);
      return {
        ...base(source),
        title: cleanText(repo.full_name, 220),
        url: repo.html_url,
        id: String(repo.id ?? ''),
        published: iso(source.publishedField === 'pushed' ? (repo.pushed_at ?? repo.created_at) : (repo.created_at ?? repo.pushed_at)),
        summary: summarize(`${repo.description ?? '新发布的开源仓库'}${stats.length ? ` (${stats.join(' · ')})` : ''}`),
        categories: Array.isArray(repo.topics) ? repo.topics.slice(0, 5).map((topic) => cleanText(topic, 40)) : [],
        author: repo.owner?.login ?? '',
        metrics: { stars: repo.stargazers_count ?? 0 },
      };
    });
  },
  'github-releases': (payload, source) => {
    const releases = Array.isArray(payload) ? payload : [];
    return releases
      .filter((release) => !release?.draft && release?.html_url && String(release.body ?? '').trim())
      .map((release) => {
        const pathParts = new URL(release.html_url).pathname.split('/').filter(Boolean);
        const repoName = pathParts[1] ?? source.name;
        const tag = cleanText(release.tag_name ?? '', 60);
        const content = sanitizeArticle(markdownToHtml(release.body), { baseUrl: release.html_url, maxChars: 4000 });
        return {
          ...base(source),
          title: cleanText(`${repoName} ${tag} 发布`, 220),
          url: release.html_url,
          id: String(release.id ?? release.html_url),
          published: iso(release.published_at ?? release.created_at),
          summary: summarize(content ? content.lead : release.body),
          content: content ?? undefined,
          categories: Array.isArray(source.topics) ? source.topics.slice(0, 5).map((topic) => cleanText(topic, 40)) : [],
          author: release.author?.login ?? '',
        };
      });
  },
  nodebb: (payload, source) => {
    // 列表接口会把版主删除的帖子留在页上，标题换成 [[topic:topic-is-deleted]] 占位符。
    const topics = (Array.isArray(payload?.topics) ? payload.topics : []).filter(
      (topic) => topic && !topic.deleted && !/^\s*\[\[topic:/.test(String(topic.title ?? '')),
    );
    return topics.map((topic) => {
      const slug = String(topic.slug ?? topic.tid ?? '');
      const tags = Array.isArray(topic.tags) ? topic.tags.map((tag) => cleanText(tag?.value ?? tag, 40)) : [];
      const teaser = topic.teaser?.content ?? topic.teaser?.sourceContent ?? '';
      const summary = summarize([teaser, tags.length ? `标签：${tags.join(' / ')}` : ''].filter(Boolean).join('\n'));
      return {
        ...base(source),
        title: cleanText(topic.title, 220),
        url: `https://lcz.me/topic/${slug}`,
        id: String(topic.tid ?? slug),
        published: iso(topic.timestampISO ?? topic.timestamp),
        summary,
        categories: tags,
        author: topic.user?.displayname ?? topic.user?.username ?? '',
        metrics: {
          points: topic.votes ?? topic.upvotes ?? 0,
          comments: Math.max(0, (topic.postcount ?? 1) - 1),
          views: topic.viewcount ?? 0,
        },
        excellent: Boolean(topic.lczExcellent),
      };
    });
  },
};

function iso(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

export function parseJsonFeed(payload, source) {
  const adapter = adapters[source.adapter];
  if (!adapter) throw new Error(`源 ${source.id} 缺少 adapter: ${source.adapter}`);
  return adapter(payload, source).filter((item) => item.title && item.url);
}
