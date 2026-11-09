import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, process.env.DIST_DIR ?? 'dist');
const PORT = Number(process.env.PORT ?? 8088);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let target = join(DIST, safe);
  const info = await stat(target).catch(() => null);
  if (info?.isDirectory()) target = join(target, 'index.html');
  if (!extname(target)) target = `${target}.html`;
  return target.startsWith(DIST) ? target : null;
}

const server = createServer(async (request, response) => {
  const target = await resolveFile(request.url ?? '/');
  const body = target ? await readFile(target).catch(() => null) : null;
  if (!body) {
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>404</title><p>页面不存在。</p><p><a href="/">返回今日日报</a></p>');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
  response.end(body);
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = [
    `http://127.0.0.1:${PORT}/`,
    ...Object.values(os.networkInterfaces())
      .flat()
      .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
      .map((entry) => `http://${entry.address}:${PORT}/`),
  ];
  console.log(`serving ${DIST}`);
  for (const address of addresses) console.log(`  ${address}`);
});
