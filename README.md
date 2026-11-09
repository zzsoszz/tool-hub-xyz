# tool-hub.xyz · AI 前沿资讯日报

每天定时从 21 个一手信息源采集 AI 新技术、模型发布、论文与行业动态，去重、排序、分类后生成静态站点，部署到 Cloudflare Workers 静态资源并绑定 `tool-hub.xyz`。

- 线上地址：<https://tool-hub.xyz>（部署后）
- 本地预览：<http://127.0.0.1:8088/>
- 技术栈：Node.js 22（ESM，**零运行时依赖**）+ GitHub Actions + Cloudflare Workers（静态资源）
- 测试：Node 内置 `node:test`，离线样例可完整跑通流水线

## 工作流程

```text
config/sources.json
      │  并发抓取（RSS / Atom / JSON API，超时与退避重试）
      ▼
src/collect.mjs ── 解析 → 相关性过滤 → 跨天去重(seen.json) → 打分 → 分类配额选择
      │                                    │
      ▼                                    ▼
data/digests/<日期>.json            data/seen.json · data/state.json
      │
      ▼
src/build.mjs ──► dist/（index.html、day/<日期>.html、archive.html、feed.xml、llms.txt、sitemap.xml）
      │
      ▼
GitHub Actions（每日 06:30 / 18:30 CST）──► Cloudflare Workers（`tool-hub`）──► tool-hub.xyz
```

## 目录结构

- `src/collect.mjs` 采集入口；`src/build.mjs` 站点构建入口
- `src/lib/` 解析与业务模块：`xml.mjs`（零依赖 XML/Atom 解析）、`parse.mjs`、`adapters.mjs`（JSON API）、`filter.mjs`（相关性/分类/打分）、`dedupe.mjs`、`select.mjs`（分类配额）、`normalize.mjs`、`sources.mjs`、`http.mjs`、`translate.mjs`、`render.mjs`
- `config/sources.json` 信息源清单与采集参数；`config/filters.json` 关键词与分类定义
- `data/` 采集产物（`digests/`、`seen.json`、`state.json`），随提交保留历史
- `dist/` 构建产物，已 gitignore，由 CI 用 `wrangler deploy` 上传
- `public/` 静态资产与路由/缓存配置（`styles.css`、`favicon.svg`、`_headers`、`_redirects`）
- `wrangler.jsonc` Cloudflare 部署目标（Worker `tool-hub` + `tool-hub.xyz` 自定义域名）
- `tests/` 单元与端到端测试，`tests/fixtures/` 为离线样例
- `docs/DEPLOY.md` 部署手册

## 常用命令

```bash
npm run collect      # 抓取全部信息源，写入 data/digests/<日期>.json
npm run build        # 由 data 生成 dist/
npm run digest       # collect + build
npm run dev          # digest 后在 0.0.0.0:8088 起本地预览（含局域网地址）
npm test             # 单元测试 + 离线端到端流水线，纯离线
npm run lint         # 语法、缩进、行尾空白与密钥扫描
```

无第三方依赖，因此不需要 `npm install`。

本地网络访问部分源超时时，可让 Node 的 `fetch` 走代理：

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://192.168.31.4:7890 npm run collect
```

## 采集策略

- **去重**：URL 规范化（去 `utm_*`/`ref`、去 `www.`、去末尾斜杠）后取 SHA-1；标题去噪后再哈希一次，跨源转载也会被合并。`data/seen.json` 跨天保留 45 天。
- **增量**：`data/state.json` 记录上次运行时间，日内二次运行只补新增条目，并保留当天已发布内容（同一天的多次运行不会互相覆盖）。
- **时间窗口**：默认 48 小时，可按源设置 `windowHours`（官方 blog 96h、论文 72h、新仓库 168h）。若某源在窗口内无产出，则回退到其最新 2 条（不超过 `maxAgeDays: 7`），避免论文/官方栏目整块空掉。
- **质量门槛**：`minMetrics` 过滤低热度仓库（GitHub 新仓库要求 `stars > 100`）；`noiseKeywords` 排除与 AI 无关的蹭词内容。
- **分类配额**：先按分数排序，再按分类轮转取样，保证「模型与发布 / 开源与生态 / 论文与研究 / 产品与应用 / 行业与资本 / 观点与深度 / 工具与工程」每类都有条目。
- **失败保护**：所有源都失败时 `collect` 以退出码 2 结束，CI 不会发布空日报覆盖线上站点。

## 中文摘要（可选）

设置 `TRANSLATE_API_KEY` 后会调用 OpenAI 兼容接口，为英文条目生成中文标题与摘要；未配置时自动跳过，站点仍正常工作。相关变量：`TRANSLATE_API_BASE`（默认 `https://api.openai.com/v1`）、`TRANSLATE_MODEL`（默认 `gpt-4o-mini`）。

## 部署

见 [docs/DEPLOY.md](docs/DEPLOY.md)：GitHub 仓库、Cloudflare 部署目标、Actions Secrets、`tool-hub.xyz` 域名与故障排查。

## 消费方式

- RSS：`/feed.xml`
- 纯文本（适合喂给 LLM）：`/llms.txt`
- 结构化数据：`/data/latest.json`
