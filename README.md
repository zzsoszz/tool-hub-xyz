# tool-hub.xyz · AI 折腾日报

每天定时从 36 个信息源采集 AI 新应用、工具玩法、本地/低配跑法、开源项目与变现思路，去重、**只保留经得起看的高质量条目**、按内容质量排名（实操类优先）、译成中文（保留原文链接），生成 Hacker News 风格的静态站点 + 免登录评论区，部署在 Cloudflare Workers（静态资源 + Worker + D1）并绑定 `tool-hub.xyz`。

- 线上地址：<https://tool-hub.xyz>（部署后）
- 本地预览：<http://127.0.0.1:8088/>
- 面向读者：自由职业者、普通用户、低配硬件玩家（关心能不能免费用、要不要好显卡、怎么接单变现）
- 技术栈：Node.js 22（ESM，**零运行时依赖**）+ GitHub Actions + Cloudflare Workers（Assets + Worker + D1）
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
src/build.mjs ──► dist/（index.html、s/<栏目>.html、tags.html、t/<标签>.html、item/<slug>.html、
      │            discuss.html、search.html、about.html、day/<日期>.html、archive.html、
      │            feed.xml、llms.txt、data/items.json）
      │
      ▼
GitHub Actions（每日 06:30 / 18:30 CST）──► Cloudflare Worker `tool-hub`
                                              ├─ Assets：静态页面与 /data/items.json
                                              └─ /api/*：评论、点赞（D1 `tool-hub`）
```

## 目录结构

- `src/collect.mjs` 采集入口；`src/build.mjs` 站点构建入口；`src/worker.mjs` 论坛 API（评论/点赞）
- `src/lib/` 解析与业务模块：`xml.mjs`（零依赖 XML/Atom 解析）、`parse.mjs`、`adapters.mjs`（JSON API）、`filter.mjs`（相关性/分类/实用度打分）、`dedupe.mjs`、`select.mjs`（分类配额）、`normalize.mjs`、`sources.mjs`、`http.mjs`、`translate.mjs`、`items.mjs`（条目 slug 与索引）、`forum.mjs`（留言校验与限流）、`render.mjs`
- `config/sources.json` 信息源清单与采集参数；`config/filters.json` 关键词、分类、质量闸门与标签定义；`config/sections.json` 顶部菜单与栏目映射
- `src/schema.sql` D1 表结构（`comments`、`votes`）
- `data/` 采集产物（`digests/`、`seen.json`、`state.json`），随提交保留历史
- `dist/` 构建产物，已 gitignore，由 CI 用 `wrangler deploy` 上传
- `public/` 静态资产与路由/缓存配置（`styles.css`、`forum.js`、`favicon.svg`、`_headers`、`_redirects`）
- `wrangler.jsonc` Cloudflare 部署目标（Assets + Worker `tool-hub` + D1 + `tool-hub.xyz` 自定义域名）
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
- **质量闸门（核心）**：`filter.quality()` 按「正文是否充实、有没有论证/干货、有没有具体数据、讨论热度、来源可信度」打分，低于 `minQuality` 直接淘汰——只采高质量、有理有据的条目，纯资讯必须更深才放行。`config/filters.json.quality` 里还有按源定制的 `sourceFloors`（HN 要求 points ≥ 30/40、reddit ≥ 150、GitHub ≥ 300 stars、arXiv 摘要 ≥ 200 字等）。
- **排名**：`rank = quality + action × 1.6`，首页、栏目页、标签页与 RSS 全部按 `rank` 排序，**可实操、可复现的条目排最前**；页面显示「深度 N」「实用 N」徽章，版主精选条目额外 +3。
- **关键词标签**：`filter.tagsFor()` 给每条打最多 4 个标签（本地部署 / 低配硬件 / 实测跑分 / 教程步骤 / Agent 工具 / 生成内容 / 免费开源 / 接单变现 / 隐私数据 / 硬件折腾），条目页与列表显示标签 chip，`/tags` 是标签索引，`/t/<标签>.html` 是聚合页。
- **条目页正文**：`src/lib/content.mjs` 把来源正文收敛成安全子集（保留段落、列表、表格、代码块、引用，丢弃脚本/事件属性/`javascript:` 链接，相对链接与图片改写成绝对地址），条目页按「中文导读 → 原文正文」排版；超过 3200 字时按句子边界截断并标注「原文约 N 字，这里保留前 M 字」。质量闸门用正文长度（而非只有摘要）判断「正文太短」。`/data/latest.json` 只保留 `bodyChars`，正文内嵌在条目页 HTML 里。
- **论坛类源**：`lcz.me`（抡锤者）8 个栏目走 `nodebb` 适配器（`kind: "json"`）。列表接口只给最后一条回复的 teaser，因此 `enrichForumTopics()` 会为热度靠前的帖子补取主贴正文、投票数与版主精选标记（`lczExcellent`），否则实测长文会被质量闸门误杀。
- **栏目**：`AI 应用`、`工具玩法`、`本地低配`（含开源项目）、`变现副业`、`新模型`、`行业观点`；先按分数排序，再按分类轮转取样，保证每栏都有条目。
- **实用度**：命中 `practicalKeywords`（免费、本地、ollama、量化、教程、副业、变现等）加分，「变现副业」「本地低配」额外加成，页面上显示为「实用 N」徽章。
- **失败保护**：所有源都失败时 `collect` 以退出码 2 结束，CI 不会发布空日报覆盖线上站点。

## 中文翻译

默认走 Cloudflare Workers AI（`@cf/meta/llama-3.1-8b-instruct`）：环境里有 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` 就会自动翻译标题与摘要；也可以用 `TRANSLATE_API_KEY` 切到 OpenAI 兼容接口。`TRANSLATE=0` 或 `npm run collect -- --no-translate` 可关闭。

`lang: "zh"` 的源（量子位、掘金、少数派、抡锤者等）保持原标题不翻译——模型会把中文标题改写得更短，反而丢掉型号与实测数字。译文仍是英文时同样保留原标题；页面同时给出「原文」链接与原始摘要，事实请回原文核对。

## 论坛（评论与点赞）

条目页底部可直接留言，`/discuss` 汇总最新评论，无需登录。规则：正文 3–2000 字、昵称最多 24 字、回复最多 3 层、同一 IP 20 秒内不能再发且每小时最多 8 条，蜜罐字段拦截机器人，IP 只保存加盐哈希。删除留言需要 `MODERATION_TOKEN`：

```bash
curl -X DELETE https://tool-hub.xyz/api/comments/12 -H "Authorization: Bearer <MODERATION_TOKEN>"
```

接口：`GET /api/comments/<slug>`、`POST /api/comments/<slug>`、`POST /api/votes/<slug>`、`GET /api/counts?items=a,b,c`、`GET /api/comments?limit=20`。

## 部署

见 [docs/DEPLOY.md](docs/DEPLOY.md)：GitHub 仓库、Cloudflare 部署目标、Actions Secrets、`tool-hub.xyz` 域名与故障排查。

## 消费方式

- RSS：`/feed.xml`
- 纯文本（适合喂给 LLM）：`/llms.txt`
- 结构化数据：`/data/latest.json`
- 全量条目索引（slug → 标题/原文链接）：`/data/items.json`，`/search` 用它做浏览器本地检索
- 按关键词浏览：`/tags` → `/t/<标签>.html`（如 `/t/lowspec`、`/t/benchmark`）
