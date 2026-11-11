import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceHtml, markdownToHtml, repairArticle, sanitizeArticle, textToArticle } from '../../src/lib/content.mjs';

test('keepsParagraphsListsAndTables', () => {
  const article = sanitizeArticle(
    '<p>跑完 <strong>128K</strong> 上下文</p><ul><li>输出 105 tok/s</li><li>prefill 3400 tok/s</li></ul><table><tr><th>显卡</th><th>显存</th></tr><tr><td>5080</td><td>15.2 GB</td></tr></table>',
    { baseUrl: 'https://lcz.me/topic/2894', minChars: 20 },
  );
  assert.ok(article.html.includes('<strong>128K</strong>'));
  assert.ok(article.html.includes('<ul><li>输出 105 tok/s</li>'));
  assert.ok(article.html.includes('<table><tr><th>显卡</th><th>显存</th></tr>'));
  assert.ok(article.text.includes('5080'));
  assert.equal(article.truncated, false);
});

test('stripsScriptsEventHandlersAndDangerousUrls', () => {
  const article = sanitizeArticle(
    '<p onclick="steal()">这段文本是安全的，包含实测数据与结论。</p><script>alert(1)</script><style>.x{color:red}</style><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">坏链接</a><a href="https://ok.test/page">好链接</a>',
    { baseUrl: 'https://lcz.me/topic/1', minChars: 20 },
  );
  assert.ok(!article.html.includes('onclick'));
  assert.ok(!article.html.includes('alert(1)'));
  assert.ok(!article.html.includes('<script'));
  assert.ok(!article.html.includes('<style'));
  assert.ok(!article.html.includes('<iframe'));
  assert.ok(!article.html.includes('javascript:'));
  assert.ok(article.html.includes('<a href="https://ok.test/page" target="_blank" rel="nofollow noopener noreferrer">好链接</a>'));
});

test('resolvesRelativeLinksAndImagesAgainstTheArticleUrl', () => {
  const article = sanitizeArticle('<p><a href="/user/foo">作者主页</a> 附图如下，跑分截图与显存占用都在图里。<img src="/uploads/1.png" alt="跑分截图"></p>', { baseUrl: 'https://lcz.me/topic/2607', minChars: 10 });
  assert.ok(article.html.includes('href="https://lcz.me/user/foo"'));
  assert.ok(article.html.includes('src="https://lcz.me/uploads/1.png"'));
  assert.ok(article.html.includes('loading="lazy"'));
});

test('truncatesAtBlockBoundaryAndReportsIt', () => {
  const long = Array.from({ length: 12 }, (_, index) => `<p>第 ${index + 1} 段：` + '字'.repeat(300) + '</p>').join('\n');
  const article = sanitizeArticle(long, { baseUrl: 'https://lcz.me/topic/1', maxChars: 1000 });
  assert.equal(article.truncated, true);
  assert.ok(article.shown >= 1000 && article.shown < 1320);
  assert.ok(article.chars > 3500 && article.chars < 3800);
  assert.ok(article.html.split('<p>').length - 1 <= 4);
});

test('leadSkipsTablesSoCardSummariesStayReadable', () => {
  const article = sanitizeArticle('<p>先说结论：双卡比单卡快 18.8%。</p><table><tr><td>5090</td><td>75 s</td></tr></table><p>后面的讨论</p>', { baseUrl: 'https://lcz.me/topic/1', minChars: 10 });
  assert.equal(article.lead, '先说结论：双卡比单卡快 18.8%。');
});

test('buildsReadableParagraphsFromPlainText', () => {
  const article = textToArticle('第一段。\n第二段。\n\n第三段。', { baseUrl: 'https://ex.test/a', minChars: 6 });
  assert.equal(article.html.split('<p>').length - 1, 3);
  assert.ok(article.text.includes('第二段'));
});

test('returnsNullForTooShortBodies', () => {
  assert.equal(sanitizeArticle('<p>太短</p>', { baseUrl: 'https://ex.test/a' }), null);
  assert.equal(sanitizeArticle('', { baseUrl: 'https://ex.test/a' }), null);
});

