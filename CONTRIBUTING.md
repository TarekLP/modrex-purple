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
| `pnpm checks`            | Run the full CI gate locally       |
| `pnpm generate-licenses` | Regenerate THIRD_PARTY_LICENSES.md |

`pnpm checks` is the one to run before opening a pull request: it runs everything CI does
(formatting, lint, typecheck, tests, and the consistency checks below) in one pass.

## Tech stack

Tauri v2 · React · Tailwind CSS · Lucide · TypeScript

## Before committing

Pre-commit hooks run automatically via Husky:

- **`prettier --check`** - run `pnpm format` to fix formatting failures
- **`eslint`** - run `pnpm lint:fix` to fix lint failures
- **`check-commands`** - see Backend commands below
- **`commitlint`** - enforces the commit message format (see Commit style below)

When a dependency file is staged, the hook also regenerates `THIRD_PARTY_LICENSES.md` and
stages it for you (this takes about 15 seconds). You can run it yourself with
`pnpm generate-licenses`. CI enforces it via the `check-licenses` job, so the build fails
if that file is out of date.

## Backend commands

`src/shared/bindings.ts` is generated from the Rust command registry, not written by hand.
Editing it directly will be overwritten and CI fails if it is stale.

If you add, rename, or change the signature of a `#[tauri::command]`:

1. Register it in `ipc_builder()` in `src-tauri/src/lib.rs`
2. Regenerate the bindings: `cd src-tauri && cargo test` (any test run does it)
3. Call it from `src/renderer/src/api.ts`, which is the only renderer file allowed to
   touch the IPC layer

`pnpm check-commands` enforces all of that: a command registered but never called, called
but never registered, stale bindings, or an `invoke` outside `api.ts` each fail the check.

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`.

## Submitting changes

Open a pull request against `main`. Run `pnpm checks` first, it runs the same gate CI does.

Adding support for a new game or mod loader is mostly a matter of adding an entry to the
relevant registry (`src-tauri/src/commands/games.rs`, `src-tauri/src/commands/loaders.rs`,
and `GAME_SPECS` in `src/shared/types.ts`) rather than editing call sites. See `CLAUDE.md`
for how those fit together before starting.
