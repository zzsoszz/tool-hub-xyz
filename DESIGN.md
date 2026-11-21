---
name: tool-hub.xyz
description: AI 折腾日报：每天采集、去重、质量闸门筛选，出一张有名次的榜
world: the-roll
# 下面每个键都对应 public/styles.css 里的一条 --* token（去掉前缀）。
# struct* / mark* / strike 在 :root 里是 var() 别名，这里写成解析后的字面值，与 :root 一致。
# 全站一套骨白纸面：没有页面级的换值。唯一的深色面是报头那条带，它自己取 ink-* 这组值。
# typography 的 fs-* 键对应 :root 的 --fs-*。唯一没进 frontmatter 的 token 是 --board-cols（栅格模板字符串，
# schema 装不下），它写在 Layout 正文与 sidecar 的 extensions.gridTemplates 里。
colors:
  ground: "#f3f3f1"
  ground-2: "#e9e9e6"
  ground-3: "#e0e0dc"
  text: "#14171a"
  text-2: "#474e54"
  text-3: "#5c636a"
  text-strong: "#1d2226"
  line: "#d0d0ca"
  line-soft: "#dcdcd6"
  input: "#fcfcfa"
  code: "#e6e6e2"
  scrim: "rgb(10 12 14 / 93%)"
  scrim-soft: "rgb(10 12 14 / 82%)"
  ink-dim: "#9ba4ac"
  ink-line: "#262d34"
  ink-mark: "#ef7f68"
  column: "#2f6bd4"
  column-ink: "#1c51b0"
  column-lift: "#9dbdf2"
  column-tint: "#e2eaf7"
  column-tint-line: "#bcd0ea"
  column-press: "#14417f"
  rank: "#d8402e"
  rank-ink: "#a8271a"
  rank-lift: "#ef7f68"
  rank-tint: "#f7e5e1"
  rank-tint-line: "#e3c3bb"
  rank-tint-deep: "#f0d2c9"
  strike: "#a8271a"
  struct: "#1c51b0"
  struct-2: "#2f6bd4"
  struct-lift: "#9dbdf2"
  struct-press: "#14417f"
  struct-tint: "#e2eaf7"
  struct-tint-line: "#bcd0ea"
  struct-tint-deep: "#e2eaf7"
  mark: "#a8271a"
  mark-bright: "#d8402e"
  mark-lift: "#ef7f68"
  mark-tint: "#f7e5e1"
  mark-tint-line: "#e3c3bb"
  mark-tint-deep: "#f0d2c9"
  focus-ring: "rgb(28 81 176 / 22%)"
typography:
  display:
    fontFamily: "Archivo, Songti SC, Source Han Serif SC, Noto Serif CJK SC, Source Han Serif CN, Georgia, serif"
    fontWeight: 700
  serif:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Source Han Serif CN, Georgia, Times New Roman, serif"
  sans:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, -apple-system, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
  fs-label:
    fontSize: "12px"
  fs-meta:
    fontSize: "13px"
  fs-ui:
    fontSize: "15px"
  fs-body:
    fontSize: "16.5px"
  fs-reading:
    fontSize: "19px"
  fs-heading:
    fontSize: "23px"
  fs-brand:
    fontSize: "27px"
  fs-lead:
    fontSize: "33px"
  fs-title:
    fontSize: "41px"
  fs-funnel-sm:
    fontSize: "52px"
  fs-funnel:
    fontSize: "66px"
rounded:
  sm: "3px"
  pill: "999px"
spacing:
  wide: "1240px"
  read: "740px"
  rail: "214px"
components:
  masthead:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
    padding: "16px 26px 12px"
  button-primary:
    backgroundColor: "{colors.struct}"
    textColor: "{colors.ground}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.struct-press}"
    textColor: "{colors.ground}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-search-fab:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
  button-lightbox:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.ground}"
    rounded: "0px"
    padding: "6px 14px"
  button-filter-reset:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.mark}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  chip:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "3px 9px"
  chip-tag:
    backgroundColor: "{colors.struct-tint}"
    textColor: "{colors.struct}"
    rounded: "{rounded.sm}"
    padding: "3px 9px"
  chip-sub:
    backgroundColor: "{colors.mark-tint}"
    textColor: "{colors.mark}"
    rounded: "{rounded.sm}"
    padding: "3px 9px"
  chip-current:
    backgroundColor: "{colors.struct}"
    textColor: "{colors.ground}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  origin-new:
    backgroundColor: "{colors.mark-tint}"
    textColor: "{colors.mark}"
    rounded: "{rounded.sm}"
    padding: "2px 7px"
  pager-link:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  panel-filter:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  panel-summary:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text}"
    padding: "14px 16px"
  input-field:
    backgroundColor: "{colors.input}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  select-filter:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
    width: "132px"
  meter-track:
    backgroundColor: "{colors.line}"
    height: "4px"
    width: "76px"
  overlay-scrim:
    backgroundColor: "{colors.scrim}"
---

# 视觉规范：tool-hub.xyz

## Overview

