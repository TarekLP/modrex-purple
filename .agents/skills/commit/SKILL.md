---
name: commit
description: Propose a conventional commit message for the current diff
---

# commit

Run `git diff HEAD` and `git status`, then propose a commit message.

## Format

Read [`commitlint.config.ts`](../../../commitlint.config.ts) for the enforced format rules. Follow them exactly.

Keep the subject short and imperative. Do not add a body unless the change is genuinely complex.

## Rules

- Propose the message — do not run `git commit` until the user confirms.
- If there are no staged or unstaged changes, say so and stop.
- Never include unrelated files in the same commit — if the diff spans multiple logical changes, say so and ask which to commit first.
