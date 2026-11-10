# Repository Guidelines

`tool-hub.xyz` is a zero-dependency Node.js 22 (ESM) static site: `src/` collects and builds,
`public/` holds the only client assets, `data/` keeps the digests, and Cloudflare Workers serves
`dist/` plus the `/api/*` forum. Verify a command exists before assuming it does.

## Project Structure & Module Organization

- `src/` application source; `public/` static assets (images, fonts, favicons).
- `tests/` mirrors `src/` one-to-one: `src/tools/search.ts` → `tests/tools/search.test.ts`.
- `docs/` user-facing documentation; `scripts/` one-off development and ops utilities.
- Do not commit `.agents/`, `.aws/`, or `.codex/` — they hold local tool and credential config.

## Build, Test, and Development Commands

There are no third-party dependencies, so `npm install` is not needed.

```bash
npm run collect    # fetch sources into data/digests/<date>.json
npm run build      # render dist/ from data/
npm run dev        # collect + build, then serve 0.0.0.0:8088
npm run review     # pre-publish quality gate: hard rules + a second model review (writes data/reviews/)
npm test           # node --test: unit tests + offline end-to-end pipeline
npm run lint       # syntax, indentation, trailing whitespace, secret scan
```

## Coding Style & Naming Conventions

- 2-space indentation, LF endings, UTF-8, no trailing whitespace.
- `camelCase` for variables and functions, `PascalCase` for components and classes,
  `kebab-case` for file and directory names.
- Prefer explicit types; avoid `any` and untyped module exports.
- Wire ESLint + Prettier (or the stack equivalent) into `npm run lint` before the first feature PR.

## Testing Guidelines

- Runner is Node's built-in `node:test`; keep it offline — fixtures live in `tests/fixtures/`.
- Test files are `*.test.mjs` under `tests/`, mirroring `src/`.
- Name tests after behavior, e.g. `returnsEmptyResultsForBlankQuery()`.
- Every new code path gets at least one unit test; bug fixes begin with a failing regression test.

## Commit & Pull Request Guidelines

- No history to mine, so adopt Conventional Commits: `feat: add tool index page`,
  `fix(search): guard missing API key`, `docs: clarify deploy steps`.
- Imperative mood, subject ≤ 72 characters, one concern per commit.
- Pull requests need what changed and why, linked issues where applicable, and screenshots for UI
  changes. Lint and tests must pass before requesting review.

## Security & Configuration Tips

- Read secrets from environment variables; commit only `.env.example` placeholders.
- Treat `.aws/` as sensitive — never paste keys into issues, PRs, or logs.

## Agent-Specific Instructions

- Follow this file for every change in this repository.
- Use `rg` for searches, keep edits surgical, and do not reformat files you did not change.
- New conventions should be written back into this file in the same commit that adopts them.

## Visual & Styling Rules

- The design tokens (color, type scale, layout) live in `public/styles.css` `:root` and are
  documented in `docs/DESIGN.md`. Change a page by editing the tokens, not by hand-picking a
  colour in one rule.
- Green (`--pine`) means structure, amber (`--signal`) means actionable. Those two colours keep
  their meaning everywhere.
- Copy stays plain and active: link text carries no `→`/`↗`, secondary metadata is a sentence,
  not `A · B · C`.
- Motion is capped at the homepage funnel count-up (`public/funnel.js`); anything new must
  respect `prefers-reduced-motion` and answer a user action.

## Bench Data Rules

- Benchmark numbers live only in `data/bench/<id>.json` (written by `src/bench.mjs`); Chinese
  table headers, conclusions, reproduction steps and source lists live only in
  `config/bench.json`. `src/lib/render.mjs` must never invent a number.
- A cell counts as data only when the whole cell is a pure number series such as
  `1,428 / 2,454 / 2,785`. Anything with prose, ranges or several configs goes to the
  "其余报告" list: numbers and units stay verbatim, the wording turns Chinese through the
  label maps in `src/lib/bench.mjs`, applied as whole sentences before single words.
- Every conclusion and every table row links back to the exact revision it came from
  (`https://github.com/<owner>/<repo>/blob/<commit>/...`), and each page prints the commit,
  per-file SHA-256 and byte counts plus a downloadable `/bench/<id>.json`.
- Conclusions state the measurement condition (same machine, same prompts, same engine) and
  never extrapolate across machines; caveats about upstream draft protocols stay on the page.
- Images zoom through `public/lightbox.js`: every `main img` opens the centred overlay, and the
  click cancels the wrapping link — a list thumbnail zooms instead of navigating, because
  navigation stays on the title link plus the overlay's own 进入这篇文章 link.
- Zoom is a single level (`1` means fit) shared by buttons, wheel, `+`/`-`/`0`, double-click and
  drag-to-pan, clamped to 40%–600% so an image can never vanish; it is a transform, not a relayout.
- Bench tables filter through `public/bench.js`: the box is server-rendered inside `.bench-data`,
  every table group carries `data-bench-table`, and the query stays in `?q=` so a filtered
  view is a shareable link.
- Article search runs through `public/search.js`, and `/data/items.json` is its only index:
  `itemsIndex` must keep `summary` and `text` next to the titles, otherwise "search the
  articles" degenerates into searching headlines. The floating button and the `/search` page
  share that one engine and the query stays in `?q=`.

## Backfilling Past Days

- `node src/collect.mjs --date=<day> --since=<ISO> --until=<ISO>` collects exactly one day:
  an explicit window never falls back to older items and never writes `data/seen.json`, because
  the blanket "seen" marks would make every later day's items read as duplicates.
- `npm run backfill -- --days=7 --reseed-seen` rebuilds `seen.json` from the published digests
  before the loop and drops a day that ends up empty, so the archive never lists a blank day.

## Asset Caching

- Every asset an HTML page links must revalidate: `public/_headers` keeps `/styles.css`,
  `/favicon.svg` and `/listview.mjs` at `max-age=0, must-revalidate`, and Cloudflare serves the
  unlisted `public/*.js` the same way. Long `max-age` belongs only to URLs that change together
  with their content — a day-cached stylesheet renders the lightbox as a block at the page
  bottom instead of a centred overlay.
