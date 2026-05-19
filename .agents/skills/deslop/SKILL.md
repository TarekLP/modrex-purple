---
name: deslop
description: Remove AI-generated code slop
---

# deslop

## Mode

Determine the target based on the argument passed:

- **No argument** — scan the full codebase (`src/`)
- **Path argument** (e.g. `src/renderer/`) — scan that path only
- **`--diff`** — scan only the diff of the current branch against main (`git diff main...HEAD`)

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

## Project-specific violations

- **Hardcoded Tailwind color classes** (`zinc-*`, `red-*`, `gray-*`, etc.) — use semantic tokens (`surface`, `text`, `accent`, `danger`, `border`, …) from `src/renderer/src/index.css`. Exception: hex equivalents inside `createDragImage` in `InstalledPage.tsx` only.
- **Bare `ReactMarkdown`** — must go through `components/MarkdownContent.tsx`.
- **Native `<select>`** — must use `components/Select.tsx`.
- **Bare string literals in JSX** — must use `t('key')` from `../i18n`.
- **Direct `window.api.getMod` or `window.api.listModFiles` in the renderer** — use `getCachedMod` / `getCachedModFiles` from `modCache.ts`.
- **New IPC channels missing from any of the three required files** — every channel must appear in `src/main/index.ts` (handler), `src/preload/index.ts` (bridge), and `src/shared/api.d.ts` (type).
- **Stray `console.log`/`console.warn` added for debugging** — `logger.ts` overrides console globally; debug logs added mid-task should be removed before committing.