function tagBalance(html) {
  const stack = [];
  const orphans = [];
  for (const match of html.matchAll(/<(\/)?([a-z][a-z0-9]*)([^>]*)>/gi)) {
    const name = match[2].toLowerCase();
    if (['br', 'hr', 'img'].includes(name)) continue;
    if (!match[1]) {
      stack.push(name);
      continue;
    }
    const index = stack.lastIndexOf(name);
    if (index === -1) {
      orphans.push(name);
      continue;
    }
    stack.length = index;
  }
  return { orphans, unclosed: stack };
}

test('balancesUnclosedParagraphsInSourceBodies', () => {
  const article = sanitizeArticle('<p>这段正文漏了闭合标签<ul><li>实测 1.26 到 1.42 倍</li><li>同机同模型对比</li></ul>结论：确实更快，但没有 2 倍。', { baseUrl: 'https://lcz.me/topic/2607', minChars: 20 });
  const { orphans, unclosed } = tagBalance(article.html);
  assert.deepEqual(orphans, []);
  assert.deepEqual(unclosed, []);
});

test('closesContainersAtTheCutPointInsteadOfEmptyShells', () => {
  const source = Array.from({ length: 10 }, (_, index) => `<p>第 ${index + 1} 节</p><ul><li><p>${'实测数据与结论。'.repeat(20)}</p></li><li><p>后续条目</p></li></ul>`).join('\n');
  const article = sanitizeArticle(source, { baseUrl: 'https://lcz.me/topic/2857', maxChars: 800 });
  assert.equal(article.truncated, true);
  assert.ok(!article.html.includes('<p></p>'), article.html.slice(-200));
  assert.ok(!/<li>\s*<\/li>/.test(article.html));
  const { orphans, unclosed } = tagBalance(article.html);
  assert.deepEqual(orphans, []);
  assert.deepEqual(unclosed, []);
});

test('repairsStoredArticlesThatCarryStrayClosingTags', () => {
  const stored = '<p>双卡提升 18.8%。</p><ul><li><p>已上 TP=2</p></li><li><p></p></li></ul></p></li><li><p></p></li></ul>';
  const repaired = repairArticle(stored);
  assert.ok(!repaired.includes('<p></p>'));
  assert.ok(repaired.includes('双卡提升 18.8%。'));
  const { orphans, unclosed } = tagBalance(repaired);
  assert.deepEqual(orphans, []);
  assert.deepEqual(unclosed, []);
  assert.equal(repairArticle(repaired), repaired);
  assert.equal(balanceHtml(''), '');
});
test('convertsReleaseMarkdownIntoBlocksCodeAndLinks', () => {
  const html = markdownToHtml(
    "## What's Changed\n* 显存占用降到 11.2 GB\n* 修复 [启动崩溃](https://example.test/a?b=1&c=2)\n\n1. 安装\n2. 运行\n\n```bash\nllm install x\n```\n正文里的 `tok/s` 保留",
  );
  assert.ok(html.includes('<h4>What\'s Changed</h4>'), html);
  assert.ok(html.includes('<ul><li>显存占用降到 11.2 GB</li>'), html);
  assert.ok(html.includes('<a href="https://example.test/a?b=1&amp;c=2">启动崩溃</a>'), html);
  assert.ok(html.includes('<ol><li>安装</li><li>运行</li></ol>'), html);
  assert.ok(html.includes('<pre><code>llm install x</code></pre>'), html);
  assert.ok(html.includes('<p>正文里的 <code>tok/s</code> 保留</p>'), html);
});

test('keepsMarkdownHeadingsFromLeakingIntoPlainText', () => {
  const article = sanitizeArticle(markdownToHtml('# 标题\n\n第一段说明\n\n第二段说明'), { baseUrl: 'https://github.com/a/b', minChars: 10 });
  assert.ok(article.html.includes('<h3>标题</h3>'), article.html);
  assert.ok(!article.text.includes('# 标题'), article.text);
});

