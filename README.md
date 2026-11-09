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
data/hidden.json ◄── src/review.mjs（硬规则 + 独立模型复核，拦下的条目写进 hidden.json）
      │
      ▼
src/build.mjs ──► dist/（index.html、s/<栏目>.html、s/<栏目>/<子类>.html、tags.html、t/<标签>.html、
      │            item/<slug>.html、discuss.html、search.html、about.html、day/<日期>.html、
      │            archive.html、archive/<年>.html、archive/<年-月>.html、markdown/<日期>.md、
      │            feed.xml、llms.txt、data/items.json）
      │
      ▼
GitHub Actions（每日 06:30 / 18:30 CST）── 采集 → 质量审查 → 发布 三个 job ──► Cloudflare Worker `tool-hub`
                                              ├─ Assets：静态页面与 /data/items.json
                                              └─ /api/*：评论、点赞（D1 `tool-hub`）
```

## 目录结构

- `src/collect.mjs` 采集入口；`src/review.mjs` 发布前的独立质量审查；`src/build.mjs` 站点构建入口；`src/worker.mjs` 论坛与下架 API
- `src/lib/` 解析与业务模块：`xml.mjs`（零依赖 XML/Atom 解析）、`parse.mjs`、`adapters.mjs`（JSON API）、`filter.mjs`（相关性/分类/实用度打分）、`dedupe.mjs`、`select.mjs`（分类配额）、`normalize.mjs`、`sources.mjs`、`http.mjs`、`translate.mjs`、`items.mjs`（条目 slug 与索引）、`listview.mjs`（年/月筛选与排序规则，构建期与浏览器共用一份）、`markdown.mjs`（日报导出 Markdown）、`review` 用的 `filter.mjs` 闸门、`forum.mjs`（留言校验与限流）、`admin.mjs`（管理员会话与下架校验）、`render.mjs`
- `config/sources.json` 信息源清单与采集参数；`config/filters.json` 关键词、分类、质量闸门与标签定义；`config/sections.json` 顶部菜单与栏目映射
- `src/schema.sql` D1 表结构（`comments`、`votes`、`hidden_items`、`admin_attempts`）
- `data/` 采集产物（`digests/`、`seen.json`、`state.json`）、`hidden.json`（下架条目：管理员 + 审查）、`reviews/<日期>.json`（审查结论），随提交保留历史
- `dist/` 构建产物，已 gitignore，由 CI 用 `wrangler deploy` 上传
- `public/` 静态资产与路由/缓存配置（`styles.css`、`forum.js`、`funnel.js`、`list.js`（列表筛选与排序）、`admin.js`（登录与下架）、`favicon.svg`、`_headers`、`_redirects`）
- `wrangler.jsonc` Cloudflare 部署目标（Assets + Worker `tool-hub` + D1 + `tool-hub.xyz` 自定义域名）
- `tests/` 单元与端到端测试，`tests/fixtures/` 为离线样例
- `scripts/` 运维脚本：`serve.mjs`（本地预览）、`reclassify.mjs`（按现行配置重打历史分类）、`fetch-hidden.mjs`（从 D1 拉回管理员下架记录）、`lint.mjs`
- `docs/DEPLOY.md` 部署手册；`docs/DESIGN.md` 视觉规范（配色/字体/版式 token 与写作约定）

## 常用命令

```bash
npm run collect      # 抓取全部信息源，写入 data/digests/<日期>.json
npm run build        # 由 data 生成 dist/
npm run digest       # collect + build
npm run review       # 发布前质量审查（硬规则 + 独立模型），报告写 data/reviews/<日期>.json
                     # 加 -- --apply 把拦下的条目并入 data/hidden.json；-- --allow-no-agent 只跑硬规则
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
- **排名**：`rank = quality + action × 1.6`，首页、栏目页、标签页与 RSS 全部按 `rank` 排序，**可实操、可复现的条目排最前**；页面显示「深度 N」「实用 N」徽章，版主精选条目额外 +3，带配图/实测截图的条目再加 `quality.illustrationBonus`（默认 +1）。
- **首页条目数**：首页开场是当天的漏斗读数（抓取 → 入选，`data-count-to` 由 `funnel.js` 一次性数到位），只留当日排名最高的 `config/sections.json.homeLimit`（默认 10）条，并给出「查看全部 N 条」（`/day/<日期>`）入口；栏目页、标签页、RSS 与 `/data/latest.json` 不受这个限制。
- **深度 / 实用量条**：条目列表与条目页用 `.meter` 刻度显示 `quality` 与 `practical`，刻度里的竖线是 `filters.json` 的质量闸门线（深度 6、实用 3），条超过竖线才算过关。
- **关键词标签**：`filter.tagsFor()` 给每条打最多 4 个标签，条目页与列表的标签 chip 显示中文标签名（本地部署 / 低配硬件 / 实测跑分 / 教程步骤 / Agent 工具 / 生成内容 / 免费开源 / 接单变现 / 隐私数据 / 硬件折腾），链接仍走 `/t/<标签>.html`；`/tags` 是标签索引。
- **条目页正文**：`src/lib/content.mjs` 把来源正文收敛成安全子集（保留段落、列表、表格、代码块、引用，丢弃脚本/事件属性/`javascript:` 链接，相对链接与图片改写成绝对地址），条目页按「中文导读 → 原文正文」排版；超过 3200 字时按句子边界截断并标注「原文约 N 字，这里保留前 M 字」。截断落在段落中间时会就地补齐当时打开的标签，不会留下 `<li><p></p></li>` 这类空壳；`balanceHtml()` 丢弃来源里配不上开标签的闭合标签、`repairArticle()` 顺手清掉历史数据里的空壳，保证正文是结构完整的 HTML。条目页表格统一包在 `.table-scroll` 内以支持横向滚动。质量闸门用正文长度（而非只有摘要）判断「正文太短」。`/data/latest.json` 只保留 `bodyChars`，正文内嵌在条目页 HTML 里。
- **论坛类源**：`lcz.me`（抡锤者）8 个栏目走 `nodebb` 适配器（`kind: "json"`）。列表接口只给最后一条回复的 teaser，因此 `enrichForumTopics()` 会为热度靠前的帖子补取主贴正文、投票数与版主精选标记（`lczExcellent`），否则实测长文会被质量闸门误杀。
- **栏目**：`AI 应用`、`工具玩法`、`AI 硬件`、`本地开源`、`变现副业`、`评测选型`（`config/filters.json.categories`）；先按分数排序，再按分类轮转取样，保证每栏都有条目。原「本地低配」已并入 `AI 硬件` + `本地开源`，低配相关内容用 `低配硬件` 标签与 `硬件折腾` 子类承载。
- **实用度**：命中 `practicalKeywords`（免费、本地、ollama、量化、教程、副业、变现等）加分，「变现副业」「本地低配」额外加成，页面上显示为「实用 N」徽章。
- **失败保护**：所有源都失败时 `collect` 以退出码 2 结束，CI 不会发布空日报覆盖线上站点。

## 分类与细分子类

一级分类和子类都只按**文章内容**判断（来源自己的栏目名不参与），规则全在 `config/filters.json`：先按 `categories[].keywords` 定一级分类，再在该分类的 `subcategories[]` 里取命中最多的子类；父类没有命中子类时留空，栏目页归到「其他」。栏目页顶部是子类导航（`/s/<栏目>/<子类>`），条目页上有一枚子类 chip。

| 一级 | 细分子类 |
| --- | --- |
| AI 应用 | 效率办公 · 内容创作 · **视频生成**（ComfyUI、Wan、Kling 这类出片工作流） · **大模型推理**（Strata、SGLang、vLLM、llama.cpp、TensorRT-LLM、KTransformers 这类推理框架） · 智能体应用 · 检索与知识 · 生活与学习 |
| 工具玩法 | 工作流与自动化 · 编程与开发 · 接口与插件 · 提示词与调教 · 教程与踩坑 |
| AI 硬件 | 显卡与算力 · 主机与整机 · 开发板与边缘 · 功耗与性价比 · 装机与升级 |
| 本地开源 | 本地运行时 · 开源权重与数据 · 量化与微调 · 自建与部署 |
| 变现副业 | 接单与服务 · 产品与定价 · 内容变现 · 案例与复盘 |
| 评测选型 | 跑分与评测 · 横向对比 · 成本与价格 · 选型建议 |

改完配置不必重新采集：`node scripts/reclassify.mjs --dry` 先看影响，确认后 `node scripts/reclassify.mjs` 按现行配置重打历史日报的分类、子类与标签。

## 只保留实践性内容

`config/filters.json.quality.practicalGate` 是硬闸门：条目必须**有实测数据**（带单位的数字：tok/s、GB、ms、%、倍，或跑分/成本这类词）或**有复现步骤**（正文含代码块/有序步骤，或标题摘要写着怎么装、怎么配、怎么跑），否则直接淘汰。只有转述、既没数据也没步骤的内容不进日报。

## 质量审查闸门（换一个 agent 复核）

采集之后、发布之前，`src/review.mjs` 用另一个模型独立复核一遍；CI 里它是独立的 job，**不通过就不发布**。

- **硬规则先跑**（不可被模型推翻）：正文少于 `minBodyChars`（默认 120 字）或摘要少于 `minSummaryChars`（默认 40 字）→「内容过少」；标签为空、重复、超过 4 个或不在标签表 →「标签异常」；分类/子类不在配置里、原文链接无效、链接或标题重复 → 异常；`filter.quality()` 不放行 →「实践性闸门不通过」。日报级：放行条目少于 `minItems`（默认 5）条也不通过。
- **模型只能追加拦截**，不能放行硬失败。行协议输出 `序号|pass|理由` / `序号|fail|理由`，解析失败的批次会重试一次，仍失败就按未放行处理。
- 默认模型 `@cf/meta/llama-3.1-70b-instruct`（Workers AI，与翻译用的 8B 不是同一个）；`REVIEW_MODEL` 可换，没有 Cloudflare 凭据时可用 `REVIEW_API_KEY`/`TRANSLATE_API_KEY` 走 OpenAI 兼容接口。缺凭据且没 `--allow-no-agent` 时审查直接判不通过（CI fail-closed）。
- 结论写 `data/reviews/<日期>.json`（逐条 `hard`/`agent`/`blocked`、`blocked` 列表、`survivors`）；`--apply` 把拦下的 slug 写进 `data/hidden.json`（按天记录，重跑同一天会覆盖当天结论，管理员下架另存 `admin` 不受影响），构建期据此剔除。

```bash
npm run review                                   # 只审查，看报告
npm run review -- --apply                        # 拦下的条目写入 data/hidden.json
npm run review -- --day=2026-11-09 --apply       # 指定日期
node scripts/fetch-hidden.mjs                    # 从线上 D1 取回管理员下架记录，合并进 hidden.json
```

## 中文翻译

默认走 Cloudflare Workers AI（`@cf/meta/llama-3.1-8b-instruct`）：环境里有 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` 就会自动翻译标题与摘要；也可以用 `TRANSLATE_API_KEY` 切到 OpenAI 兼容接口。`TRANSLATE=0` 或 `npm run collect -- --no-translate` 可关闭。

`lang: "zh"` 的源（量子位、掘金、少数派、抡锤者等）保持原标题不翻译——模型会把中文标题改写得更短，反而丢掉型号与实测数字。译文仍是英文时同样保留原标题；页面同时给出「原文」链接与原始摘要，事实请回原文核对。

## 论坛（评论与点赞）

条目页底部可直接留言，`/discuss` 汇总最新评论，无需登录。规则：正文 3–2000 字、昵称最多 24 字、回复最多 3 层、同一 IP 20 秒内不能再发且每小时最多 8 条，蜜罐字段拦截机器人，IP 只保存加盐哈希。删除留言需要 `MODERATION_TOKEN`：

```bash
curl -X DELETE https://tool-hub.xyz/api/comments/12 -H "Authorization: Bearer <MODERATION_TOKEN>"
```

接口：`GET /api/comments/<slug>`、`POST /api/comments/<slug>`、`POST /api/votes/<slug>`、`GET /api/counts?items=a,b,c`、`GET /api/comments?limit=20`。

## 列表的年月筛选与排序

栏目页、子类页、标签页和归档页顶部有一组筛选控件：**年份**、**月份**、**排序**（质量评分 / 最新发布 / 来源热度），默认按质量评分从高到低（`quality` → 排名分 → 发布时间）。月份按原文发布时间归类，没有发布时间才退回日报日期，因此 `/archive/<年-月>` 的分组和页面上的月份筛选是同一套口径。选择结果写进 URL（`?month=2026-11&year=2026&sort=newest`），链接可直接分享；表单是 `method="get"`，禁用 JS 时退化为一次 GET，服务端渲染出来的默认顺序就是质量评分顺序。规则集中在 `src/lib/listview.mjs`，构建期与浏览器共用同一份，不会出现两边排序不一致。

## 管理员登录与条目下架

- **登录**：任意页面底部的「管理员登录」→ `POST /api/admin/login`，成功后发 HttpOnly + SameSite=Lax + Secure 会话 cookie（8 小时）。凭据来自 Workers secret `ADMIN_USER` / `ADMIN_PASSWORD`，会话签名用 `SESSION_SECRET`（缺省退回 `MODERATION_TOKEN`）。
- **防滥用**：登录失败按 IP 哈希计数，15 分钟内失败 10 次返回 429（`admin_attempts` 表）；所有写操作要求 `x-requested-with: tool-hub` 且 Origin 同源，缺少凭据时接口直接 fail-closed。
- **下架**：管理员在列表行点「下架」（填原因）或在条目页操作，`POST /api/items/<slug>/hide` / `POST /api/items/<slug>/unhide`，另有 `GET /api/admin/session`、`GET /api/hidden`。
- **生效范围**：下架后运行时 `/item/<slug>` 返回 410 下架页、`/data/items.json` 过滤该条；`node scripts/fetch-hidden.mjs` 把 D1 的 `hidden_items` 拉回 `data/hidden.json`，下一次构建连页面都不生成。管理员下架与审查下架在 `hidden.json` 里分开记录（`admin` / `machine`），互不覆盖。

## 部署

见 [docs/DEPLOY.md](docs/DEPLOY.md)：GitHub 仓库、Cloudflare 部署目标、Actions Secrets、`tool-hub.xyz` 域名与故障排查。

## 消费方式

- RSS：`/feed.xml`
- 纯文本（适合喂给 LLM）：`/llms.txt`
- 每日 Markdown（标题、摘要、正文摘录、原文链接、质量分）：`/markdown/<日期>.md`，日报页与归档页都有下载链接
- 结构化数据：`/data/latest.json`
- 全量条目索引（slug → 标题/原文链接）：`/data/items.json`，`/search` 用它做浏览器本地检索
- 按关键词浏览：`/tags` → `/t/<标签>.html`（如 `/t/lowspec`、`/t/benchmark`）