**Creative North Star: "每日榜单（The Daily Roll）"**

这张站 own 的是「每天有一张有名次的榜」：抓到多少、重复多少、被闸门挡掉多少、上榜多少，名次由质量分与可行动度
算出，不是热度。视觉上它把自己按成一份印刷期号：骨白 #f3f3f1 承载全站，只有报头那一条带是墨底（底 `--text`
#14171a，底边 3px 朱红）。中间没有卡片、没有阴影、没有把条目装进盒子。行与行之间只有发丝级分栏线，名次是大号数字，
栏目与度量是榜蓝，名次与门槛是朱红，今天没有内容的信息源被划掉。

全站一套纸面：首页、任意一期与其余阅读页用的是同一组底色和同一组语义名，没有页面级换值。期号页（首页与
/day/<date>）左栏是栏目与期号轨，右栏是名次表；其余页面（栏目、子类、标签、归档、条目、评测、讨论、关于、搜索）
顶部是 sticky 菜单。组件规则只读一组语义名（`--struct*` / `--mark*` / `--ground*`），所以一条规则在全站都到
对比度要求，规则里不区分页面。

**Key Characteristics:**

- 一张有名次的榜，名次数字随名次衰减，读到第 10 行已经缩回正文大小。
- 全站一套纸面与一套组件规则：首页与阅读页没有底色分别。
- 只有两种强调色，颜色即语义：榜蓝是结构与栏目，朱红是名次、门槛与可动手。
- 零阴影、零渐变、零卡片容器。
- 数字一律前导零与 tabular numerals，读者用眼睛比大小。
- 质量闸门是看得见的：量条里的竖线就是 config/filters.json 的门槛值。


## Colors

全站只有两种强调色，用法固定：**榜蓝 = 结构与栏目，朱红 = 名次、门槛与可动手**。中性面是骨白纸一整块，
只有报头那条带是深色。

### Primary（榜蓝）

- **榜蓝**（`--column` #2f6bd4，语义名 `--struct-2`）：只用于线与数字侧的东西——`.roll::after` 那条通高 2px 分栏线、
  键盘焦点的 2px 描边、量条里的填充、榜头与栏目轨 h2、选中态的下划线、期号表窄屏折叠后的栏目轨顶边。
- **榜蓝深**（`--column-ink` #1c51b0，语义名 `--struct`）：所有压在底色上的榜蓝文字——正文链接、栏目标题、
  栏目轨与期号轨里的当前项、条目页「原文」类链接、主按钮底、标签 chip 的文字。对纸面 6.6:1。
  顶部菜单与标签轨的当前项把文字保持 `--text`，只用 2px `--struct` 下划线表态。
- **榜蓝压深**（`--column-press` #14417f，`--struct-press`）：主按钮悬停。悬停是把同一个颜色压深一档（9.0:1），
  不是换成另一个颜色。
- **榜蓝提亮**（`--column-lift` #9dbdf2，`--struct-lift`）：深色面上的同一角色，现在只剩一处——报头墨条上的
  「关于与口径 / 搜索全部文章」（9.9:1）。全站其它榜蓝文字都走深一档。
- **榜蓝浅底**（`--column-tint` #e2eaf7 / `--column-tint-line` #bcd0ea）：标签 chip 的底与边。

### Secondary（朱红）

- **朱红**（`--rank` #d8402e，`--mark-bright`）：只给亮侧——报头底边 3px、榜蓝控件上的朱红边、量条里的门槛竖线、
  实用度量条的填充。它不当文字色用在纸面上（4.0:1 只够大字与控件），文字要朱红就用深一档。
- **朱红深**（`--rank-ink` #a8271a，`--mark` / `--strike`）：纸面上的名次文字、「抓取失败」提示、
  评测与搜索浮层里的「没有命中」提示、搜索悬浮按钮的底、图片放大浮层里放大与缩小按钮的底。
  清空 / 重置这类反向控件平时是 `--ground-2` 底加 `--mark` 文字，只有悬停才换成 `--mark` 底。对纸面 6.4:1。
- **朱红提亮**（`--rank-lift` #ef7f68，`--mark-lift`）：深色面上的同一角色（7.1:1）——图片放大浮层里的来源链接压在
  `--scrim` 上，以及报头墨条里的期号数字：`.masthead` 只在自己的作用域里把 `--mark` 换成 `--ink-mark`（同值），
  所以带上的名次红是提亮档，全站其它 `--mark` 还是 #a8271a。
- **朱红浅底**（`--rank-tint` #f7e5e1 / `--rank-tint-line` #e3c3bb / `--rank-tint-deep` #f0d2c9）：子类 chip、
  「新收」标记、管理条底色、选中与命中高亮（`mark` 元素与 `::selection`）。

### Neutral

- 纸面：`--ground` #f3f3f1 / `--ground-2` #e9e9e6 / `--ground-3` #e0e0dc，输入底 `--input` #fcfcfa，代码底 `--code` #e6e6e2。
  纸面是接近中性的骨白，不往奶油米色那侧偏。
