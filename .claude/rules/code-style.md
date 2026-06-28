# Code style rule

Apply this rule to all code edits.

For detailed examples, read `AI_DANGER_PATTERNS.md`.

## Blocker-level AI patterns

Do not leave these in any change:

1. Silent catch / silent fallback
2. Generic helpers replacing game-specific logic
3. Defensive checks that hide broken invariants
4. Deep `if`/`else` nesting
5. Fake abstractions / speculative future-proofing

## Silent catch / fallback

Do not hide failures with empty values.

Do not catch errors unless you can add context, recover, or show useful feedback.

## Domain-specific logic

Do not replace game-specific, loader-specific, store-specific, or archive-specific behavior
with generic helpers unless all invariants are preserved.

## Invariants

Validate at boundaries. Do not add defensive checks inside trusted code paths.

## Control flow

Keep the happy path flat. Use guard clauses for invalid or unsupported cases.

Do not use `else` after `return`, `throw`, `continue`, or `break`.

## Abstractions

Do not add managers, factories, adapters, options, flags, or modes for hypothetical future use.

Extract helpers only for real duplication, real domain names, or real boundaries.

## Comments

Delete comments that repeat the code. Comments must explain WHY, not WHAT.

Keep structural comments and section headers that explain:

- file formats, archive structure, algorithm provenance
- reference implementations (e.g. `pdmod.rs`'s Bob Jenkins hash port, `.pdmod` format header)
- security-sensitive assumptions or path-traversal guards
- major sections in complex files

Do not "clean up" structural comments just because they are comments.

## Final pass

Before reporting completion, run mentally or explicitly:

- `danger-audit` — for the five dangerous patterns
- `deslop` — for general AI-shaped code
- `control-flow` — for branching
- `comment-audit` — for comments
- `ai-review` — for larger diffs
