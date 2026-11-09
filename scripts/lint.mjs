import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGETS = ['src', 'scripts', 'tests'];
const SECRET_PATTERNS = [/\bsk-[A-Za-z0-9]{12,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bxox[baprs]-[A-Za-z0-9-]{10,}/];

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(target);
    else if (entry.name.endsWith('.mjs')) yield target;
  }
}

const problems = [];
let checked = 0;

for (const dir of TARGETS) {
  for await (const file of walk(path.join(ROOT, dir))) {
    checked += 1;
    const relative = path.relative(ROOT, file);
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      problems.push(`${relative}: 语法错误\n${String(error.stderr ?? error).split('\n').slice(0, 4).join('\n')}`);
      continue;
    }
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n');
    if (!text.endsWith('\n')) problems.push(`${relative}: 文件末尾缺少换行`);
    if (/\r/.test(text)) problems.push(`${relative}: 存在 CRLF 换行，应使用 LF`);
    lines.forEach((line, index) => {
      const lineNo = index + 1;
      if (line.startsWith('\t')) problems.push(`${relative}:${lineNo}: 使用制表符缩进，应为 2 个空格`);
      if (/[ \t]+$/.test(line)) problems.push(`${relative}:${lineNo}: 行尾多余空白`);
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) problems.push(`${relative}:${lineNo}: 疑似硬编码密钥`);
      }
    });
  }
}

const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.type !== 'module') problems.push('package.json: 应为 "type": "module"');

if (problems.length) {
  console.error(`lint: ${problems.length} 个问题（已检查 ${checked} 个文件）`);
  for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`lint: ${checked} 个文件通过（语法、缩进、行尾空白、密钥扫描）`);
}