- 报头墨条：底 `--text` #14171a、文字 `--ground` #f3f3f1（16.2:1）、次要 `--ink-dim` #9ba4ac（7.5:1）、
  分隔线 `--ink-line` #262d34、带上的名次红 `--ink-mark` #ef7f68（7.1:1）。这条带是全站唯一的深色面。
- 纸面文字：`--text` #14171a（16.2:1）、`--text-strong` #1d2226（14.4:1）、`--text-2` #474e54（7.6:1）、`--text-3` #5c636a（5.5:1）。
  `--text` 还兼作纸面页报头的底色与 2px 粗分隔线（正文区上方的评论、表格、评测卡顶部都是它）。
- 线：`--line` #d0d0ca 与更轻的 `--line-soft` #dcdcd6。
- 浮层遮罩：`--scrim` rgb(10 12 14 / 93%) 给图片放大层，`--scrim-soft` rgb(10 12 14 / 82%) 给搜索浮层。
  这两个值不随页面材质换，浮层永远是深色。
- 浮层里的文字取 `--ground` 与 `--ground-2`（图片放大层的说明与提示、搜索浮层的空态），压在 `--scrim` 上。
  这是全站唯一一处「文字取底色 token」的地方，它成立的前提是遮罩永远是深色。

### Named Rules

**The Two Accents Rule.** 榜蓝与朱红不许互换角色。把朱红当链接色、把榜蓝当名次色，都是破坏语义：读者靠颜色
区分「这是栏目」与「这是名次」。

**The Bright-Is-for-Lines Rule.** 亮一档（`--column` / `--rank`）只给线、数字与门槛竖线。文字要压在色块上，
底色取深一档（`--struct` / `--mark`）。

**The One-Surface Rule.** 全站一套底色、一组语义名，组件规则不分页。要提亮就在深色那块面的作用域里换那一个名字
（`.masthead` 换 `--mark`），不在页面级别换值。灰字只压在纸面或墨条上，不压在榜蓝或朱红上。

**The Strike-Is-Meaning Rule.** 失败源写在 `src/lib/render.mjs` 渲染的账句里，用 `text-decoration: line-through`
加 `--strike` 划掉（本期实例：`r/LocalLLaMA HTTP 404` 与两个 HTTP 429），含义是「这一格今天没有内容」，
句首的「N 个源本次抓取失败」保持实心朱红。上一版是 45 度 `--hatch` 斜纹，那是墨底上的写法：压在纸面的 13px 字上
糊成一片，读不出被划掉的是哪几个源。改纸面之后划除换成 text-decoration，全站因此没有渐变。

## Typography

- **展示与数字**：`--display`（自托管 Archivo，退到系统衬线），一律 700 字重，带 `font-variant-numeric: lining-nums tabular-nums`。
- **阅读正文**：`--serif`（系统衬线，条目页 `article`）。
- **界面与摘要**：`--sans`（PingFang SC 系列）。
- **代码、日期、SHA、期号轨**：`--mono`。

`h1` 与 `h2` 永远走 `--display` 700，所以列表里的 `story-title`（它是 `h2`）与页面上的所有区块标题都是衬线展示体。

### 自托管字体

`public/fonts/archivo-latin.woff2` 与 `archivo-latin-ext.woff2`（变量字重 600–900）通过两条带 `unicode-range` 的
`@font-face` 提供，排在 `--display` 最前。诚实边界：没有可自托管的中文展示字体，中文标题因此退到系统衬线
（Songti SC / Source Han Serif SC / Noto Serif CJK SC），拉丁与数字走 Archivo。`public/_headers` 把这两个 woff2 与
`/styles.css`、`/favicon.svg`、`/listview.mjs` 一起标成 `max-age=0, must-revalidate`。

### Hierarchy

字号只有十一档，全部是 `public/styles.css` 的 `:root` 里的 `--fs-*`；frontmatter 的 typography 键就是去掉 `--` 前缀的 token 名（`fs-label` … `fs-funnel`），`display` / `serif` / `sans` / `mono` 是字体族角色。每档对应一组用途（以下用途逐条来自构建后的规则）：

| token | 字号 | 实际用途 |
| --- | --- | --- |
| `--fs-label` | 12 | 榜头、栏目轨 h2、`.cell.when` 日期、量条刻度、`.origin`、chip、表单标签、SHA、页脚注 |
| `--fs-meta` | 13 | 页眉脚注、`.cell` 栏目与来源、原文行、`.subtext`、期号轨、页脚、按钮文字类小字、评测表格 |
| `--fs-ui` | 15 | 按钮、输入、下拉、导航项、`.board-thesis` 口径句、`.gate-account` 账句、表格正文、归档条目链接与归档表的期号数字、`.item-raw` 原始摘要折叠 |
| `--fs-body` | 16.5 | `body` 基准、列表摘要、条目页 h2（无衬线 600）、相关与关于 h2、归档行 |
| `--fs-reading` | 19 | 阅读正文 `--serif`（1.9 行高）、榜上默认名次数字、窄屏账条六个数字 |
| `--fs-heading` | 23 | 条目标题、正文 h3/h4、评论与评测 h2、窄屏列表 h2、榜标题、名次 7–10 |
| `--fs-brand` | 27 | 文字标、`.issue`、查找型列表 h2、名次 5–6 |
| `--fs-lead` | 33 | 页眉期号数字、账条六个数字、榜首标题、条目页 h1、条目页名次、窄屏榜首名次、窄屏 `.lede h1`、名次 3–4 |
| `--fs-title` | 41 | 纸面页 h1、榜上前两名名次、窄屏榜首名次 |
| `--fs-funnel-sm` | 52 | 榜首名次 |
| `--fs-funnel` | 66 | 顶档保留：本轮把账条六个数字统一成同一字号之后，样式表里没有规则再用到它 |

