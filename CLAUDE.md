# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app with HMR (main + renderer dev server)
npm run build        # Production build → out/
npm run preview      # Preview production build
npm run typecheck    # Type-check without emitting
npm run format       # Format all files with prettier
npm run format:check # Check formatting without writing
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
```

Run a single test file:

```bash
npx vitest run src/main/steam.test.ts
```

## Architecture

Electron app with three processes wired by `electron-vite`:

- **`src/main/`** — Node.js main process. All OS-level work lives here: API calls, file system operations, Steam registry reads, mod install/uninstall. No DOM access.
- **`src/preload/`** — Thin bridge. Exposes main-process functions to the renderer via `contextBridge`. Every new IPC handler in `index.ts` must also be exposed here and declared in `src/shared/api.d.ts`.
- **`src/renderer/`** — React + Tailwind UI. Communicates with main exclusively through IPC — never touches the file system or network directly.
- **`src/shared/`** — TypeScript types shared between main and renderer. `api.d.ts` declares the `window.api` surface; `types.ts` owns all domain interfaces.

### Main process modules

- **`api.ts`** — modworkshop REST API calls. `listMods`, `getMod`, `listModFiles`, `getLatestFile`, `listCategories`, `registerDownload`. All public GET endpoints, no auth token needed. Params sent as query string (Node fetch rejects GET with body). `getMod` returns the full mod object including `images`, `banner`, `dependencies`, `instructs_template`, and `tags` — these are optional fields on `Mod` not present in `listMods` results.
- **`steam.ts`** — finds PD3 install path by reading Windows registry (`HKLM\SOFTWARE\WOW6432Node\Valve\Steam`) and scanning `libraryfolders.vdf`.
- **`mods.ts`** — mod file operations. Installs `.pak` files to `{gamePath}/PAYDAY3/Content/Paks/~mods/`, moves to `~mods/disabled/` on disable, removes on uninstall. Tracks state in a JSON file. Pure functions (`addToState`, `removeFromState`, `setEnabled`, `activeModPath`, `disabledModPath`) are exported separately for testing. `reconcileState` checks each state entry against disk on every `getInstalled` call and removes stale entries — but skips reconciliation when `~mods.bak` exists (mods are temporarily hidden, not deleted).
- **`index.ts`** — registers all IPC handlers and caches `resolvedGamePath` at startup. On startup: restores `~mods.bak` → `~mods` if present, then runs `recoverStateIfNeeded` which scans `~mods` for orphaned `.pak` files and rebuilds `installed.json` via API calls if the state is empty. Also exposes `shell:open-external` for opening URLs in the system browser. DevTools toggle is Ctrl+Shift+I, dev builds only. `mods:install` falls back to `getLatestFile(modId)` when `mod.download` is null (some mods have `has_download: true` but a null `download` field). `mods:install-file` accepts explicit `(modId, modName, fileId, downloadUrl, fileType, fileVersion, gamePath)` for installing a specific file from the Downloads tab.

### Renderer components

- **`App.tsx`** — shell with TopBar + Sidebar + view switcher. Owns `installed: InstalledMod[]` as the single source of truth and `refreshInstalled` callback. Manages three views: `'browse'`, `'installed'`, `'detail'`. Browse and Installed are always mounted (CSS `hidden` when inactive) to preserve state across tab switches. The detail view is conditionally rendered (unmounts on navigate away) — it tracks `detailModId` and `prevView` so the back button returns to the originating tab. `openDetail(modId, from)` and `closeDetail()` handle transitions.
- **`components/TopBar.tsx`** — fixed header with the "PD3 Mods" title on the left and game controls on the right. Polls `isGameRunning` every 3s. When `PAYDAY3-Win64-Shipping.exe` is detected: shows a "Stop game" button. Otherwise: shows "Launch modded" and "Launch without mods". "Launch without mods" renames `~mods` → `PAYDAY3/Content/~mods.bak` (one level above `Paks/`) before opening Steam — must be outside `Paks/` because UE5 scans all subdirectories there. Game detection uses `tasklist /FI` — note that Windows truncates process names at 25 chars, so the check is for `PAYDAY3-Win64-Shipping` (not the full `.exe`).
- **`components/Sidebar.tsx`** — nav between Browse and Installed views. Uses its own `NavView = 'browse' | 'installed'` type (not the full `View` from App) so the detail view doesn't leak into it. Has a collapse toggle at the bottom; collapsed state shrinks to `w-12` with single-letter abbreviations for nav items and `title` tooltips on hover.
- **`components/BrowsePage.tsx`** — paginated mod grid with search, category filter, and sort. Receives `installed`, `onRefreshInstalled`, and `onOpenDetail` as props. Calls `onRefreshInstalled` after any install/uninstall/enable/disable.
- **`components/InstalledPage.tsx`** — receives `installed` as a prop; fetches full `Mod` data from the API for each installed mod and renders `ModCard`. Mod metadata is cached in a `useRef<Set<number>>` of already-fetched IDs — a separate `useEffect([installed])` fetches `getMod` only for new IDs, never re-fetching existing ones. Detects updates by comparing `installed.version` vs `mod.version`; shows a banner and modal with per-mod checkboxes + "Update Selected" when updates exist.
- **`components/ModDetailPage.tsx`** — full-page detail view for a single mod. Fetches `getMod` + `listModFiles` in parallel on mount. Four tabs: **Description** (mod.desc + changelog + license, rendered as Markdown), **Images** (grid from `mod.images`, click opens lightbox), **Downloads** (file list from `/mods/{id}/files` — each row has an "Install" button for in-app install and a "Download ↗" button to open in browser; the Install button shows "Installed" in green and is disabled when `installedMod.version` matches the file's version, determined by `file.version || file.label || mod.version`), **Dependencies & Instructions** (`mod.instructs_template.instructions` as Markdown + required/optional dependency cards). Action buttons (Install/Enable/Disable/Remove) live in the sticky top bar. Uses `marked` for Markdown → HTML rendering; rendered HTML is styled by the `.mod-desc` class in `index.css`. Links in rendered Markdown are intercepted and opened via `window.api.openExternal`.
- **`components/ModCard.tsx`** — shared card used by both BrowsePage and InstalledPage. The top section (thumbnail + name + description) is a clickable area that calls `onOpen` to navigate to the detail page. The bottom action row (install/enable/disable/remove buttons) is separate and does not propagate the click.
- **`components/Select.tsx`** — reusable custom dropdown. Use this instead of native `<select>` — native selects render with OS chrome that can't be themed.

### Styling

All colors are defined as semantic tokens in `src/renderer/src/index.css` via Tailwind v4's `@theme` block — never use hardcoded Tailwind color classes like `zinc-*` or `red-*` in components. Token names: `surface`, `surface-raised`, `surface-hover`, `surface-active`, `surface-light`, `border`, `text`, `text-muted`, `text-subtle`, `accent`, `accent-bright`, `danger`, `danger-hover`, `danger-text`, `success`, `success-text`.

The `.mod-desc` CSS class in `index.css` styles HTML generated by `marked` — covers headings, paragraphs, lists, links, code, images, and `<hr>`.

### Key domain facts

- **modworkshop game ID for PD3 is `853`** — hardcoded in `api.ts`.
- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- All mod images (thumbnails, banners, gallery images) share the same URL base: `${THUMBNAIL_BASE_URL}/${file}` where `THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'` (exported from `src/shared/types.ts`). The `banner` field is a wider landscape image; `thumbnail` is the square card image; `images` is the full gallery array (includes both).
- Mod descriptions and installation instructions from the API are **Markdown**, not HTML. Render with `marked`.
- PD3 mods are `.pak` files. Active path: `{gamePath}/PAYDAY3/Content/Paks/~mods/`. Disabled path: `{gamePath}/PAYDAY3/Content/Paks/~mods/disabled/`. The `gamePath` is the Steam library root (`steamapps/common/PAYDAY3`); game content lives one level deeper in the `PAYDAY3/` subdirectory.
- Mod filenames are `{modId}.pak` — the ID encodes the modworkshop mod ID, used by `recoverStateIfNeeded` to re-fetch metadata for orphaned files.
- Anti-cheat (Nebula) is not a concern — mods work online freely.

## Workflow

- Commits must follow conventional commits: `type(scope): subject`
- Keep commits focused — one logical change per commit
- When writing tests + implementation, commit tests first before writing implementation
