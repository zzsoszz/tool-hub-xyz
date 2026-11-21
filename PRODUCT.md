# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

普通用户、自由职业者与低配玩家：每天在中文里读 AI 前沿资讯的人。他们的处境是信息过载——同一条发布有十几个来源在写；他们要做的事是判断「这条值不值得我今天动手」。次要读者是想知道某个评测数字从哪来的技术读者。

## Product Purpose

每天 06:30 与 18:30（北京时间）自动采集 38 个左右的公开信息源，去重、按质量闸门排序、把标题与摘要译成中文，产出一份当天日报、栏目与标签入口、可核对的评测数据页和一个匿名讨论区。成功是读者花几分钟就能知道今天有哪些内容值得动手，并且每一条都能回到原文核对。

## Positioning

质量闸门是可见的：每条的深度与实用都用 `.meter` 量条表示，刻度里的竖线就是 `config/filters.json` 的门槛，读者能看出这条离门槛多远。评测数字不进代码：只存在 `data/bench/<id>.json`，页面同时打印 commit、逐文件 SHA-256 与字节数，每行结论链接到上游那个 revision，并提供 `/bench/<id>.json` 下载。独立模型审查不过审就不发布。

## Operating Context

GitHub Actions 每天两次跑「采集 → 独立 agent 质量审查 → 构建 → 发布」；审查不过审时发布环节整个跳过。站点是 Cloudflare Workers 的 assets-only Worker，自定义域名 `tool-hub.xyz`，讨论区走 `/api/*` 加 D1。本地开发用 `npm run dev`（采集 + 构建 + 在 `0.0.0.0:8088` 起服务）。

## Capabilities and Constraints

- 零第三方依赖的 Node 22 ESM：`src/` 采集与构建，`public/` 是唯一的客户端资产，`data/` 存 digest，`dist/` 是产物。
- 上游正文只保留与净化，不改写：引用里的措辞、数字与单位保持原文，中文只出现在本站写的标题、摘要、导读与结论里。
- 机器翻译只处理标题与摘要；正文标注「原文正文（未翻译）」。
- 正文配图存本地副本（`data/images/` 不提交），构建只替换已存在的副本，绝不留下坏图；SVG 直接拒绝。
- 下架与隐藏记录来自线上 D1，构建时合并（`scripts/fetch-hidden.mjs`）。
- 待确认：是否需要正式的版本号发布（目前没有任何 git tag 或 GitHub Release，只有每天两次持续部署）。

## Brand Commitments

名称 `tool-hub.xyz` / 「AI 折腾日报」。中文文案约定见 `DESIGN.md`：主动语态，按钮说清会发生什么，链接文字不带箭头，次要信息写成短句而不是 `A · B · C`，空状态与失败状态给下一步。

## Evidence on Hand

- `data/digests/*.json`：19 天采集记录，含漏斗计数与每个信息源的成败。
- `data/reviews/*.json`：每天的质量审查结论（硬规则 + 独立模型复核）。
- `data/bench/*.json`：评测数据，逐文件哈希由 `src/bench.mjs` 写入。
- 站点产物 528 个 HTML / 19 个 markdown：19 份日报、6 个栏目、29 个子类、10 个标签、454 个条目页、5 个固定页、3 个评测数据页。
- 不存在的东西：没有登录与账号体系，没有付费内容，没有自建分析工具，没有用户提交的 testimonials。这些都不能凭空写进页面。

## Product Principles

1. 每条内容都能回到原文；译文与导读只是入口，不是结论。
2. 数字要有出处：commit、逐文件哈希、测量条件一起给，跨机器的结论不外推。
3. 质量闸门公开：筛选口径写在页面上，读者能自己复现。
4. 读者时间比页面花哨值钱：少而整齐的入口优于多而粗糙的模块。
5. 自动流水线要能被审计：采集、审查、发布三段都留下可查的记录。

## Accessibility & Inclusion

文字对比度按 WCAG AA（正文 4.5:1、大字 3:1）；文档大纲不跳级，正文里孤立的深层标题上提到 `h3`；键盘焦点可见；全站尊重 `prefers-reduced-motion`，`reduce` 时禁用动画。中文正文行长 ≤ 74ch，正文 17px 衬线、行高 1.9。