名次是一条衰减链：19 → 23 → 27 → 33 → 41 → 52，字距与前两行的下边线粗细（2px）一起收紧，字重全榜恒为 700：
19px 上 800 与 900 分不出来，同一个意思不该同时占字号、字重、颜色三条通道。
相邻档的比例从 1.08（12 到 13）到 1.27（52 到 66）。小字那四档（12 / 13 / 15 / 16.5）靠用途区分而不是靠比例区分，
读物的层级靠 19、23、27、33、41、52 这条约 1.2 倍的链：页面 h1（41）到条目标题（23）到正文（19）。

### Named Rules

**The Eleven Steps Rule.** 字号只取 `--fs-*`。整份样式表里 `font-size` 字面值 0 处，`npm run design:check` 把字面字号当偏离 ramp 报出来。

**The Longhand Rule.** 写 `font-size` / `line-height` / `font-family` 长式，不用 `font:` 简写——detector 读不到藏在简写里的字号。

**The Reading Measure Rule.** 阅读正文行长 ≤ 74ch（`.article` 70ch，摘要与账句 72–76ch）。衬线正文行高 1.9，无衬线 1.75–1.85。

**The Break Rule.** 正文里的不可断长串必须折进阅读列：`.article` 带 `word-break: break-word`，`.story-summary` 与
`.cell.src` 带 `overflow-wrap: anywhere`。上游正文留着原文 markdown 链接与长 URL，不断行会把阅读列撑宽，整页变成横向可滚。

**The Outline Rule.** 大纲不跳级：页面是 h1 > h2 > h3，正文里孤立的深层标题按连续同级一段一起上提到 h3
（`nestArticleHeadings`）。


## Layout

两套宽度决定一条内容列：榜与列表用 `--wide` 1240px，阅读类内容（条目页正文、导读、评论、关于、评测说明）用 `--read` 740px。
`main` 在 1240px 内，内边距 4px 20px 44px。

期号页是 `.roll` 两栏：左 `.rail` 宽 `--rail` 214px（栏目 / 期号轨 / 其他入口，h2 走 `--fs-label`），右 `.board`，
栏间距 28px。那条通高的 2px `--struct-2` 分栏线由 `.roll::after` 画在 `left: var(--rail)`，不是 `.rail` 的边框，
所以线两侧都有吸气空间。期号页没有 sticky `.menu`（它用左边的栏目轨），其余页面保留 `<nav class="menu">`。

榜是六列栅格 `--board-cols`：名次 52px / 标题（`1fr`，`overflow-wrap: break-word`）/ 栏目 74px / 来源 112px /
深度与实用 158px / 发布 56px，列间 16px。行不装盒子，只有 1px `--line` 分栏线，前两行的下边线是 2px。
首页给榜首 10 行（`config/sections.json` 的 `homeLimit`），期号页给这一期全部条目。

查找型列表（栏目 / 子类 / 标签 / 归档，含归档的年页与月页）一页 30 条：`LIST_PAGE_SIZE` 在 `src/lib/render.mjs`，
`paginateItems` 与 `pagerNav` 生成 `.pager`，`src/build.mjs` 的 `writeListPages` 把第 2 页起写成 `dist/<路径>/p/N.html`。
第 1 页沿用原路径，每一页的 canonical 指向自己（本期产物里 65 个 `.*/p/N.html`，例如 `/s/hardware/p/2`、
`/archive/2026-11/p/13`），翻页链接不带查询参数。月份与排序只作用于服务端切出来的那一页，这句话直接写在
`.filter-note` 里；要看整月走年 / 月入口，不让客户端筛选假装还有下一页。`public/list.js` 在筛选后把可见行重排，
名次数字跟着位置重写（`String(index + 1).padStart(2, "0")`），榜号不会还写着服务端那一期的顺序。

列表层的摘要按扫读长度截短：栏目 / 子类 / 标签用 `LOOKUP_SUMMARY_CHARS` 110 字，归档用 `ARCHIVE_SUMMARY_CHARS` 96 字，
窄屏再加一道夹取（`.story-summary` 在 720px 以下夹到三行），全文只在条目页给，RSS 与 `llms.txt` 不截。
列表行的配图坐在正文格内部（见 Story thumb），六列栅格与表头不为它让位，窄屏让位给账本。条目页正文、评测图表与列表缩略图都是 `main img`，全部走 lightbox。

