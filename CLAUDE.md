# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start Electron app with HMR (main + renderer dev server)
pnpm build        # Production build → out/
pnpm dist         # Package for all platforms → dist/
pnpm dist:win     # Package Windows NSIS installer
pnpm dist:linux   # Package Linux AppImage + .deb + .rpm
pnpm preview      # Preview production build
pnpm typecheck    # Type-check without emitting
pnpm format       # Format all files with prettier
pnpm format:check # Check formatting without writing
pnpm test         # Run tests once
pnpm test:watch   # Run tests in watch mode
```

Run a single test file:

```bash
pnpm vitest run src/main/launchers/index.test.ts
```

## Architecture

Electron app with three processes wired by `electron-vite`:

- **`src/main/`** — Node.js main process. All OS-level work lives here: API calls, file system operations, Steam path detection, mod install/uninstall. No DOM access.
- **`src/preload/`** — Thin bridge. Exposes main-process functions to the renderer via `contextBridge`. Every new IPC handler in `index.ts` must also be exposed here and declared in `src/shared/api.d.ts`.
- **`src/renderer/`** — React + Tailwind UI. Communicates with main exclusively through IPC — never touches the file system or network directly.
- **`src/shared/`** — TypeScript types shared between main and renderer. `api.d.ts` declares the `window.api` surface; `types.ts` owns all domain interfaces.

### IPC contract

Every IPC channel must appear in all three places: `src/main/index.ts` (handler), `src/preload/index.ts` (bridge exposure), and `src/shared/api.d.ts` (type declaration). Missing any one of these breaks the channel silently at the type level.

### Main process modules

- **`api.ts`** — modworkshop REST API. Params sent as query string (Node fetch rejects GET with body). `getMod` returns extra fields (`images`, `banner`, `dependencies`, `instructs_template`, `tags`) absent from `listMods` results.
- **`download.ts`** — downloads to `tmpdir()/pd3-mod-{uuid}.{ext}`. `total` is `0` when the server omits `content-length` — callers must handle the indeterminate case.
- **`launchers/`** — multi-launcher abstraction. Two interfaces in `types.ts`: `GameDef` (pure data — IDs, folder names, executable path) and `LauncherDef` (code — `isInstalled`, `findGame`, `identifyPath`, `launch`). `launchers/games/pd3.ts` is the only `GameDef`; `launchers/index.ts` exports `LAUNCHERS` array, `autoDetect(game)`, `identifyLauncher(gamePath)`, and `launchGame(game, launcher, gamePath, opts)`. Steam: Windows reads registry for install path, walks `libraryfolders.vdf`; Linux checks `STEAM_DIR`, `XDG_DATA_HOME`, `~/.local/share/Steam`, `~/.steam/steam`, Snap, and Flatpak. Epic: reads `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` JSON files, matches `DisplayName`. Xbox: checks `{drive}:\XboxGames\{game.name}\{game.executable}` across drives C–G. Marker files for `identifyPath`: `steam_appid.txt`, `.egstore/`, `MicrosoftGame.config`. To add a new launcher: create a file, export a `LauncherDef`, add it to the `LAUNCHERS` array in `index.ts`.
- **`settings.ts`** — reads/writes `settings.json` in `app.getPath('userData')`. Fields: `gamePath?`, `launcher?`, `launchOptions?`, `skipFileOpenLogWarning?`, `dismissedDepsWarnings?`.
- **`logger.ts`** — configures `electron-log` at import time: overrides `console` globally so all `console.log/warn/error` calls write to both the terminal and the log file. Log file lives at `%APPDATA%\pd3-mod-manager\logs\main.log` (Windows) or `~/.config/pd3-mod-manager/logs/main.log` (Linux). `getLogPath()` returns the active log file path — used by the `app:open-log` handler to open it via `shell.openPath`.
- **`mod-index.ts`** — SHA256-based mod identification against the `pd3-mod-index` database. `ensureIndex()` downloads `index.db` from the [`pd3-mod-index` GitHub Release](https://github.com/ShulhaOleh/pd3-mod-index/releases/tag/latest-index) to `userData`, cached with a 1-hour TTL — called fire-and-forget at startup. `lookupSha256(sha256)` is **async** — returns `{ modRemoteId, modName, fileRemoteId, version }` or `null`. `lookupByName(name)` searches the `mods` table with `LIKE %name%` and returns the remote mod ID only when exactly one mod matches — used as a fallback when SHA lookup fails (e.g. user has a different file version than what was indexed). Uses `sql.js` (pure WASM SQLite, no native module) so there are no Electron ABI issues; the WASM binary is declared in `electron-builder.yml` under `asarUnpack` so it's accessible outside the asar in packaged builds. `SQL` and `db` are module-level singletons initialized on first call.
- **`mods.ts`** — `reconcileState` and `findUntrackedPaks` are **async** (use `fsp`); install/uninstall/enable/disable/reorder remain sync. `reconcileState` marks missing files with `missing: true` rather than dropping them. When `~mods.bak` exists it skips disk checks and reads state from `{gamePath}/PAYDAY3/Content/~mods.bak/.pd3mm.json` — not from `statePath` — because the whole `~mods` directory (including the state file) was renamed there. Before the missing-file check it migrates legacy disabled mods from `disabled/foo.pak` → `disabled/foo.pak.disabled`. State is only written when missing flags actually change. After the missing-file check it drops folder entries whose directory no longer exists in either the active or disabled tree (e.g. manually renamed on disk) — child folders of a phantom parent are also removed in the same pass because `getFolderPath` propagates the stale path. `disabledModPath` appends `.disabled` to the canonical `.pak` filename — all operations go through this helper so the extension is handled in one place. `installMod` preserves existing priority when updating a mod, assigns `Math.max(sibling-mod max, sibling-folder max) + 1` for new ones — counts both mods and folders so a new install never gets a priority that conflicts with an existing sibling folder. Existing-entry lookup falls back to `m.id === mod.id` when uid doesn't match — this handles mod updates where the upstream file gets a new `file.id` (new uid) while the mod's remote ID stays the same; without the fallback the old entry would remain in state alongside the new one. `getFolderPath(folders, folderId)` is **exported and recursive** — builds the full slash-separated path relative to `~mods/` by walking the `parentId` chain (e.g. `001_weapons/002_rifles`); all path construction goes through this helper. `findUntrackedPaks` scans recursively via inner `scanActive`/`scanDisabled` functions (the `_folders` parameter is unused but kept for API compat). `reorderChildren(gamePath, statePath, parentId, items)` replaces the former `reorderTopLevel` — works at any depth, `parentId=null` means root. `moveFolder(gamePath, statePath, folderId, targetParentId)` — includes cycle detection, renames disk dirs in both active and disabled trees, sets `diskName` to `max+1` priority in the target parent. `createFolder` takes `parentId: string | null = null`; priority is scoped to siblings within the same parent. The disk name is `{priority}_{displayName}` with only filesystem-invalid characters (`\ / : * ? " < > |`) stripped — spaces and casing are preserved as-is. `renameFolder` updates both `displayName` and `diskName` in state and renames the directory on disk (both active and disabled trees). `deleteFolder` moves direct child mods AND direct child folders to `folder.parentId` (not root).
- **`index.ts`** — caches `resolvedGamePath` at startup. The `mods:get-installed` handler runs a multi-stage identification pipeline every time the renderer requests the installed list: (1) **Upgrade synthetic mods** — any mod with `id < 0` has its SHA256 computed (or reused from state), looked up in the index by SHA256 then by name as fallback, and if matched, replaced with the real mod ID/name/fileId via `getMod`; upgraded state is written back to disk. (2) **Find untracked paks** — `findUntrackedPaks` returns `.pak`/`.pak.disabled` files not tracked in state as slash-separated relative paths; each is SHA256-hashed with `Promise.allSettled` (failures get `null` sha256). (3) **Auto-create folder entries** — for each untracked path with multiple segments, the handler walks every path prefix and creates missing `ModFolder` entries with correct `parentId` chains so deeply-nested manually-placed mods are adopted without losing their folder structure. (4) **Reconcile by SHA256** — if a hash matches an already-tracked mod (e.g. mod was manually moved), the tracked entry's filename/enabled is updated rather than creating a duplicate. (5) **Identify truly untracked** — for files still unaccounted for: try SHA256 index lookup → if no match try name lookup via `lookupByName(stripped filename)` → if no match and filename is a bare number try `getMod(numId)` → otherwise assign a synthetic negative ID via `hashFilename` and use the stripped filename as name. Final state including new entries is written to disk. On startup: restores `~mods.bak` → `~mods` if present; migrates `userData/installed.json` → `getStatePath(resolvedGamePath)` if the old file exists and the new one doesn't. `checkForUpdates` is called via `win.webContents.once('did-finish-load', ...)` — not immediately after `createWindow()` — to ensure the renderer has mounted its listener before the IPC event fires. It is also exposed as `updater:check` so the renderer can trigger a manual check (Settings page). `getUpdateStrategy()` returns `'auto'` for Windows and AppImage, `'deb'`/`'rpm'` by detecting `/usr/bin/dpkg` or `/usr/bin/rpm`, `'browser'` otherwise. Launch delegates to `registryLaunchGame(PD3, resolvedLauncher, resolvedGamePath, launchOptions)` from `launchers/index.ts`; Steam launcher spawns `steam.exe -applaunch 1272080 ...opts` when launch options are set (avoids the URI confirmation dialog), otherwise falls back to `steam://rungameid/1272080`.

