export function selectByCategoryQuota(candidates, { limit = 48, categoryOrder = [] } = {}) {
  const rankOf = (item) => item.rank ?? item.quality ?? item.score ?? 0;
  const groups = new Map();
  for (const item of candidates) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  for (const group of groups.values()) group.sort((a, b) => rankOf(b) - rankOf(a));
  const ordered = [...groups.values()].sort((a, b) => {
    const rankGap = rankOf(b[0]) - rankOf(a[0]);
    if (rankGap !== 0) return rankGap;
    return categoryOrder.indexOf(a[0]?.category) - categoryOrder.indexOf(b[0]?.category);
  });
  const quota = Math.max(1, Math.ceil(limit / Math.max(ordered.length, 1)));
  const selected = [];
  const leftovers = [];
  ordered.forEach((group) => {
    for (const [rank, item] of group.entries()) {
      if (rank < quota) selected.push(item);
      else leftovers.push(item);
    }
  });
  if (selected.length < limit) {
    leftovers.sort((a, b) => rankOf(b) - rankOf(a));
    selected.push(...leftovers.slice(0, limit - selected.length));
  }
  return selected.slice(0, limit);
}