归档是另一条栅格：84px 116px 56px minmax(0,1fr) auto（期号 / 日期 / 条数 / 这期的账 / Markdown）。

窄屏（`@media (max-width: 720px)`）首屏属于列表与榜单：`.head` 表头隐藏，`.roll` 折成一列并且 `.board` 排到
`order: 1`、`.rail` 排到 `order: 2`（分栏线换成 `.rail` 的 2px 顶边，`.roll::after` 关掉），榜折成
`42px minmax(0,1fr) auto auto` 三行（名次与标题一行，栏目 / 来源 / 日期同一行，两条量条跨列到第三行）。
`.lede` 内边距收紧，`.lede h1` 降到 `--fs-lead`，查找型列表 h2 与期号数字降到 `--fs-heading`，账条六个数字（含末位 `is-out`）一起降到 `--fs-reading`，
口径句降到 `--fs-meta`，
榜首名次降到 `--fs-lead` / `--fs-title`，榜首标题降到 `--fs-heading`。`.filters` 压成一行（字段横排、`select` 宽 92px、
说明另起一行），`.tag-nav` 与 `.subnav` 变紧凑，`.story-summary` 行高 1.6 并夹到三行，`.search-fab` 在窄屏不显示（见 Search），期号表折成两行。判据来自 `impeccable` 的
几何探针：390×844 与 1440×900 两档视口下 `documentElement.scrollWidth` 不超过视口宽，第一条条目的标题整行落在列内。

## Elevation & Depth

全站没有投影。整份 `public/styles.css` 里 `box-shadow` / `text-shadow` / `backdrop-filter` 出现 0 次，唯一的渐变是失败源的斜纹。
深度只靠三样东西：纸面与面板底的色差（#f3f3f1 对 #e9e9e6 对 #e0e0dc）、1px `--line` 分隔线、以及加粗的规则线——
报头底边 3px 朱红、榜首两行下边线 2px、`.roll::after` 2px 分栏线、评论区 / 表格 / 评测分组顶部 2px `--text`。
浮层的深度来自遮罩本身（`--scrim` 93% 与 `--scrim-soft` 82% 的不透明深色），不是模糊。

### Named Rules

**The Line-Or-Tone Rule.** 需要区分层级时换底色或加一条线，不加阴影、不加模糊。

## Shapes

圆角只有一档：3px（chip、按钮、输入、下拉、面板、搜索浮层），全站 20 处。`999px` 胶囊只给右下角的搜索悬浮按钮一处（窄屏这一处不出现）。
图片放大浮层里的放大 / 缩小按钮是直角（`border-radius` 未设），因为它压在深色遮罩上，不需要与纸面控件同一形状。
条目行、评论、归档行、量条都是无圆角的行内块，容器不加边框包裹。

全站没有渐变纹理。失败源用 `text-decoration: line-through` 划掉（见 The Strike-Is-Meaning Rule），那是文字装饰，
不是一块面。全站唯一的斜线是量条里门槛竖线两侧那点 1px 刻度。

正文里的宽表格放在 `.table-scroll` 里横向滚动，顶部一条 2px `--text` 起笔，列不折行（`white-space: nowrap`）。
条目页正文里的引用块用 2px `--line` 左边线加斜体，那是上游正文的形状，本站不改写成卡片。


## Components

### Masthead（报头）

全站唯一的深色面：`--text` #14171a 底加 `--ground` 文字，底边 3px `--mark-bright`，内边距 16px 26px 12px
（窄屏 16px 16px 12px）。左侧文字标走 `--fs-brand` 700，域名后缀是 `--mono` 12px 加 0.16em 字距（`--ink-dim`）。
右侧是 `--fs-meta` 的班次与生成时间（`--ink-dim`），链接用 `--struct-lift` 加 1px `--ink-line` 下边线。期号页把文字标
换成 h1：期号数字走 `--fs-lead`，颜色是带上的提亮档 `--ink-mark`（同一个名字 `--mark` 在 `.masthead` 作用域里换值），
班次 / 窗口 / 源成败是它的脚注（`--fs-meta`，`--ink-dim`）。

### Ledger（漏斗账，签名组件）

`.gate` 区里的六个数字格：抓到 / 重复 / 闸门挡掉 / 延续 / 新收 / 本期上榜，`.ledger` 内边距 8px 0 6px。数字全部 `--fs-lead` 700
带 tabular numerals（窄屏六个一起降到 `--fs-reading`），标签 `--fs-label`。末位 `.is-out` 只换颜色（`--mark`），不放大：
六个数字同一字号，结论靠朱红指出，不做「大数字 + 小标签」那种 hero 排版。本期实例是
1,106 / 889 / 91 / 26 / 2 / 25。账条下面只有一行 `.gate-account`（`--fs-ui`，≤72ch）：先写班次与生成时刻，同一行接逐源成败，
不复述六个数字，也不另起第二段——上一版是 `.gate-account` 加 `.gate-fails` 两段，首屏先被两块「账」占掉。失败源是划掉的灰字，句首的「N 个源本次抓取失败」是 `--strike`。
只有「抓到」与「本期上榜」带 `data-count-to`，`public/funnel.js` 把它们一次性数到位（750ms，缓出），
`prefers-reduced-motion: reduce` 与自动化取证环境下直接落终值。全站动效到此为止。

