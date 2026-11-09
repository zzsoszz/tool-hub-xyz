# 部署手册（GitHub + Cloudflare Workers 静态资源 + tool-hub.xyz）

## 1. 推送代码到 GitHub

```bash
cd ~/code/tool-hub.xyz
gh auth login -h github.com          # 现有 token 失效时重新登录
gh repo create tool-hub-xyz --private --source=. --remote=origin --push
# 或手动：git remote add origin https://github.com/<你的账号>/tool-hub-xyz.git && git push -u origin main
```

## 2. 部署目标：Worker `tool-hub`（静态资源）

`tool-hub.xyz` 绑定到账户里的 **Worker `tool-hub`**：静态资源走 Assets，`/api/*` 由 `src/worker.mjs` 处理（评论/点赞读写 D1 `tool-hub`）。
仓库根目录的 `wrangler.jsonc` 描述了这个目标：

```jsonc
{
  "name": "tool-hub",
  "main": "src/worker.mjs",
  "assets": { "directory": "./dist", "binding": "ASSETS" },
  "d1_databases": [
    { "binding": "DB", "database_name": "tool-hub", "database_id": "1ff9f142-a269-419d-b361-9289b51bfbd0" }
  ],
  "routes": [{ "pattern": "tool-hub.xyz", "custom_domain": true }]
}
```

本地手动发布（`npx` 会临时拉取 wrangler，仓库本身零依赖）：

```bash
npm run build
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx --yes wrangler@4 deploy
```

`dist/_headers`、`dist/_redirects` 在该形态下同样生效（已线上验证）。历史版本可用
`npx wrangler deployments list` 与 `npx wrangler rollback` 回退。

## 2.1 初始化 D1（评论、点赞、下架、登录限流）

```bash
npx --yes wrangler@4 d1 create tool-hub          # 记下返回的 database_id，写进 wrangler.jsonc
npx --yes wrangler@4 d1 execute tool-hub --remote --file=src/schema.sql
```

表：`comments`、`votes`、`hidden_items`（管理员下架的条目）、`admin_attempts`（登录失败计数）。
`src/schema.sql` 全是 `IF NOT EXISTS`，改过表结构后**重新执行一遍这条命令即可**，不会重建已有数据。

本地演练用 `.wrangler/` 里的本地 D1：`npx wrangler d1 execute tool-hub --local --file=src/schema.sql`，
再用 `npx wrangler dev`（默认 127.0.0.1:8787）联调论坛接口。

注意：wrangler 4 的 D1 里 `stmt.all(params)` / `stmt.first(param)` 会把参数误当成 options，
报 `Wrong number of parameter bindings`。所有查询统一写成 `.bind(...params).all() / .first() / .run()`。

## 3. 配置 Secrets 与 Vars

本机所有真实凭证集中写在仓库根目录的 `credentials.local.md`（已被 `.gitignore` 忽略；**仓库是 public，绝对不能提交**）。令牌副本另存 `~/.config/tool-hub/cloudflare.token`（chmod 600）。下表只写名称与作用，不写值。

仓库 → Settings → Secrets and variables → Actions：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare Profile → API Tokens，权限 `Workers Scripts: Edit` + `Workers Custom Domains: Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare 账户 ID（Dashboard 右上角） |
| `TRANSLATE_API_KEY` | Secret | 可选，启用中文摘要 |
| `TRANSLATE_MODEL` | Variable | 可选，默认 `gpt-4o-mini` |
| `REVIEW_MODEL` | Variable | 可选，覆盖质量审查用的模型；不设则用 `src/review.mjs` 里的 `@cf/meta/llama-3.1-70b-instruct` |

Worker 侧的 Secrets（用 `wrangler secret put`，值见 `credentials.local.md`）：

| 名称 | 作用 |
| --- | --- |
| `COMMENT_SALT` | 评论 IP 的加盐哈希密钥，换值会让历史 IP 关联失效 |
| `MODERATION_TOKEN` | 删除评论用的 Bearer 令牌 |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 页面「管理员登录」的账号密码，缺失时登录接口返回 503 |
| `SESSION_SECRET` | 会话 cookie 的 HMAC 签名密钥，缺省退回 `MODERATION_TOKEN`；换值会让已登录会话全部失效 |
| `COMMENT_MIN_INTERVAL_MS` / `COMMENT_PER_HOUR` | 可选 Var，默认 20000 / 8 |

```bash
printf '%s' '<值>' | npx --yes wrangler@4 secret put COMMENT_SALT
printf '%s' '<值>' | npx --yes wrangler@4 secret put MODERATION_TOKEN
printf '%s' '<值>' | npx --yes wrangler@4 secret put ADMIN_USER
printf '%s' '<值>' | npx --yes wrangler@4 secret put ADMIN_PASSWORD
printf '%s' '<值>' | npx --yes wrangler@4 secret put SESSION_SECRET
```

管理员账号与 `SESSION_SECRET` 的值只写在 `credentials.local.md`。生成一组强随机值：`python3 -c "import secrets; print(secrets.token_urlsafe(18)); print(secrets.token_hex(32))"`。

Workers AI 翻译不需要额外 Secret：部署时同一个 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` 即可调用。
## 4. 域名

