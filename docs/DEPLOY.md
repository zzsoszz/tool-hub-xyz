# 部署手册（GitHub + Cloudflare Workers 静态资源 + tool-hub.xyz）

## 1. 推送代码到 GitHub

```bash
cd ~/code/tool-hub.xyz
gh auth login -h github.com          # 现有 token 失效时重新登录
gh repo create tool-hub-xyz --private --source=. --remote=origin --push
# 或手动：git remote add origin https://github.com/<你的账号>/tool-hub-xyz.git && git push -u origin main
```

## 2. 部署目标：Worker `tool-hub`（静态资源）

`tool-hub.xyz` 已绑定到账户里的 **assets-only Worker `tool-hub`**，站点就是它的静态资源，没有 Worker 脚本。
仓库根目录的 `wrangler.jsonc` 描述了这个目标：

```jsonc
{
  "name": "tool-hub",
  "assets": { "directory": "./dist" },
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

## 3. 配置 Secrets 与 Vars

仓库 → Settings → Secrets and variables → Actions：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare Profile → API Tokens，权限 `Workers Scripts: Edit` + `Workers Custom Domains: Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare 账户 ID（Dashboard 右上角） |
| `TRANSLATE_API_KEY` | Secret | 可选，启用中文摘要 |
| `TRANSLATE_MODEL` | Variable | 可选，默认 `gpt-4o-mini` |

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

## 5. 触发定时采集

`.github/workflows/daily-digest.yml` 的 cron 为 UTC：

- `30 22 * * *` → 06:30 Asia/Shanghai
- `30 10 * * *` → 18:30 Asia/Shanghai（日内增量补采）

首次手动触发：Actions → **每日 AI 日报 → Run workflow**。同一天的多次运行是增量补采，不会覆盖已发布条目。

## 6. 排错

| 现象 | 处理 |
| --- | --- |
| 某些源 `ETIMEDOUT` | 本地加 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://192.168.31.4:7890`；CI 在美国 runner 一般直连即可 |
| 采集日志末尾 `所有信息源均抓取失败` | `collect` 退出码 2，构建步骤被跳过，线上仍是上一版内容 |
| 某天分类为空 | 检查该源是否 429/超时；必要时调大 `config/sources.json` 里该源的 `windowHours` |
| 想临时改条目上限 | `maxItemsPerDay`、`maxItemsPerSource`、`maxAgeDays` |
| 想加/删信息源 | 编辑 `config/sources.json`；JSON API 源需要 `kind: "json"` + `adapter` |
| 部署 401/403 | `CLOUDFLARE_API_TOKEN` 缺少 Workers Scripts/Custom Domains 权限，或 `CLOUDFLARE_ACCOUNT_ID` 不匹配 |
| `wrangler deploy` 报 hostname 冲突 | 该主机名还有手工 DNS 记录（A/CNAME），先在 Dashboard 删除 |

## 7. 本地完整演练

```bash
npm run lint && npm test          # 全部离线可跑
npm run collect -- --offline --out=.ci/data
DATA_DIR=.ci/data DIST_DIR=.ci/dist node src/build.mjs
PORT=8088 node scripts/serve.mjs  # 打印 127.0.0.1 与局域网地址
```