### Board（榜）

`.board h2` 榜标题 `--fs-heading` + `.board-thesis` 口径句 `--fs-ui`（窄屏 `--fs-meta`）+ `.head` 表头（`--fs-label`，字距 0.05em，`--struct`）+ `ol.stories`。
名次 `.rank` 前导零、`--mark`、字号随名次衰减（19 → 23 → 27 → 33 → 41 → 52），字距从 0.02em 收到 0，字重恒为 700。
标题是 `h2.story-title`（`--fs-heading`，榜首第一行 `--fs-lead`，三行以后夹断，全文在条目页与原文链接里），原文标题是 `--fs-meta` 第三行小字。
度量 `.meter` 是数字 + 4px `.track`：数字 `--fs-ui` 700，刻度 `--mono` `--fs-label`，
track 宽 76px、底 `--line`、填充 `--struct-2`（深度）或 `--mark-bright`（实用）。
track 里那条上下各伸出 4px 的竖线是 `--gate-at` 定位的，值直接来自 `config/filters.json` 的质量闸门——
填充越过竖线才算过关。度量数字与竖线因此是同一个门槛的两种写法，不是装饰刻度。
`.origin` 记「新收」（`--mark-tint` 底 + `--mark-tint-line` 边）或「第 N 次上榜」（退成 `--text-3` 无边底）。
榜尾是 `.board-note`：一条写本期有多少条是第一次上榜（数字来自 `src/lib/items.mjs` 的 `isNew` / `issueCount`，模板不自算名次），
一条写同源连发为什么不合并。1440×900 的实测几何：账条 69px、口径句 26px、表头顶 303px，首屏完整榜行 3 条，行高 95–268px（榜首三行 158 / 199 / 129，配图另起一行的那几条 253 / 268 / 235）。

### Story thumb（列表配图）

`.story-thumb` 是列表里的配图：`src/lib/items.mjs` 的 `itemIllustration()` 取正文里第一张像样的图（logo / icon / avatar / badge / emoji 这类小图不算配图），
列表只认站内的本地副本（`itemIllustration(item, { archivedOnly: true })`，地址必须是 `/images/...`）：热链回源站的图在浏览器里带着本站的 referer，防盗链的 host 直接拒掉，搬家或删图的上游更多，实测一栏 15 张外链缩略图里 11 张取不到。条目页正文仍是另一条规则——副本不在就保留外链，构建不联网、也不留下指向不存在文件的图。
坐哪儿由这一行自己有多宽决定：`.story` 是容器（`container-type: inline-size`），行宽够 1132px 才开第二列把配图放到正文右侧
（宽上限 168px、高上限 152px，榜首两行 244px / 208px）；不够就另起一行坐在正文块末尾、左对齐（宽上限 176px、高上限 132px，榜首两行 220px / 168px）。
阈值是探针量出来的：1440 下本期榜行宽 958px（正文格 426px），查找型列表行宽 1200px（正文格 668px）。
正文格不到 600px 还硬塞右侧，正文只剩 240px，一行中文标题被切成十几个字一行——所以窄行让配图占一整行，正文宽度一点不变，代价只是这一行长高一点。
宽和高同时设上限，浏览器按原比例缩，绝不裁掉截图里的内容。没有图的条目不开第二列，
六列账与 `.head` 表头都不为它让位，所以行与行之间的对齐不因为「有没有图」而变，榜也没有因此多出一列空位。
窄屏（≤720px）配图让位：正文格只剩两百多 px，图会把标题挤成一两个词一行，账本优先。
`public/thumbs.js` 是兜底：副本在构建之后被清理时图片取不到，它把整个 `figure` 撤掉，那一行退回纯文字，列表不顶着一块破图、也不空出一栏。
alt 用正文里的 alt；上游只给了文件名（`cover.jpeg`）时退回标题，读屏和放大浮层因此都说得出这张图是什么。
配图没有边框、没有圆角、没有底——它就是纸面上的一张图。点击进 Lightbox（缩放），跳转仍然只在标题链接上。

### Rail（栏目 / 期号 / 其他入口）

`.rail h2` 用 `--fs-label` 600 加 0.05em 字距、`--struct`。`.columns` 每行「栏目名 + 等宽计数」，
计数 `--mono` `--fs-meta`，空栏目的计数用 `--mark`。`.issue-rail` 是 `--mono` `--fs-label` 的期号轨（56px / 1fr / auto 三列），
当前期号 `--struct`。`.rail-links` 收归档、讨论区、搜索、标签、关于（`--fs-ui`，行高 1.9）。

