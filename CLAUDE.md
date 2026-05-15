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
- **`download.ts`** — downloads a file to a temp path (`tmpdir()/pd3-mod-{uuid}.{ext}`). Accepts an optional `onProgress(downloaded, total)` callback; uses a `Transform` stream to count bytes as they arrive. `total` comes from `content-length` and is `0` if the server omits it — callers should handle the indeterminate case.
- **`steam.ts`** — finds PD3 install path by reading Windows registry (`HKLM\SOFTWARE\WOW6432Node\Valve\Steam`) and scanning `libraryfolders.vdf`. Also exports `findSteamPath()` which returns the Steam install directory (used to resolve `steam.exe` for direct process launch).
- **`settings.ts`** — reads/writes `settings.json` in `app.getPath('userData')`. Fields: `gamePath?` (manual override), `launchOptions?` (extra CLI args for PD3), `skipFileOpenLogWarning?` (suppress the `-fileopenlog` reminder), `dismissedDepsWarnings?` (array of mod IDs whose missing-deps warning has been permanently dismissed).
- **`mods.ts`** — mod file operations. Installs `.pak` files to `{gamePath}/PAYDAY3/Content/Paks/~mods/`, moves to `~mods/disabled/` on disable, removes on uninstall. Tracks state in a JSON file. Pure functions (`addToState`, `removeFromState`, `setEnabled`, `activeModPath`, `disabledModPath`) are exported separately for testing. `reconcileState` checks each state entry against disk on every `getInstalled` call and removes stale entries — but skips reconciliation when `~mods.bak` exists (mods are temporarily hidden, not deleted). `findUntrackedPaks(gamePath, knownFilenames)` scans `~mods/` and `~mods/disabled/` for `.pak` files whose filenames are not in `knownFilenames`; returns early when `~mods.bak` exists.
- **`index.ts`** — registers all IPC handlers and caches `resolvedGamePath` at startup. On startup: restores `~mods.bak` → `~mods` if present. Also exposes `shell:open-external` for opening URLs in the system browser. DevTools toggle is Ctrl+Shift+I, dev builds only. `mods:install` falls back to `getLatestFile(modId)` when `mod.download` is null (some mods have `has_download: true` but a null `download` field). `mods:install-file` accepts explicit `(modId, modName, fileId, downloadUrl, fileType, fileVersion, gamePath)` for installing a specific file from the Downloads tab. `mods:get-installed` is async — after reconciling state it calls `findUntrackedPaks`, resolves numeric filenames via `getMod` (modworkshop metadata), assigns non-numeric filenames a deterministic negative ID via `hashFilename` (`-Math.abs(h) || -1`) with the stem as name and version `'unknown'`, then persists and returns the merged state. Untracked mods are absorbed into state on first detection and not re-processed on subsequent calls. `launchGame(launchOptions)` is a shared helper: when launch options are set and `steam.exe` is found it spawns `steam.exe -applaunch 1272080 {args}` (detached, avoids Steam's URI confirmation dialog); otherwise falls back to `steam://rungameid/1272080`. `settings:dismiss-deps-warning` appends a mod ID to `dismissedDepsWarnings` (deduped).

### Renderer components

- **`App.tsx`** — shell with TopBar + Sidebar + view switcher. Owns `installed: InstalledMod[]` as the single source of truth and `refreshInstalled` callback. Manages four views: `'browse'`, `'installed'`, `'settings'`, `'detail'`. Browse, Installed, and Settings are always mounted (CSS `hidden` when inactive) to preserve state across tab switches. The detail view is conditionally rendered (unmounts on navigate away) — it tracks `detailModId` and `prevView` so the back button returns to the originating tab. `openDetail(modId, from)` and `closeDetail()` handle transitions.
- **`components/TopBar.tsx`** — fixed header with the "PD3 Mods" title on the left and game controls on the right. Polls `isGameRunning` every 3s. When `PAYDAY3-Win64-Shipping.exe` is detected: shows a "Stop game" button. Otherwise: shows "Launch modded" and "Launch without mods". "Launch without mods" renames `~mods` → `PAYDAY3/Content/~mods.bak` (one level above `Paks/`) before opening Steam — must be outside `Paks/` because UE5 scans all subdirectories there. Game detection uses `tasklist /FI` — note that Windows truncates process names at 25 chars, so the check is for `PAYDAY3-Win64-Shipping` (not the full `.exe`). "Launch modded" calls `getSettings()` first: if `-fileopenlog` is absent and `skipFileOpenLogWarning` is not set, a custom styled warning modal appears with a "Don't show again" checkbox — checking it saves `skipFileOpenLogWarning: true` to settings.
- **`components/Sidebar.tsx`** — nav between Browse, Installed, and Settings views. Uses its own `NavView = 'browse' | 'installed' | 'settings'` type (not the full `View` from App) so the detail view doesn't leak into it. Has a collapse toggle at the bottom; collapsed state shrinks to `w-12` showing only the nav icon with a `title` tooltip on hover.
- **`components/SettingsPage.tsx`** — two sections: **Game Path** (shows detected/manual path, Browse button opens native folder picker, Reset returns to auto-detect) and **Launch Options** (monospace text input, auto-saves 500ms after typing via debounced `useEffect`; skips the initial save using a `launchOptionsLoaded` ref). Describes `-fileopenlog` as required for mods.
- **`components/BrowsePage.tsx`** — paginated mod grid with search, category filter, and sort. Receives `installed`, `onRefreshInstalled`, and `onOpenDetail` as props. Calls `onRefreshInstalled` after any install/uninstall/enable/disable. On Install click: fetches full mod via `getMod` (to access `dependencies`/`instructs_template`), checks for missing required deps, and shows `DepsWarningModal` if any exist and haven't been dismissed — only if the session/persistent dismiss flags are clear.
- **`components/InstalledPage.tsx`** — receives `installed` as a prop; fetches full `Mod` data from the API for each installed mod and renders `ModCard`. Mod metadata is cached in a `useRef<Set<number>>` of already-fetched IDs — a separate `useEffect([installed])` fetches `getMod` only for new IDs, never re-fetching existing ones. Failed fetches (e.g. negative IDs for non-modworkshop mods) are tracked in `failedIds` state so those cards still render using `syntheticMod(ins)` — a minimal `Mod` built from `InstalledMod` fields with no thumbnail, `user: { name: 'Unknown' }`, and `has_download: false`. `onOpen` is a no-op for synthetic mods (no detail page). Detects updates by comparing `installed.version` vs `mod.version`; shows a banner and modal with per-mod checkboxes + "Update Selected" when updates exist.
- **`components/ModDetailPage.tsx`** — full-page detail view for a single mod. Fetches `getMod` + `listModFiles` in parallel on mount. Four tabs: **Description** (mod.desc + changelog + license, rendered as Markdown), **Images** (grid from `mod.images`, click opens lightbox), **Downloads** (file list from `/mods/{id}/files` — each row has an "Install" button for in-app install and a "Download ↗" button to open in browser; the Install button shows "Installed" in green and is disabled when `installedMod.version` matches the file's version, determined by `file.version || file.label || mod.version`), **Dependencies & Instructions** (`mod.instructs_template.instructions` as Markdown + required/optional dependency cards with inline Install buttons). Action buttons (Install/Enable/Disable/Remove) live in the sticky top bar. On Install click: checks for missing required deps and shows `DepsWarningModal` if any exist and haven't been dismissed (session via `sessionStorage`, permanent via `dismissedDepsWarnings` setting) — bails out without installing until the user acknowledges. Subscribes to `window.api.onDownloadProgress` to show a thin progress bar below the top bar and update button labels with percentage during download; auto-clears 800ms after the last event. Uses `marked` for Markdown → HTML rendering; rendered HTML is styled by the `.mod-desc` class in `index.css`. Links in rendered Markdown are intercepted and opened via `window.api.openExternal`.
- **`components/DepsWarningModal.tsx`** — shared modal that lists missing required dependencies with per-dep Install buttons. Props: `modId`, `missingRequired`, `gamePath`, `onRefreshInstalled`, `onClose` (X button — temporary dismiss), `onGotIt(permanent: boolean)` (caller handles session + optional persistent dismiss). Auto-closes when `missingRequired.length` reaches 0 (all deps installed). Internal state: `dontShowAgain` checkbox, `installingDeps` map. Used by both `BrowsePage` and `ModDetailPage`. Checkbox uses `div onClick` + `pointer-events-none` on the `<input>` to avoid the implicit `<label>` click-area overlap problem.
- **`components/ModCard.tsx`** — shared card used by both BrowsePage and InstalledPage. The top section (thumbnail + name + description) is a clickable area that calls `onOpen` to navigate to the detail page. The bottom action row (install/enable/disable/remove buttons) is separate and does not propagate the click. Subscribes to `onDownloadProgress` internally; renders a thin progress bar along the bottom edge and shows percentage in the Install button label when `loading === true` (the parent sets `loading` only for the card currently being installed, so other cards receive the events but don't render the bar).
- **`components/Select.tsx`** — reusable custom dropdown. Use this instead of native `<select>` — native selects render with OS chrome that can't be themed.

### Styling

All colors are defined as semantic tokens in `src/renderer/src/index.css` via Tailwind v4's `@theme` block — never use hardcoded Tailwind color classes like `zinc-*` or `red-*` in components. Token names: `surface`, `surface-raised`, `surface-hover`, `surface-active`, `surface-light`, `border`, `text`, `text-muted`, `text-subtle`, `accent`, `accent-bright`, `danger`, `danger-hover`, `danger-text`, `success`, `success-text`.

Icons use `lucide-react`. Import individual icons by name — do not use a barrel import.

The `.mod-desc` CSS class in `index.css` styles HTML generated by `marked` — covers headings, paragraphs, lists, links, code, images, and `<hr>`.

### Key domain facts

- **modworkshop game ID for PD3 is `853`** — hardcoded in `api.ts`.
- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- All mod images (thumbnails, banners, gallery images) share the same URL base: `${THUMBNAIL_BASE_URL}/${file}` where `THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'` (exported from `src/shared/types.ts`). The `banner` field is a wider landscape image; `thumbnail` is the square card image; `images` is the full gallery array (includes both).
- Mod descriptions and installation instructions from the API are **Markdown**, not HTML. Render with `marked`.
- PD3 mods are `.pak` files. Active path: `{gamePath}/PAYDAY3/Content/Paks/~mods/`. Disabled path: `{gamePath}/PAYDAY3/Content/Paks/~mods/disabled/`. The `gamePath` is the Steam library root (`steamapps/common/PAYDAY3`); game content lives one level deeper in the `PAYDAY3/` subdirectory.
- Mods installed via the app use `pakFilename(modName)` to derive the filename — sanitizes the mod name (collapse non-word chars to `_`, strip leading/trailing underscores, append `.pak`), e.g. `CSA-39_Assault_Rifle.pak`. On update the existing filename is preserved so the file is overwritten in-place. Manually placed mods may have any filename; non-numeric filenames are tracked with a synthetic negative ID and cannot be re-resolved via the API.
- Anti-cheat (Nebula) is not a concern — mods work online freely.

## Testing

Tests live in `src/main/` only — the renderer has no tests. Vitest runs in a Node environment (no DOM). All test files match `src/**/*.test.ts`.

## Workflow

- Commits must follow conventional commits: `type(scope): subject` — enforced by commitlint (the hook rejects non-conforming messages)
- Keep commits focused — one logical change per commit
- When writing tests + implementation, commit tests first before writing implementation
