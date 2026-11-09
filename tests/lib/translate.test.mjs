import assert from 'node:assert/strict';
import test from 'node:test';
import { needsTranslation, parseTranslation, translateConfig } from '../../src/lib/translate.mjs';

test('parsesLineProtocolOutput', () => {
  const rows = parseTranslation('1|Ollama 支持旧笔记本|在低端笔记本上免费跑小模型\n2|免费发票工具|本地 LLM 把发票转表格，无需 API Key', 2);
  assert.equal(rows.get(1).title, 'Ollama 支持旧笔记本');
  assert.equal(rows.get(2).summary, '本地 LLM 把发票转表格，无需 API Key');
});

test('parsesNumberedLineProtocolWithDot', () => {
  const rows = parseTranslation('1. | 矢量数据库还需要吗？ | 仍然有用，可配合本地 wiki。\n\n2. | Lipwise | 内置 LLM 的配音应用，低配机器也能跑。', 2);
  assert.equal(rows.get(1).title, '矢量数据库还需要吗？');
  assert.equal(rows.get(2).summary, '内置 LLM 的配音应用，低配机器也能跑。');
});

test('parsesMultipleJsonFragments', () => {
  const rows = parseTranslation('{"items":[{"i":1,"title":"中文标题一","summary":"摘要一"}]}\n\n{"items":[{"i":2,"title":"中文标题二","summary":"摘要二"}]}', 2);
  assert.equal(rows.get(1).title, '中文标题一');
  assert.equal(rows.get(2).title, '中文标题二');
});

test('fallsBackToOrderWhenIndexesAreBroken', () => {
  const rows = parseTranslation('1|第一个|说明一\n1|第二个|说明二', 2);
  assert.equal(rows.get(1).title, '第一个');
  assert.equal(rows.get(2).title, '第二个');
});

test('returnsNullForUnusableOutput', () => {
  assert.equal(parseTranslation('抱歉，我无法翻译。', 2), null);
});

test('prefersCloudflareWhenAccountAndTokenExist', () => {
  const config = translateConfig({ CLOUDFLARE_API_TOKEN: 'cf-token', CLOUDFLARE_ACCOUNT_ID: 'acct', TRANSLATE_API_KEY: 'other' });
  assert.equal(config.enabled, true);
  assert.equal(config.provider, 'cloudflare');
  assert.ok(config.endpoint.includes('/ai/run/@cf/meta/llama-3.1-8b-instruct'));
  const disabled = translateConfig({ CLOUDFLARE_API_TOKEN: 'cf-token', CLOUDFLARE_ACCOUNT_ID: 'acct', TRANSLATE: '0' });
  assert.equal(disabled.enabled, false);
});

test('keepsChineseSourceTitlesUntouched', () => {
  assert.equal(needsTranslation({ lang: 'zh', title: '单卡 7900XTX 部署文档' }), false);
  assert.equal(needsTranslation({ lang: 'en', title: 'Running LLMs on a laptop' }), true);
  assert.equal(needsTranslation({ lang: 'en', title: 'Already translated', zhTitle: '已译标题' }), false);
});