### Pager（查找型列表翻页）

`.pager` 是「上一页 / 第 N 页 / 共 M 页，每页 30 条 / 下一页」。`.pager a` 用 `--ground-2` 底 + 1px `--line` 边 + 2px 下边线 +
3px 圆角 + 6px 12px 内边距，悬停把下边线与文字换成 `--struct`。翻页与 `.subnav` 共用同一个形状：1px 边框加 2px 下边线，
含义是这两处沿一条轴（页码 / 子类）往前走。

### Chips

`.chip` 是 `--ground-2` 底 + 1px `--line` 边 + 3px 圆角 + 3px 9px 内边距 + `--fs-label`。`.chip.tag`（标签）走榜蓝浅底
（`--struct-tint` 底 / `--struct-tint-line` 边 / `--struct` 文字），`.chip.sub`（子类）与「新收」走朱红浅底。
`.day-chips a` 是 `--mono` 的日期入口，当前项换成实心 `--struct` 底加 `--ground` 文字。`.subnav a` 是子类入口，当前项把文字与 2px 下边线换成 `--struct`。

### Buttons

主按钮（发布留言、搜索、清空后的确认）：`--struct` 底、`--ground` 文字、3px 圆角、10px 18px 内边距，
悬停压深到 `--struct-press`，禁用换成 `--line` 底加 `--text-3` 文字。
清空 / 重置这类反向控件：`--ground-2` 底 + `--mark` 文字 + 1px `--line` 边，悬停才翻成 `--mark` 底加 `--ground` 文字。
朱红实心控件只有三处：右下角搜索悬浮按钮（`--mark` 底 + `--mark-bright` 边 + 胶囊 999px + 10px 16px）、
图片放大浮层里的放大与缩小（`--mark` 底 + `--mark-bright` 边 + 直角 + 6px 14px）、上面那个悬停反转。
悬停一律回到既有配色里的另一档，不引入第三种颜色。

### Inputs / Fields

评论输入、搜索输入、评测筛选输入：`--input` 底、1px `--line` 边、3px 圆角、9px 12px 内边距、`--fs-ui`。
聚焦同时给 1px `--struct-2` 边框换色与 2px `--focus-ring` 外描边（#1c51b0 22%，全站一处）。
`.filter-field select`：`--ground` 底、1px `--line` 边、3px 圆角、5px 8px 内边距、`min-width: 132px`（窄屏 92px），
聚焦用 2px `--struct-2` 描边加 1px offset。可动手的含义落在控件本身，不落在容器边上。

### Search（悬浮按钮 + 浮层，签名组件）

`public/search.js` 在每页右下角注入「搜索文章」按钮，点开 `.search-overlay`（`--scrim-soft`）里的 `.search-panel`
（`min(92vw, 720px)`，`--ground` 底、1px `--line` 边、3px 圆角、18px 20px 22px 内边距）。
检索范围包含摘要与正文，索引只来自 `/data/items.json`，查询词写进 `?q=`，`/search` 页共用同一份引擎。
命中词用 `mark` 高亮（`--mark-tint-deep` 底）。这是全站唯一的固定元素。

### Item（条目页）

名次行 `.item-rank` 是 `--fs-lead` 的朱红名次加 `--fs-meta` 的「第 N 期第 M 名，栏目 …，首次上榜」。
`.subtext` 一行放顶、分数、来源、日期 chip、时间、度量与「阅读原文」，`margin-top` 6px。
原文链接写在 `.item-domain`（`--fs-meta`，`--text-3`），里面的 `<code>` 是一块横向滚动区（`white-space: nowrap` 加 `overflow-x: auto`）：
长 URL 不拦腰折断，读者能逐字核对，页面也不横向溢出。正文 `.article` 是 70ch / `--fs-reading` 19px / 行高 1.9 的衬线阅读栏。

### Bench groups（评测分组）

评测首页的分组是 `.bench-group`：顶部一条 2px `--text` 起笔，无填底、无圆角、无阴影，内边距 14px 16px 16px（窄屏 12px 12px 14px），
组间 14px 间隙。标题 `--fs-heading`，采集时间与统计行是 `--bench-group-meta`（`--fs-meta` `--mono` `--text-3`）。
它与榜行共用同一件皮肤（一条规则线加组内的行），这个世界里没有「卡片」这种容器。

### Archive table（期号表）

`ul.archive` 一行一期：`--mono` 期号、日期链接、`issue-count` 条数、`issue-account` 这期的账、`.md-link` Markdown 入口。
窄屏折成两行，期号与条数不换行。归档顶部的年 / 月 chip 与 `.filters` 的月份下拉并存：前者是整月的服务端页面，后者只作用于这一页。

### Lightbox（图片放大，签名组件）

