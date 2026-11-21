---
name: tool-hub.xyz
description: AI 前沿资讯日报：每天两次自动采集、质量闸门筛选、中文静态站
colors:
  paper: "#eef1ec"
  paper-2: "#e5eae4"
  ink: "#16231f"
  ink-2: "#4d605a"
  ink-3: "#576561"
  ink-strong: "#2c3b35"
  rule: "#ccd6cf"
  rule-soft: "#dde4dc"
  pine: "#0e5c48"
  pine-deep: "#0a4437"
  pine-tint: "#e2ece6"
  pine-line: "#bfd6cb"
  pine-tint-deep: "#d6e6dd"
  signal: "#d99a21"
  signal-ink: "#4a3303"
  signal-soft: "#f4ead2"
  signal-line: "#ddc793"
  signal-tint: "#f6e8cc"
  signal-tint-line: "#e2c996"
  signal-tint-deep: "#efdcba"
  warn: "#8f4a2f"
  field: "#fbfdf9"
  code: "#f6f8f4"
  scrim: "rgb(12 22 20 / 92%)"
  scrim-soft: "rgb(12 22 20 / 82%)"
typography:
  brand:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.32
  lead-title:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.28
  heading:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.4
  reading:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "17px"
    lineHeight: 1.9
  body:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "15.5px"
    lineHeight: 1.85
  ui:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  meta:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
  label:
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: 1.5
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    lineHeight: 1.65
  funnel:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
  funnel-sm:
    fontFamily: "Songti SC, Source Han Serif SC, Noto Serif CJK SC, Georgia, serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
rounded:
  sm: "3px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "26px"
components:
  masthead:
    backgroundColor: "{colors.pine}"
    textColor: "{colors.paper}"
    padding: "18px 24px"
  button-primary:
    backgroundColor: "{colors.pine}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  panel:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  chip:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "3px 9px"
---

# 视觉规范：tool-hub.xyz

## Overview

一份读起来像报纸的 AI 日报：冷调纸面、松绿结构、信号黄可实操。单栏左对齐，标题用衬线，界面用无衬线。
改页面先改 `public/styles.css` 的 `:root` token，不在单条规则里另挑颜色。

## Colors

整站只有两种强调色，用法固定：**松绿 = 结构，信号黄 = 可实操**；黄色不做装饰。

### Primary

`--pine` `#0e5c48` / `--pine-deep` `#0a4437`：报头、链接、深度量条、主按钮、焦点描边。

### Secondary

`--signal` `#d99a21`：「实用」量条、报头底边 3px、当前栏目 2px 下划线、放大与缩放按钮。
`--signal-ink` `#4a3303`：信号黄与信号黄浅底上的文字（对 `--signal` 对比 4.9:1，达到 WCAG AA）。
`--signal-soft` `#f4ead2` 与 `--signal-line` `#ddc793`：管理态提示条的底与边。

### Tertiary

`--warn` `#8f4a2f`：只用于「抓取失败」这类故障提示。

### Neutral

`--paper` `#eef1ec` / `--paper-2` `#e5eae4`：页面底色 / 面板底色，冷调，不用奶油米色。
`--ink` `#16231f`：正文、标题、条目页分隔粗线。`--ink-2` `#4d605a`：次要文字、榜号、未选中菜单。
`--ink-3` `#576561`：时间、度量、说明性小字（对纸面 5.4:1）。
`--rule` `#ccd6cf` / `--rule-soft` `#dde4dc`：分隔线与细边。

### Named Rules

- 文字压在色块上时先算对比度，正文最低 4.5:1，大字 3:1。
- 灰字只压在纸面或面板底上，不压在松绿或信号黄上。

## Typography

- 标题、榜号、漏斗数字、条目页正文：`--serif`，`font-variant-numeric: lining-nums tabular-nums`。
- 界面与摘要：`--sans`。代码：`--mono`。

### Hierarchy

字号只有十一档，全部是 `public/styles.css` `:root` 里的 `--fs-*`，每档对应一个用途：

| token | 字号 | 用途 |
| --- | --- | --- |
| `--fs-label` | 12 | 表单标签、提示、chips、榜号脚注、SHA |
| `--fs-meta` | 13 | 时间、度量、域名的、页脚、说明性小字 |
| `--fs-ui` | 14 | 按钮、输入、表格正文、导航项、相关文章 |
| `--fs-body` | 15.5 | 界面正文：摘要、归档条目、导语段 |
| `--fs-reading` | 17 | 阅读正文：条目页 `article`、量条数字 |
| `--fs-heading` | 19 | 区块标题、条目标题、窄屏头名 |
| `--fs-brand` | 22 | 文字标、榜号、漏斗箭头 |
| `--fs-lead` | 26 | 头名标题 |
| `--fs-title` | 28 | 页面 `h1`（日报页与条目页同一个字号） |
| `--fs-funnel-sm` | 34 | 窄屏漏斗数字 |
| `--fs-funnel` | 44 | 漏斗数字 |