### Companion repo: pd3-mod-index

`https://github.com/ShulhaOleh/pd3-mod-index` — separate repo that builds and hosts `index.db`. A GitHub Actions workflow runs hourly: downloads the current `index.db` from the `latest-index` release, runs `build-index.ts` (resumes from existing state), and uploads the updated DB back to the release clobbering the previous file. The indexer fetches all PD3 mods from modworkshop, downloads each `.pak`, streams it through SHA256, and writes `(sha256, modRemoteId, modName, fileRemoteId, version)` rows into SQLite. Schema is multi-game (`games → sources → mods → files`) so other games can be added without structural changes.

### Renderer architecture

**Loading screen**: `installedReady` starts `false` and flips to `true` after the first `getInstalled` response. An absolute overlay (icon + spinner) covers the app until then. On the main process side, `BrowserWindow` is created with `show: false` and `backgroundColor: '#0a0a0a'` — the window appears only on `ready-to-show`, eliminating the white flash before the renderer loads.

**`App.tsx`** owns `installed`, `gamePath`, and `modsHidden` as the single sources of truth. On every window focus event, both `refreshGamePath` and `refreshInstalled` run (500ms debounce) — this keeps state current if the user remounts a disk partition or changes files externally.

**View rendering strategy**: `BrowsePage` is conditionally rendered (unmounts on tab switch, mounts fresh each visit). `InstalledPage` and `SettingsPage` are CSS-`hidden` when inactive — preserving their internal state (drag order, scroll position) across tab switches. `ModDetailPage` instances for the dep-chain stack are all mounted simultaneously; only the top is visible.

