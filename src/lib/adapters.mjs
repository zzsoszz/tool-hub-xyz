import { cleanText, parseDate, summarize } from './normalize.mjs';

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
      return {
        ...base(source),
        title: cleanText(hit.title, 220),
        url,
        id: String(hit.objectID ?? ''),
        published: iso(hit.created_at ?? hit.created_at_i),
        summary: summarize(hit.story_text ?? hit.comment_text ?? `Hacker News 讨论：${hit.title ?? ''}`),
        categories: Array.isArray(hit._tags) ? hit._tags.map((tag) => cleanText(tag, 40)) : [],
        metrics: { points: hit.points ?? 0, comments: hit.num_comments ?? 0 },
      };
    });
  },
  'hf-daily-papers': (payload, source) => {
    const entries = Array.isArray(payload) ? payload : [];
    return entries.map((entry) => {
      const paper = entry.paper ?? entry;
      return {
        ...base(source),
        title: cleanText(paper.title, 220),
        url: `https://huggingface.co/papers/${paper.id}`,
        id: String(paper.id ?? ''),
        published: iso(paper.publishedAt ?? entry.publishedAt ?? entry.date),
        summary: summarize(paper.abstract),
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
        published: iso(repo.created_at ?? repo.pushed_at),
        summary: summarize(`${repo.description ?? '新发布的开源仓库'}${stats.length ? ` (${stats.join(' · ')})` : ''}`),
        categories: Array.isArray(repo.topics) ? repo.topics.slice(0, 5).map((topic) => cleanText(topic, 40)) : [],
        author: repo.owner?.login ?? '',
        metrics: { stars: repo.stargazers_count ?? 0 },
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