层级靠用途区分，不靠临时加半个像素：相邻用途不低于 1.15:1，相邻层级（页面 `h1` → 条目标题 → 正文）不低于 1.35:1。

### Named Rules

- 字号只取 `--fs-*`，不在规则里写死 `px`：`npm run design:check` 会把字面字号当偏离 ramp 报出来。
- 正文行长 ≤ 74ch；衬线正文行高 1.9，无衬线 1.75–1.85。
- 正文里的不可断长串必须折进阅读列：`.article` 带 `word-break: break-word`。上游正文里留着原文 markdown 链接与长 URL（一条 400 字符的串就有 4 处），不断行会把 663px 的列撑到 1256px，整页变成横向可滚。
- 大纲不跳级：页面是 `h1 > h2 > h3`，正文里孤立的深层标题按连续同级一段一起上提到 `h3`（见 `nestArticleHeadings`）。
- 不用全大写眉标。

## Layout

- 单栏、左对齐。列表宽度 `--wide` 960px，阅读类内容（条目页、关于、讨论）限制在 `--read` 740px。
- 条目列表是三列栅格：榜号轨 30px / 正文 / 缩略图轨 116px（头名 168px）。窄屏缩略图移到正文下方。
- 报头是整幅松绿色带，底边 3px 信号黄；菜单贴在报头下方，当前栏目用 2px 信号黄下划线表示，不用胶囊。
- 卡片不套卡片：一层面板底 `--paper-2` 就到底。

## Elevation & Depth

全站不用投影。深度只靠三样东西：纸面与面板底的色差、`--rule` 分隔线、条目页表格上方 2px `--ink` 粗线。

### Named Rules

- 需要区分层级时换底色或加一条线，不加阴影、不加模糊。

## Shapes

圆角只有一档：`3px`（`--rule` 边、面板、按钮、输入）；胶囊只给搜索悬浮按钮（`999px`）。
正文里的宽表格放在 `.table-scroll` 里横向滚动，表格上方的 2px 粗线与表头之间留 12px 吸气空间。

## Components

### Buttons

主按钮：`--pine` 底、纸面文字、3px 圆角、`10px 18px`。信号黄按钮（放大、缩放、重置筛选）：`--signal` 底、`--signal-ink` 文字。

### Chips

栏目、子类、标签、日期用 `.chip`：`--paper-2` 底、`--ink-2` 文字、3px 圆角。

### Cards / Containers

`.panel` / `.filters` / `.gate-why` / `.item-summary`：`--paper-2` 底 + 必要时 1px `--rule` 边，不用一侧加粗的色条做强调。

### Inputs / Fields

`.filter-field select`：纸面底、1px `--rule` 边、3px 圆角；聚焦用 2px `--signal` 描边（可实操的含义落在控件上，不在容器边上）。

### Navigation

报头文字标 + 菜单 + 栏目下划线；右下角悬浮搜索按钮是唯一的固定元素。

### Signature Component

`.meter` 质量量条：数字 + 54px 刻度，刻度里的竖线（`--gate-at`）就是 `config/filters.json` 的质量闸门。
条超过竖线才算过关，读者能看出「这条离门槛多远」。深度用松绿，实用用信号黄。

## Do's and Don'ts

### Do:

- 主动语态，按钮说清会发生什么：「发布留言」「订阅 RSS」。
- 链接文字不加 `→`、`↗`；`→` 只用于漏斗里「抓取 → 入选」这类真实数据流向。
- 次要信息写成短句，不用 `A · B · C` 串联。
- 空状态和失败状态给下一步，不给情绪：「这一栏最近没有新内容，换个栏目看看。」
- 新动效先回答读者的某个动作，并且尊重 `prefers-reduced-motion`。

### Don't:

- 不做紫蓝渐变、暗底发光、奶油底细衬线这套默认 AI 脸。
- 不用一侧 3px 色条 + 圆角盒（`side-tab`）当强调；含义写进标签或控件。
- 不在单条规则里手挑颜色，先加 token。
- 全站唯一的动效是首页漏斗读数一次性数到位（`public/funnel.js`）；`prefers-reduced-motion: reduce` 时直接显示终值。
