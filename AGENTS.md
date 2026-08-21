# Agents

Read `CLAUDE.md` — it is the canonical source of architecture, conventions, and domain knowledge for this project.

Then read `AI_DANGER_PATTERNS.md` — it defines the five patterns that are dangerous enough to block any change.

AI-assisted work is allowed, but raw AI-shaped code is not.

Translation is separate work. When a task needs localized strings, edit only
`apps/desktop/src/renderer/src/i18n/en.json` unless the user explicitly requests translation
for named locales. Never create, update, synchronize, or backfill a non-English locale during
another task. See `CLAUDE.md` for the canonical translation ownership policy.

Whenever you add or change keys in `en.json`, run `pnpm i18n:fill de` afterward so the new
keys land as marked English fallbacks in `de.json` instead of being silently untranslated.

## Top priority

Before finishing any code change, check the five dangerous AI patterns:

1. Silent catch / silent fallback
2. Generic helpers replacing game-specific logic
3. Defensive checks that hide broken invariants
4. Deep `if`/`else` nesting
5. Fake abstractions / speculative future-proofing

These are blocker-level because they can hide bugs or break Modrex-specific behavior.

## Skills

Reusable agent skills live in `.agents/skills/`. Load the relevant skill before executing it.

| Skill | File | Description |
| --- | --- | --- |
| danger-audit | [.agents/skills/danger-audit/SKILL.md](.agents/skills/danger-audit/SKILL.md) | Audit a diff for the five dangerous AI patterns |
| deslop | [.agents/skills/deslop/SKILL.md](.agents/skills/deslop/SKILL.md) | Remove AI-generated code slop from a diff, path, branch, or repository |
| control-flow | [.agents/skills/control-flow/SKILL.md](.agents/skills/control-flow/SKILL.md) | Flatten nested conditionals and make the happy path readable |
| comment-audit | [.agents/skills/comment-audit/SKILL.md](.agents/skills/comment-audit/SKILL.md) | Remove useless comments and keep only human-useful context |
| ai-review | [.agents/skills/ai-review/SKILL.md](.agents/skills/ai-review/SKILL.md) | Review a diff for AI-shaped code before a PR or commit |
| commit | [.agents/skills/commit/SKILL.md](.agents/skills/commit/SKILL.md) | Propose a conventional commit message for the current diff |
| changelog | [.agents/skills/changelog/SKILL.md](.agents/skills/changelog/SKILL.md) | Add user-facing entries to CHANGELOG.md's Unreleased section |

## When to use skills

Use `danger-audit` before finishing any non-trivial AI-assisted code change.

Use `control-flow` when a change touches validation, branching, installation logic, filesystem routing, renderer event handlers, or any function with nested conditionals.

Use `comment-audit` after AI-assisted edits, large refactors, or any change that adds comments.

Use `deslop` before finishing any AI-assisted change.

Use `ai-review` before proposing a PR, commit, or final summary for a non-trivial code change.



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
