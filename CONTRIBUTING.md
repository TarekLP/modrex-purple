# Contributing to Modrex

Thanks for taking the time to contribute! Every bug report, suggestion, and pull request helps make Modrex better for the whole community.

## Development setup

| Command                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `pnpm install`           | Install dependencies                            |
| `pnpm dev`               | Start with hot reload                           |
| `pnpm build`             | Production build                                |
| `pnpm typecheck`         | Type-check renderer                             |
| `pnpm format`            | Format all files with Prettier                  |
| `pnpm lint`              | Lint renderer source                            |
| `pnpm test`              | Run all tests (Rust + renderer)                 |
| `pnpm checks`            | Run the full CI gate locally                    |
| `pnpm generate-licenses` | Regenerate apps/desktop/THIRD_PARTY_LICENSES.md |

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

When a desktop dependency file is staged, the hook also regenerates
`apps/desktop/THIRD_PARTY_LICENSES.md` and
stages it for you (this takes about 15 seconds). You can run it yourself with
`pnpm generate-licenses`. CI enforces it via the `check-licenses` job, so the build fails
if that file is out of date.

## Backend commands

`apps/desktop/src/shared/bindings.ts` is generated from the Rust command registry, not
written by hand.
Editing it directly will be overwritten and CI fails if it is stale.

If you add, rename, or change the signature of a `#[tauri::command]`:

1. Register it in `ipc_builder()` in `apps/desktop/src-tauri/src/lib.rs`
2. Regenerate the bindings: `cd apps/desktop/src-tauri && cargo test` (any test run does it)
3. Call it from `apps/desktop/src/renderer/src/api.ts`, which is the only renderer file allowed to
   touch the IPC layer

`pnpm check-commands` enforces all of that: a command registered but never called, called
but never registered, stale bindings, or an `invoke` outside `api.ts` each fail the check.

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`.

## Submitting changes

Open a pull request against `main`. Run `pnpm checks` first, it runs the same gate CI does.

Adding support for a new game, mod loader, or mod source is mostly a matter of adding an
entry to the relevant registry rather than editing call sites:

| What you're adding | Registry                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Game               | `apps/desktop/src-tauri/src/commands/games.rs` + `GAME_SPECS` in `apps/desktop/src/shared/types.ts` |
| Mod loader         | `apps/desktop/src-tauri/src/commands/loaders.rs`                                                    |
| Mod source         | `apps/desktop/src-tauri/src/commands/sources.rs`                                                    |

Neither side of a cross-language pair can see the other, so `pnpm check-games` and
`pnpm check-sources` diff them in CI. See `CLAUDE.md` for how they fit together before
starting.

## Adding a language

The desktop app's interface strings live in `apps/desktop/src/renderer/src/i18n/en.json`.
Translating them into another language is **one new file — nothing else to register or wire up**:

1. Copy `en.json` to a new file in the same folder, named after the language's code, e.g.
   `uk.json`, `de.json`, `pt-BR.json`.
2. Translate the values only — never change the keys, and never remove or reorder them.
3. Leave every `{name}`, `{count}`, etc. token exactly as written; just place it wherever it reads
   naturally in the sentence.
4. There's no plural-forms system — a few strings come in manual pairs for singular/plural
   (`modCount` / `modCountSingle`, `updatesAvailable` / `updatesAvailableSingle`, `installed` /
   `installedSingle`). Translate both halves of each pair.
5. Run `pnpm check-i18n` (from `apps/desktop/`, or `pnpm --dir apps/desktop check-i18n` from the
   repo root). It fails on any key your file is missing, any extra key it shouldn't have, or a
   `{var}` token that doesn't match `en.json` — fix everything it reports before opening the PR.
   This also runs automatically in pre-commit and CI.

When opening the pull request, use the "New language" template
(`?template=new_language.md` on the compare/PR-create URL, or pick it from the template
dropdown GitHub shows above the PR description box).