**Update flow**: `App` holds `update` state and `showUpdateModal`. The modal opens automatically when `onUpdateAvailable` fires. During download and when ready, `TopBar` handles the UI (progress bar / restart button) — `App` passes only `{ phase, percent }` down. For `'manual'` strategy, after `shell.openPath` opens the installer the modal reopens at `phase: 'available'` so the user can retry.

**`modCache.ts`** — 5-minute TTL cache for mod metadata and file lists. Always use `getCachedMod` / `getCachedModFiles` from the renderer — never call `window.api.getMod` or `window.api.listModFiles` directly.

**`ModDetailPage.tsx`** — tabs: Description (always), Images (always), Downloads (always), Changelog (only when `mod.changelog` is non-empty), Dependencies & Instructions (only when there are deps or instructions). The tab bar renders only after the mod loads, so tabs are never shown for a mod that lacks their content.

**`InstalledPage.tsx`** — delegates data fetching to `useModData`, drag-and-drop to `useDragDrop`, and pure data helpers to `installedUtils.ts`. The component owns rendering only: `renderFolderSection(folder)` is **recursive** — calls `computeChildren` for the folder's own children and recurses into subfolders. `creatingFolderParentId` state is `undefined` (not creating), `null` (creating at root), or a folder ID (creating a subfolder inside that folder).

**`hooks/installedUtils.ts`** — pure data functions shared by `InstalledPage` and `useDragDrop`: `computeChildren(mods, folders, parentId)` builds the child list at any nesting level and sorts with a two-tier (mods before folders, both descending by priority); `groupChildren` collapses consecutive mod runs into `root-group` slots for the grid layout; `syntheticMod` builds a stub `Mod` for unrecognized installs; `getAllModsInFolder` recurses into sub-folders. Types `ChildEntry` and `ChildGroup` live here too.

