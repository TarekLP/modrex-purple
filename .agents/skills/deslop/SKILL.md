---
name: deslop
description: Remove AI-generated code slop
---

# deslop

## Mode

Determine the target based on the argument passed:

- **No argument** — scan uncommitted changes only (`git diff HEAD`)
- **Path argument** (e.g. `src/renderer/`) — scan that path only
- **`--diff`** — scan the diff of the current branch against main (`git diff main...HEAD`)
- **`--all`** — scan the full codebase (`src/`)

Fix each issue you find, then report a 1–3 sentence summary of what you changed.

## Generic AI slop

- **Comments explaining WHAT** — remove them; well-named identifiers already do the explaining. One short WHY-comment max per block, only when the reason is non-obvious.
- **Defensive checks and fallbacks** for scenarios that can't happen — trust internal code and framework guarantees; only validate at system boundaries.
- **Extra try/catch blocks** that are abnormal for that area of the codebase.
- **Casts to `any`** to work around type issues — fix the types instead.
- **Premature abstractions** — helper functions or extra layers added beyond what the task required.
- **Speculative features** — error handling, validation, or flags added for hypothetical future use.
- **Backwards-compatibility cruft** — renamed `_unused` vars, `// removed` comments, re-exported types for deleted code.
- **Unnecessary `useCallback`/`useMemo`** added speculatively without a measured performance reason.
- **Non-standard symbols in comments or strings** — no `→`, `←`, `⇒`, `✓`, `✗`, or other Unicode arrows/symbols. Use plain words: "becomes", "to", "returns", "yes", "no", etc.

## Project-specific violations

- **Hardcoded Tailwind color classes** (`zinc-*`, `red-*`, `gray-*`, etc.) — use semantic tokens (`surface`, `text`, `accent`, `danger`, `border`, …) from `src/renderer/src/index.css`. Exception: CSS custom properties inside `createDragImage` in `useDragDrop.ts` only.
- **Bare `ReactMarkdown`** — must go through `components/MarkdownContent.tsx`.
- **Native `<select>`** — must use `components/Select.tsx`.
- **Bare string literals in JSX** — must use `t('key')` from `../i18n`.
- **Direct `api.getMod`, `api.listModFiles`, or `api.listModLinks` calls in renderer components** — use `getCachedMod` / `getCachedModFiles` / `getCachedModLinks` from `modCache.ts`. Direct `api.getThumbnail` calls — use `getLocalThumbnail` / `getCachedThumbnailUrl` from `thumbnailCache.ts`.
- **New Tauri commands missing from any of the three required places** — every command must appear in `src-tauri/src/commands/*.rs` (implementation), registered in `src-tauri/src/lib.rs` inside `tauri::generate_handler![...]`, and wrapped in `src/renderer/src/api.ts` (the only place `invoke` is called).
- **Stray `console.log`/`console.warn` added for debugging** — remove before committing; there is no global console override in the renderer.
