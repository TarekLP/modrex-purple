---
name: comment-audit
description: Remove useless comments and keep only human-useful context
---

# comment-audit

Use this skill after AI-assisted edits, large refactors, or any change that adds comments.

This skill handles cosmetic AI slop. It is lower priority than the five dangerous patterns in `AI_DANGER_PATTERNS.md`.

## Delete comments that explain what

Delete comments that narrate code.

Bad:

```ts
// Get enabled mods
const enabledMods = mods.filter((mod) => mod.enabled)
```

Bad:

```ts
// Loop through files
for (const file of files) {
  installFile(file)
}
```

Bad:

```rust
// Return Ok result
Ok(result)
```

## Keep comments that explain why

Keep or improve comments that explain:

- ModWorkshop API quirks
- archive format quirks or structure
- game-specific loader behavior
- filesystem layout invariants
- state migration reasons
- path traversal or security constraints
- compatibility decisions
- cleanup or rollback rules
- user-visible behavior that future edits must preserve
- reference implementations
- algorithm provenance
- section headers in long or domain-heavy files
- public function behavior
- test scenario intent

Good:

```ts
// ModWorkshop can return duplicate files for archived mod versions,
// so dedupe by download URL before writing to disk.
const uniqueFiles = dedupeByUrl(files)
```

Good:

```rust
// Use remove_dir, not remove_dir_all, so a failed backup restore
// cannot silently delete user mods.
fs::remove_dir(path)?;
```

## Preserve structural comments

Do not delete comments that act as section headers or file-level orientation.

Examples to keep:

```rust
// Reference implementation: https://github.com/HW12Dev/PDModExtractor (MIT)
```

```rust
// .pdmod is a password-protected ZIP containing pdmod.json (ItemQueue manifest)
// plus the replacement asset files. BundlePath and BundleExtension are hashes;
// the hashlist maps them back to game-relative asset paths.
```

```rust
// Bob Jenkins lookup8 hash — direct port of hash.cpp from PDModExtractor.
```

These preserve domain knowledge and make complex files safer to edit. Do not "clean up" structural comments just because they are comments.

## No placeholder comments

Remove:

- `// TODO` without a concrete issue or next step
- `// FIXME` without a reason
- `// old`, `// removed`, `// legacy` when the code already shows it
- commented-out code
- comments explaining a previous failed attempt

## Procedure

1. Scan added and modified comments first.
2. Delete comments that repeat code.
3. Shorten comments that are useful but bloated.
4. Keep comments that explain real project constraints.
5. If a comment compensates for unclear code, improve the name or structure instead.

## Report

Report how many comment blocks were removed or rewritten and mention any important comments kept.