**`hooks/useModData.ts`** — fetches mod metadata for all installed mods using `getCachedMod`, with a 5-minute TTL tracked per mod ID via `fetchedAt` ref. Returns `{ modData: Map<number, Mod>, failedIds: Set<number>, updatable: InstalledMod[] }` — `updatable` is mods whose remote `version` differs from the installed version.

**`hooks/useDragDrop.ts`** — all drag-and-drop state and handlers. Accepts `{ installed, folders, gamePath, modData, onRefreshInstalled }`. Exports `DragItem` (`{ kind: 'mod'; uid }` | `{ kind: 'folder'; id }`) and `DropTarget` union. Folder drag-and-drop: the bottom half of a folder header targets `into-folder` (nest inside), the top half targets `before-child` (reorder before). Hovering over a child mod's top/bottom half sets `before-child`/`after-child`. Dropping on `into-folder` calls `moveFolder`; dropping on `before-child`/`after-child` calls `reorderChildren` (and `moveFolder` first if the dragged folder has a different parent). `createDragImage` lives here — it builds DOM elements outside React's render tree.

### Strings (i18n)

All user-visible strings live in `src/renderer/src/i18n/en.json`, nested by feature area. Use the typed helper — never write bare string literals in JSX:

```ts
import { t } from '../i18n'
t('common.install')
t('browse.modCount', { total: 42 })
```

`t(key, vars?)` is fully type-safe — TypeScript errors on unknown keys. Plural pairs are two separate keys; the component picks based on count. For JSX with styled inline elements, split surrounding prose into prefix/suffix keys. Top-level namespaces: `common`, `app`, `topBar`, `sidebar`, `browse`, `installed`, `detail`, `embed`, `fileSelect`, `depsWarning`, `settings`.

### Styling

All colors are semantic tokens defined in `src/renderer/src/index.css` via Tailwind v4's `@theme` block — never use hardcoded Tailwind color classes like `zinc-*` or `red-*` in components. Token names: `surface`, `surface-raised`, `surface-hover`, `surface-active`, `surface-light`, `border`, `text`, `text-muted`, `text-subtle`, `accent`, `accent-bright`, `danger`, `danger-hover`, `danger-text`, `success`, `success-text`, `warning`.

The one exception: `createDragImage` in `hooks/useDragDrop.ts` builds DOM elements outside React's render tree where Tailwind classes don't apply. Use hex equivalents there: `#18181b` = `surface-raised`, `#27272a` = `surface-hover`/`border`, `#f4f4f3` = `text`.

Icons: `lucide-react`, imported individually by name. Custom dropdowns: use `components/Select.tsx` — native `<select>` can't be themed. Toggles: use `components/Toggle.tsx`. Markdown: use `components/MarkdownContent.tsx` — never inline `ReactMarkdown` directly. **Preprocessing** before markdown parsing: CRLF→LF normalization, then `parseColorTags` converts modworkshop `{#HEX}(text)` / `{ColorName}(text)` color syntax to `<span style="color:...">` HTML (iterative loop handles nesting), then `splitParts` extracts modworkshop `!!! Title ... !!!` collapsible blocks (rendered as `<details>/<summary>`, each body gets its own `ReactMarkdown` so markdown inside parses correctly) and `![](url)` embed tokens for known video platforms (rendered as `EmbedPlayer` — thumbnail that loads an iframe on click). **ReactMarkdown** is configured with `remark-gfm` (tables/strikethrough), `remark-breaks` (single newlines become `<br>` to match modworkshop line-break behavior), `rehype-raw` (renders color-tag HTML spans), and `rehype-highlight` with `detect: true` (GitHub Dark theme, auto-detects language for unlabeled fenced blocks). `InsidePreContext` is a React context the `pre` component sets to `true`; the `code` component reads it to skip inline-code styles when inside a block — needed because react-markdown routes both inline `` `code` `` and fenced ` ``` ` through the same `code` component. Embed platform logic lives in `src/renderer/src/embeds.ts` — adding a new platform means one `EmbedDef` entry in `EMBEDS`. `MarkdownContent` accepts an optional `embeds` prop. Skeleton loading: use `components/SkeletonCard.tsx` (grid) and `components/SkeletonListRow.tsx` (list) — never replace a grid or list with a centered loading string.

**Confirm dialogs**: never use `window.confirm`. Add `fooId: string | null` state (null = closed), then render a modal inline: `absolute inset-0 bg-black/60` backdrop → `bg-surface-raised border border-border rounded-xl` dialog card with a `border-b border-border` header section and a footer with Cancel (`bg-surface-hover`) + destructive action (`bg-danger`) buttons. See `deletingFolderId` in `InstalledPage.tsx` as the reference implementation.