`public/lightbox.js` 把 `main img` 全部接进居中的浮层（`--scrim` 93%）：按钮、滚轮、`+` / `-` / `0`、双击、拖动都走同一个缩放，
40%–600% 之间（`MIN_SCALE` 0.4 / `MAX_SCALE` 6，步进 1.25），1 表示适配窗口。缩放是 transform，不是重排。
包着图片的链接被拦下跳转，跳转留在标题链接与浮层自带的「进入这篇文章」上。底部条是放大 / 缩小按钮、
倍率读数、来源与提示文字（`--fs-meta` / `--fs-label`，`--ground-2` 与 `--mark-lift` 文字）。

### Panels（面板与空状态）

`.filters`：`--ground-2` 底 + 1px `--line` 边 + 3px 圆角 + 10px 12px 内边距。`.item-summary` 与 `.item-lead`：
`--ground-2` 底 + 1px `--line` 边、14px 16px / 14px 18px 内边距、无圆角（它们是版面里的色块，不是控件）。`.empty`：
`--ground-2` 底 + 1px `--line` 虚线边 + 18px 内边距 + `--fs-ui`，文案给下一步。

### Not-found（404）

`dist/404.html` 由 `renderNotFoundPage` 生成，用同一张报头、菜单与页脚：`.lede` 的 h1「这一页不存在」加一句说明，
下一行给今日日报 / 归档 / 搜索三条退路。本地 `scripts/serve.mjs` 命中不到文件时也发这张页（状态码仍是 404），
开发时看见的就是线上会看见的。这里没有榜、没有表头、没有筛选控件——不存在榜的页面不该留一个孤立表头。

## Do's and Don'ts

### Do:

- **Do** 用主动语态写按钮，让按钮说清会发生什么：「发布留言」「订阅 RSS」「搜索文章」。
- **Do** 让本站自己的标签不带 `→` / `↗`：本期 604 个 HTML 里，菜单、按钮、chip、翻页与页脚的标签中这两个字符计数为 0。它们只出现在被引用的条目标题与摘要里（例如 `32K → 256K`），那里写的是上游给出的流程或区间。
- **Do** 把次要信息写成短句，不用 `A · B · C` 串联。
- **Do** 给空状态和失败状态下一步，不给情绪：「这一栏最近没有新内容，换个栏目看看。」
- **Do** 把名次、期号、计数写成前导零加 tabular numerals，让读者用眼睛比大小。
- **Do** 改页面先改 `public/styles.css` 的 `:root`，再改组件。新加的颜色字面量同时进 `DESIGN.md` 的 `colors`。
- **Do** 把新的量条数字与 `--gate-at` 一起给：读者看到的刻度必须能被 `config/filters.json` 复现。
- **Do** 新增动效先回答读者的一个动作，并且尊重 `prefers-reduced-motion`（`reduce` 时直接显示终值）。
- **Do** 让取不到的列表配图整块撤掉（`public/thumbs.js`），行退回纯文字，不给破图留位置。

### Don't:

- **Don't** 用紫蓝渐变、暗底发光、奶油底细衬线这套默认 AI 脸。纸面是中性骨白 `#f3f3f1`。
- **Don't** 给列表配图加边框、圆角、底色或阴影，也不要为它新开一列栅格或留一个空图占位：它只是纸面上的一张图，正文没有图时那一栏宽度就是 0。
- **Don't** 给条目或评论套卡片、加阴影、加圆角盒。行只有分栏线。
- **Don't** 用一侧 3px 色条当强调。含义写进标签或控件。
- **Don't** 在单条规则里手挑颜色或字号。字面 `font-size` 会被 `npm run design:check` 报成偏离 ramp。
- **Don't** 把榜蓝用在名次上、把朱红用在链接上，也不给同一个控件在悬停时换第三种颜色。
- **Don't** 引用上游正文里的英文 buzzword 或破折号密度来定本站的文案口径：那是引用内容，本站的约定在上一条。

### 已知漂移（本次 refresh 记录，未修）

- `--ground-3` #e0e0dc 声明了，但整份样式表 `var(--ground-3)` 用量 0 处。
- `--struct-tint-deep` 在纸面页等于 `--struct-tint`，所以 `.chip.tag:hover` 只有「去掉下划线」，底色没有变深一档；
  `.chip.sub:hover` 有真正的变深（`--rank-tint-deep` 对 `--rank-tint`）。
- `--strike` 与 `--rank-ink` 是同一个 #a8271a 的两个名字，语义（划除 / 实心控件）与色值分离在这里没有区分作用。
- `.filter-field select` 用 `--ground` 作底，没有用 `--input`，所以「输入底」这条 token 对下拉不成立。
- 圆角值（3px 与 999px）写在规则里，`:root` 里没有对应的 token，只有字号做到了全 token 化。
- `npm run design:site` 本轮扫 605 个 HTML，只剩 28 条 advisory：27 处 em-dash 与 12 处 buzzword 短语，全部来自
  引用上游正文的原话，本站不改写。上一轮的 605 条 `repeating-stripes-gradient`（每个页面各一条，来自 `.fail` 的
  斜纹）随斜纹一起消失——斜纹在墨底上读得住，压在纸面的 13px 字上读不住，换 text-decoration 划除之后 low-contrast
  那 20 条也一起没了。