`tool-hub.xyz` 的自定义域名绑定已存在（Dashboard → Workers & Pages → `tool-hub` → Settings → Custom domains），
DNS 由 Cloudflare 自动维护，不需要手工加记录。`www.tool-hub.xyz` 目前仍指向旧记录，需要在
Dashboard 删除该 DNS 记录后才能加 `www` 绑定（或在 `wrangler.jsonc` 的 `routes` 里补一行
`{ "pattern": "www.tool-hub.xyz", "custom_domain": true }`）。

验证：

```bash
curl -m 10 -sI https://tool-hub.xyz/ | head -1
curl -m 10 -s https://tool-hub.xyz/feed.xml | head -6
curl -m 10 -s https://tool-hub.xyz/llms.txt | head -6
```

## 5. 流水线：采集 → 审查 → 发布

`.github/workflows/daily-digest.yml` 的 cron 为 UTC：

- `30 22 * * *` → 06:30 Asia/Shanghai
- `30 10 * * *` → 18:30 Asia/Shanghai（日内增量补采）

三个 job 串成一条闸门，**审查不通过就不会有发布**：

| Job | 做什么 | 失败后果 |
| --- | --- | --- |
| 采集与去重 | `src/collect.mjs`，回写 `data/`，上传 `digest-data` 产物 | 后续 job 不跑，线上保持上一版 |
| 独立 agent 质量审查 | 取回 data → `scripts/fetch-hidden.mjs` 合并线上下架记录 → `src/review.mjs --apply` → 回写 `data/reviews`、`data/hidden.json` → `src/build.mjs`，上传 `site-dist` | 发布 job 跳过，不发布未过审内容 |
| 发布上线 | 取回 `dist`，`wrangler@4 deploy` | 只影响本次发布 |

首次手动触发：Actions → **每日 AI 日报 → Run workflow**。同一天的多次运行是增量补采，不会覆盖已发布条目。审查 job 复用 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` 调用 Workers AI，不需要额外 Secret。

## 6. 排错

| 现象 | 处理 |
| --- | --- |
| 某些源 `ETIMEDOUT` | 本地加 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://192.168.31.4:7890`；CI 在美国 runner 一般直连即可 |
| 采集日志末尾 `所有信息源均抓取失败` | `collect` 退出码 2，构建步骤被跳过，线上仍是上一版内容 |
| 某天分类为空 | 检查该源是否 429/超时；必要时调大 `config/sources.json` 里该源的 `windowHours` |
| 想临时改条目上限 | `maxItemsPerDay`、`maxItemsPerSource`、`maxAgeDays` |
| 想改首页条目数 | `config/sections.json` 的 `homeLimit`（默认 10），或构建时 `HOME_LIMIT=15 npm run build` |
| 想加/删信息源 | 编辑 `config/sources.json`；JSON API 源需要 `kind: "json"` + `adapter` |
| 部署 401/403 | `CLOUDFLARE_API_TOKEN` 缺少 Workers Scripts/Custom Domains 权限，或 `CLOUDFLARE_ACCOUNT_ID` 不匹配 |
| `wrangler deploy` 报 hostname 冲突 | 该主机名还有手工 DNS 记录（A/CNAME），先在 Dashboard 删除 |
| 发帖返回 `Wrong number of parameter bindings` | D1 查询没走 `.bind(...)`，见 2.1 末尾说明 |
| 发帖返回 429 | 命中同 IP 限流（20 秒间隔 / 每小时 8 条）；蜜罐字段非空也会静默丢弃 |
| 评论数量不显示 | `env.DB` 绑定缺失或表未初始化，`wrangler d1 execute tool-hub --remote --command ".tables"` 检查 |
| 审查 job 红掉 `review <日期>: 不通过` | 看 `data/reviews/<日期>.json` 的 `reasons` 与被拦下的条目；放行条数少于 `minItems`（默认 5）也不通过 |
| 审查或 wrangler 报 `fetch failed` | 本机走 IPv6 到 Cloudflare 不稳：加 `NODE_OPTIONS=--dns-result-order=ipv4first` 重试；审查脚本每批已自动重试一次 |
| Workers AI 报 `No route for that URI` | 该模型在本账号没有路由（如 `@cf/meta/llama-3.3-70b-instruct`）。换 `REVIEW_MODEL`，先用 `POST /accounts/<ACC>/ai/run/<model>` 试跑 |
| 管理员登录一直 429 | 15 分钟内失败 10 次触发限流（`admin_attempts`）；等窗口过去或清掉该 IP 哈希记录 |
| 列表里还在但条目页 410 | 该 slug 在 `hidden_items` 里（管理员下架或审查拦下）；恢复用 `POST /api/items/<slug>/unhide`，或清 `data/hidden.json` 后重新构建 |
| 本地源超时（lcz.me 等） | 本机走代理：`https_proxy=http://192.168.31.4:7890 NODE_USE_ENV_PROXY=1 npm run collect`；`wrangler` 部署同样需要代理 |

## 7. 本地完整演练

```bash
npm run lint && npm test          # 全部离线可跑
npm run collect -- --offline --out=.ci/data
node src/review.mjs --data=.ci/data --allow-no-agent   # 离线也能先跑一遍硬规则闸门
DATA_DIR=.ci/data DIST_DIR=.ci/dist node src/build.mjs
PORT=8088 node scripts/serve.mjs  # 打印 127.0.0.1 与局域网地址
```
