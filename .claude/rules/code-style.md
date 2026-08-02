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

A comment states a constraint the code cannot show. Default shape: one to four
lines saying the constraint and what breaks without it. Delete comments that
repeat the code.

Write comments as plain prose: full sentences, commas and periods, plain ASCII.
No backticks around identifiers, no semicolons chaining clauses, no arrows, no
dashes as separators, no em dashes. Write save_state, not `save_state`. Markup
reads as noise to contributors viewing raw source.

No history. A comment describes the present code, never the change that
produced it. Words like "previously", "used to", "no longer", "renamed from"
mark commit-message content sitting in the wrong place.

Every durable fact gets exactly one home:

- enforceable: a check script or test, with a one-line comment naming it
- needed when editing this exact code: an inline comment at the site. This is
  the canonical home and the only layer GitHub contributors ever see.
- module map or cross-file wiring: CLAUDE.md and the rules files, which point
  to site comments and never restate them
- rationale for a change: the commit message only

Longer blocks stay reserved for:

- file formats, archive structure, wire protocols
- algorithm provenance and reference implementations (pdmod.rs's Bob Jenkins
  hash port, the .pdmod format header)
- security-sensitive assumptions or path-traversal guards
- major sections in complex files

Doc comments on pub items: one sentence on what, one more for the non-obvious
part when there is one. Not every item needs one.

Do not "clean up" the reserved kinds just because they are comments. Reviewing
existing code against this section is the comment-audit skill's job.

## Final pass

Before reporting completion, run mentally or explicitly:

- `danger-audit` — for the five dangerous patterns
- `deslop` — for general AI-shaped code
- `control-flow` — for branching
- `comment-audit` — for comments
- `ai-review` — for larger diffs
