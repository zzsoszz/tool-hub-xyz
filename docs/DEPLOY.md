# 部署手册（GitHub + Cloudflare Pages + tool-hub.xyz）

## 1. 推送代码到 GitHub

```bash
cd ~/code/tool-hub.xyz
gh auth login -h github.com          # 现有 token 失效时重新登录
gh repo create tool-hub-xyz --private --source=. --remote=origin --push
# 或手动：git remote add origin https://github.com/<你的账号>/tool-hub-xyz.git && git push -u origin main
```

## 2. 创建 Cloudflare Pages 项目

Dashboard → **Workers & Pages → Pages → Create a project → Git → 选择 `tool-hub-xyz` 仓库**，然后：

- Production branch: `main`
- Framework preset: **None**
- Build command: *留空*（CI 直接上传 `dist/`）
- Build output directory: `dist`

不想接 Git 集成也可以，CI 用 `cloudflare/pages-action` 直接上传构建产物（本仓库默认走这条路）。本地临时部署可用：

```bash
npx wrangler pages project create tool-hub-xyz --production-branch main
npx wrangler pages deploy dist --project-name tool-hub-xyz
```

## 3. 配置 Secrets 与 Vars

仓库 → Settings → Secrets and variables → Actions：

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare Profile → API Tokens，权限 `Cloudflare Pages: Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Pages 控制台 URL 里的一串 ID |
| `PAGES_PROJECT` | Variable | `tool-hub-xyz`（可省略，默认同名） |
| `TRANSLATE_API_KEY` | Secret | 可选，启用中文摘要 |
| `TRANSLATE_MODEL` | Variable | 可选，默认 `gpt-4o-mini` |

## 4. 绑定 tool-hub.xyz

Pages 项目 → Settings → **Custom domains → Set up a custom domain** → 输入 `tool-hub.xyz`。域名已在 Cloudflare 时 DNS 会自动写入，无需手工加记录；`www` 用 **Redirect 规则**（Workers & Pages → 域重定向）指向 `tool-hub.xyz`。

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
| Pages 部署 401 | `CLOUDFLARE_API_TOKEN` 权限不足或 `CLOUDFLARE_ACCOUNT_ID` 不匹配 |

## 7. 本地完整演练

```bash
npm run lint && npm test          # 全部离线可跑
npm run collect -- --offline --out=.ci/data
DATA_DIR=.ci/data DIST_DIR=.ci/dist node src/build.mjs
PORT=8088 node scripts/serve.mjs  # 打印 127.0.0.1 与局域网地址
```
