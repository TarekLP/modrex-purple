---
name: deslop
description: Remove AI-generated code slop
---

# deslop

Check the diff against main and remove all AI-generated slop introduced in this branch.

This includes:

- Comments that explain WHAT the code does rather than WHY — remove them; well-named identifiers already do the explaining
- Multi-line comment blocks or docstrings — one short line max, or delete entirely
- Unnecessary defensive checks, fallbacks, or validation for scenarios that can't happen (trust internal code and framework guarantees)
- Extra try/catch blocks that are abnormal for that area of the codebase
- Casts to `any` to work around type issues — fix the types instead
- Hardcoded Tailwind color classes like `zinc-*`, `red-*`, `gray-*` — use semantic tokens (`surface`, `text`, `accent`, `danger`, `border`, etc.) defined in `src/renderer/src/index.css`
- Bare `ReactMarkdown` usage — must go through `components/MarkdownContent.tsx`
- Native `<select>` elements — must use `components/Select.tsx`
- Bare string literals in JSX — must use `t('key')` from `../i18n`
- Direct `window.api.getMod` or `window.api.listModFiles` calls in the renderer — use `getCachedMod` / `getCachedModFiles` from `modCache.ts`
- Premature abstractions or helper functions added beyond what the task required
- Features, error handling, or validation added speculatively for hypothetical future use
- Backwards-compatibility shims, renamed `_unused` vars, or `// removed` comments for deleted code

End with a 1–3 sentence summary of what you changed.