## Key domain facts

- **modworkshop game ID for PD3 is `853`** — hardcoded in `api.ts`.
- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- All mod images share `${THUMBNAIL_BASE_URL}/${file}` where `THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'` (exported from `src/shared/types.ts`).
- PD3 mods are `.pak` files. Active: `{gamePath}/PAYDAY3/Content/Paks/~mods/`. Disabled: `~mods/disabled/` — but with a `.pak.disabled` extension (e.g. `003_MyMod.pak.disabled`), not `.pak`. UE5 only loads exact `.pak` files, so the extension change is what actually disables them; the subdirectory alone is not enough (UE5 scans all subdirectories of `Paks/`). `gamePath` is the game install root (e.g. `steamapps/common/PAYDAY3` for Steam, `XboxGames/PAYDAY 3` for Xbox). State is stored as `.pd3mm.json` inside `~mods/` so it travels with the game folder on dual-boot setups.
- "Launch without mods" renames `~mods` → `PAYDAY3/Content/~mods.bak` (one level above `Paks/`) before opening Steam — must be outside `Paks/` because UE5 scans all subdirectories there. Both launch buttons are disabled in `TopBar` when `gamePath` is null.
- Filenames on disk are always priority-prefixed: `applyPriorityPrefix(base, priority)` → `003_CSA-39_Assault_Rifle.pak`. `stripPriorityPrefix` removes the `\d+_` prefix. Manually placed mods may have any filename; the app attempts SHA256 lookup then name-based lookup (`lookupByName`) before falling back to a synthetic negative ID via `hashFilename`.
- **Mod folders** support arbitrary nesting depth. `ModFolder.parentId` is `string | null` (`null` = root). Disk paths are full slash-separated relative paths built by `getFolderPath` walking the `parentId` chain — e.g. `001_weapons/002_rifles`. Priority is scoped to siblings within the same parent (not a global namespace). `readState` spreads `{ parentId: null, ...f }` so existing JSON without `parentId` defaults to root.
- **Mod priority and load order**: UE5 loads `.pak` files alphabetically within `~mods/`, so higher prefix number = loads later = overrides earlier mods. Top of the `InstalledPage` list = highest priority. `reorderMods` assigns `priority = total - position`.
- `InstalledMod`: `uid` is the stable per-file identity used by all IPC handlers and drag-and-drop (`dragItem.uid`, `reorderModsInFolder`, `moveModToFolder`, `uninstallMod`). `id` is the modworkshop remote ID — can be negative for unrecognized mods. Optional fields: `fileId?: number` (set by install handlers), `priority?: number` (migrated by `reconcileState` on first `getInstalled`), `missing?: boolean` (set/cleared by `reconcileState`). Use `installedMod?.fileId === file.id` to identify installed variant — version string comparison is unreliable.
- `mods:install` falls back to `getLatestFile(modId)` when `mod.download` is null. `mods:install-file` accepts explicit `(modId, modName, fileId, downloadUrl, fileType, fileVersion, gamePath)` for variant files.
- `getStatePath(gamePath)` returns `{gamePath}/PAYDAY3/Content/Paks/~mods/.pd3mm.json` when a game path is known, falling back to `legacyStatePath` (`userData/installed.json`).

## Testing

Tests live in `src/main/` only — the renderer has no tests. Vitest runs in a Node environment (no DOM). All test files match `src/**/*.test.ts`. Any test file that transitively imports `electron` must mock it:

```ts
vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0-test' } }))
```

`download.test.ts` stubs global `fetch` via `vi.stubGlobal` and uses `Readable.from()` to mock the response body stream.

## Agent skills

Reusable skills live in `.agents/skills/` and are listed in `AGENTS.md`. Available as Claude Code slash commands:

- `/commit` — read the current diff and propose a conventional commit message; waits for confirmation before committing.
- `/deslop` — audit the branch diff for AI-generated slop (unnecessary comments, defensive checks, wrong abstractions, project convention violations) and fix each issue found.

**Releasing**: run `pnpm version patch|minor|major` — bumps `package.json`, commits as `chore(release): X.Y.Z`, creates a `vX.Y.Z` tag. Pushing the tag triggers the CI release workflow. Never edit `package.json` version manually.
