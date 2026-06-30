# Contributing to Modrex

Thanks for taking the time to contribute! Every bug report, suggestion, and pull request helps make Modrex better for the whole community.

## Development setup

| Command                  | Description                        |
| ------------------------ | ---------------------------------- |
| `pnpm install`           | Install dependencies               |
| `pnpm dev`               | Start with hot reload              |
| `pnpm build`             | Production build                   |
| `pnpm typecheck`         | Type-check renderer                |
| `pnpm format`            | Format all files with Prettier     |
| `pnpm lint`              | Lint renderer source               |
| `pnpm test`              | Run all tests (Rust + renderer)    |
| `pnpm generate-licenses` | Regenerate THIRD_PARTY_LICENSES.md |

## Tech stack

Tauri v2 · React · Tailwind CSS · Lucide · TypeScript

## Before committing

Pre-commit hooks run automatically via Husky:

- **`prettier --check`** - run `pnpm format` to fix formatting failures
- **`eslint`** - run `pnpm lint:fix` to fix lint failures
- **`commitlint`** - enforces the commit message format (see Commit style below)

If you add or update any dependencies, regenerate the third-party license file before committing:

```
pnpm generate-licenses
```

CI enforces this via the `check-licenses` job, the build will fail if `THIRD_PARTY_LICENSES.md` is out of date.

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`.

## Submitting changes

Open a pull request against `main`. CI runs formatting, linting, type-checking, and tests, ensure they all pass locally before pushing.
