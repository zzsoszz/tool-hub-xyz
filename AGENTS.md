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
