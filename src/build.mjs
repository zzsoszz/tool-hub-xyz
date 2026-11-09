import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderArchive, renderDigestPage, renderLlms, renderRss } from './lib/render.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function siteUrl() {
  return (process.env.SITE_URL ?? 'https://tool-hub.xyz').replace(/\/$/, '');
}

function repoUrl() {
  return process.env.REPO_URL ?? 'https://github.com/zzsoszz/tool-hub-xyz';
}

async function loadDigests(digestDir) {
  const names = await readdir(digestDir).catch(() => []);
  const digests = [];
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    try {
      digests.push(JSON.parse(await readFile(path.join(digestDir, name), 'utf8')));
    } catch (error) {
      console.warn(`[build] 跳过损坏的日报 ${name}: ${error.message}`);
    }
  }
  digests.sort((a, b) => (a.day < b.day ? 1 : -1));
  return digests;
}

async function write(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function main() {
  const dataDir = path.join(ROOT, process.env.DATA_DIR ?? 'data');
  const distDir = path.join(ROOT, process.env.DIST_DIR ?? 'dist');
  const base = siteUrl();
  const digests = await loadDigests(path.join(dataDir, 'digests'));
  if (!digests.length) {
    console.error('build: data/digests 为空，先运行 npm run collect');
    process.exitCode = 1;
    return;
  }
  await rm(distDir, { recursive: true, force: true });
  const days = digests.map((digest) => digest.day);
  const latest = digests[0];

  await write(path.join(distDir, 'index.html'), renderDigestPage(latest, { days, siteUrl: base, repoUrl: repoUrl() }));
  for (const digest of digests) {
    await write(path.join(distDir, 'day', `${digest.day}.html`), renderDigestPage(digest, { days, siteUrl: base, repoUrl: repoUrl() }));
  }
  await write(path.join(distDir, 'archive.html'), renderArchive({ digests, days, siteUrl: base, repoUrl: repoUrl() }));
  await write(path.join(distDir, 'feed.xml'), renderRss(latest, { siteUrl: base }));
  await write(path.join(distDir, 'llms.txt'), renderLlms(latest, { siteUrl: base }));
  await write(path.join(distDir, 'data', 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);

  const sitemapUrls = [`${base}/`, `${base}/archive.html`, ...days.map((day) => `${base}/day/${day}.html`)];
  await write(path.join(distDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>
`);
  await write(path.join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  await cp(path.join(ROOT, 'public'), distDir, { recursive: true });

  const pageCount = 2 + days.length;
  console.log(`build: dist ready (${digests.length} digests, ${pageCount} html pages, latest ${latest.day})`);
}

await main();
