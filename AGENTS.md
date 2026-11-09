# Repository Guidelines

`tool-hub.xyz` is currently a greenfield repository: no source files, build config, or commit
history exist yet (`.git/` is empty). The conventions below are the baseline to establish as the
first code lands — verify a command exists before assuming it does.

## Project Structure & Module Organization

- `src/` application source; `public/` static assets (images, fonts, favicons).
- `tests/` mirrors `src/` one-to-one: `src/tools/search.ts` → `tests/tools/search.test.ts`.
- `docs/` user-facing documentation; `scripts/` one-off development and ops utilities.
- Do not commit `.agents/`, `.aws/`, or `.codex/` — they hold local tool and credential config.

## Build, Test, and Development Commands

No tooling is checked in yet. When adding it, keep the standard four and document the chosen
stack in `README.md` in the same commit that introduces it:

```bash
npm install      # install dependencies
npm run dev      # local development server
npm run build    # produce deployable output in dist/
npm test         # run the test suite
npm run lint     # format and static checks
```

## Coding Style & Naming Conventions

- 2-space indentation, LF endings, UTF-8, no trailing whitespace.
- `camelCase` for variables and functions, `PascalCase` for components and classes,
  `kebab-case` for file and directory names.
- Prefer explicit types; avoid `any` and untyped module exports.
- Wire ESLint + Prettier (or the stack equivalent) into `npm run lint` before the first feature PR.

## Testing Guidelines

- Pick the runner native to the chosen stack (Vitest for Vite frontends, `pytest` for Python
  services) and record it here once selected.
- Test files use `*.test.ts` or `test_*.py` under `tests/`.
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
