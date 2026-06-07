# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start Tauri app (launches Vite dev server then Tauri)
pnpm build        # Production build — installer written to src-tauri/target/release/bundle/nsis/ even if it exits 1 (signing requires TAURI_SIGNING_PRIVATE_KEY, CI-only)
pnpm dist:win     # Same as build but with explicit --target x86_64-pc-windows-msvc
pnpm dist:linux   # Package Linux AppImage + .deb
pnpm typecheck    # Type-check renderer without emitting
pnpm format       # Format all files with prettier
pnpm format:check # Check formatting without writing
pnpm lint         # ESLint on renderer source (src/renderer/src/)
pnpm lint:fix     # ESLint with auto-fix
pnpm test         # Run all tests: Rust (cargo test) then renderer (vitest)
pnpm test:renderer # Run only renderer TypeScript tests (vitest)
cargo clippy      # Rust lints (run from src-tauri/); one expected warning: too_many_arguments on install_file
```

Run a single Rust test by name filter:

```bash
cd src-tauri && cargo test strip_priority
```

In `pnpm dev`, renderer changes (`src/renderer/`) apply instantly via Vite HMR — no restart needed. Rust changes (`src-tauri/`) trigger an automatic `cargo` recompile via Tauri's file watcher; the window reloads when done.

## Architecture

Tauri v2 app: **Rust backend** + **React renderer**, communicating via Tauri's `invoke` / `emit`.

```
src-tauri/src/commands/   ← all backend logic (Rust)
src/renderer/src/         ← React UI
src/renderer/src/api.ts   ← renderer-side IPC surface
src/shared/types.ts       ← TypeScript types shared by renderer and api.ts
```

### Adding a new command

1. Implement `#[tauri::command] pub fn my_cmd(...)` in the appropriate `src-tauri/src/commands/*.rs` file
2. Register it in `src-tauri/src/lib.rs` inside `tauri::generate_handler![...]`
3. Add a wrapper in `src/renderer/src/api.ts` calling `invoke('my_cmd', { ... })`

Missing any of these three breaks the channel silently at the type level.

### Rust backend modules (`src-tauri/src/commands/`)

- **`settings.rs`** — reads/writes `settings.json` in Tauri's `app_data_dir()` (`%APPDATA%\Modrex\` on Windows, `~/.config/modrex/` on Linux). Top-level fields: `skipFileOpenLogWarning?`, `dismissedDepsWarnings?`, `games: Option<HashMap<String, GameSettings>>`. `GameSettings` holds `game_path?`, `launcher?`, `launch_options?` per game. Legacy flat fields (`game_path`, `launcher`, `launch_options`) carry `#[serde(skip_serializing, default)]` so old settings files still deserialize but writes always use the new `games` map. `migrate_settings(s: Settings) -> Settings` promotes legacy flat fields to `games["pd3"]` on first read — called inside `read_settings`. `game_settings<'a>(s, game_id) -> Option<&'a GameSettings>` is the canonical helper for reading per-game config; always use it instead of touching legacy fields directly. Commands: `get_game_settings(game_id: String) -> GameSettings` (new); `set_game_path`, `set_launcher`, `set_launch_options`, `configure_game_path`, `installed_launchers`, `auto_detect_game` all accept `Option<String> game_id` defaulting to `"pd3"` for backwards compatibility. On first launch after the Electron-to-Tauri migration, `migrate_from_electron` copies `settings.json` and `mod-index.db` from the old Electron path (`%APPDATA%\PD3 Mod Manager\` on Windows, `~/.config/pd3-mod-manager/` on Linux). Called from `lib.rs` setup hook before the window shows.

- **`api.rs`** — modworkshop REST API via `reqwest`. Params sent as query string (GET requests). `get_mod` returns extra fields (`images`, `banner`, `dependencies`, `instructs_template`, `tags`) absent from `list_mods` results. Two-layer request control: (1) `RATE_LIMITER` token bucket (burst 8, 4 req/s sustained) — checked first, before the semaphore, to proactively keep our send rate under the API's threshold; (2) `API_SEMAPHORE` caps concurrent in-flight requests at 3. On 429 the semaphore permit is released and the request is retried up to 3 times with exponential backoff (1 s / 2 s / 4 s jitter) or the `Retry-After` header value. Shared `HTTP_CLIENT` static (connection pooling via `pool_max_idle_per_host(4)`). **HTTP_CLIENT invariant**: every outgoing HTTP request anywhere in the Rust backend must go through `http_client()` from `api.rs` — never call `reqwest::Client::new()` directly. Creating a new client bypasses connection pooling and drops the `User-Agent` header that modworkshop requires. Both `http_client()` and `user_agent(app)` are `pub(crate)` — import them via `use crate::commands::api::{http_client, user_agent}` when making HTTP requests from outside `api.rs`.

- **`download.rs`** — streams file to `temp_dir()/pd3-mod-{uuid}.{ext}`, emitting `download:progress` Tauri events with `{ downloaded, total }`. `total` is `0` when the server omits `content-length` — callers must handle the indeterminate case.

- **`mods/`** — the most complex module, split into focused subfiles. `mod.rs` holds all `#[tauri::command]` functions and re-exports; the logic lives in:
    - `types.rs` — `InstalledMod`, `ModFolder`, `ModsState`, `InstalledResponse`, `TopLevelItem`
    - `naming.rs` — `strip_priority_prefix` / `apply_priority_prefix` (filenames on disk are always `NNN_name.pak`), `pak_filename`, `hash_filename`, `make_uid`
    - `paths.rs` — `mods_base` / `disabled_base` / `get_state_path` / `active_mod_path` / `disabled_mod_path` / `find_untracked_paks`
    - `state.rs` — `read_state`, `save_state`, `get_folder_path` (recursive, builds slash-separated path from `parentId` chain), `reconcile_state` (marks missing files `missing: true`; migrates legacy `.disabled` paths; when `~mods.bak` exists reads state from there)
    - `zip.rs` — multi-format archive support. `ArchiveFormat` enum (`Zip`, `SevenZip`, `TarGz`, `TarXz`) + `detect_archive` (magic-byte dispatch). Public API: `list_pak_entries`, `extract_entry`, `resolve_archive_download`, `mark_archive_files`, `compute_sha256`. Each format has private helpers (`_zip`, `_7z`, `_tar<R>`). **sevenz-rust callback invariant**: the `bool` returned by the `decompress_with_extract_fn` closure controls iteration — `Ok(false)` stops, `Ok(true)` continues. Non-matching entries must drain their bytes via `std::io::sink()` before returning `Ok(true)` to stay stream-aligned in solid 7z archives. `mark_archive_files` returns `(Vec<InstalledMod>, bool)` — the bool is `true` when at least one mod was newly checked (dirty flag for the caller to persist state). Skips mods where `archive_broken.is_some()` so repeated calls are O(1). `InstalledMod.archive_broken: Option<bool>`: `None` = unchecked, `Some(false)` = clean, `Some(true)` = broken; persisted in the state file so magic-byte scanning is amortized across launches.
    - `install.rs` — `install_mod_from_path`, `uninstall_mod_op`, `enable_mod_op`, `disable_mod_op`
    - `reorder.rs` — `reorder_mods_in_folder_op`, `move_mod_to_folder_op`, `reorder_children_op`
    - `folders.rs` — `create_folder_op`, `move_folder_op`, `rename_folder_op`, `delete_folder_op`
    - Key invariants:
        - `disabled_mod_path` appends `.disabled` to the `.pak` filename — the extension change is what disables mods (UE5 scans all subdirectories of `Paks/`, so subdirectory alone is insufficient)
        - `get_installed` accepts `game_id: Option<String>` and immediately returns an empty `InstalledResponse` for any value that is not `"pd3"` — PD2/PDTH mod management is not yet implemented; the backend owns this guard, not the renderer.
        - `get_installed` identification pipeline: (1) SHA256 index lookup upgrades negative-id entries; (2) name-suffix pass re-assigns positive ids; (3) untracked paks are auto-folder-created, reconciled by SHA256, then identified via index/name/fallback. New untracked entries use `by_uid.entry().or_insert(...)` — existing entries are never overwritten.
        - `install_mod` stores the **mod-level** version from `/mods/{id}` (not the file-level version from `/files/latest`). It inherits `folder_id` from existing state when the caller omits it.
        - **Multi-file installs**: `install_mod_from_path` finds `existing` by `uid` only (not `id`). `install_mod` pre-removes the old pak when exactly one same-id entry exists — never do this inside `install_mod_from_path`.
        - **ZIP installs**: `install_from_zip_entry` uid is `{file_id}_{entry_stem}`; SHA256 match reuses existing uid so reinstall moves in-place. `folder_id` is always caller-provided (never inherited from existing entries).
        - `InstalledMod.uid` has `#[serde(default)]` so state files predating the uid field still deserialize

- **`launchers/`** — split into focused files so touching one launcher never requires touching another:
    - `types.rs` — `GameDef` struct (`name`, `executable`, `process_name`, `steam?`, `epic?`, `xbox?`) and `Launcher` trait (`id`, `is_installed`, `find_game`, `identify_path`, `launch`)
    - `games/pd3.rs`, `games/pd2.rs` — one file per game; add new games as `games/<name>.rs`
    - `steam.rs` — Windows: `reg query` for install path, then walks `libraryfolders.vdf`; Linux: checks `STEAM_DIR`, `XDG_DATA_HOME`, snap, flatpak paths. `find_game` requires `game.executable` to exist inside the candidate folder — a leftover folder without the exe is not counted as installed. The Windows `reg query` result is cached in a `OnceLock<Option<String>>` for the process lifetime — never call `reg query` for Steam's install path outside this helper.
    - `epic.rs` — reads `%PROGRAMDATA%\Epic\...\Manifests\*.item` JSON
    - `xbox.rs` — `find_in_drives` scans every subdirectory of each drive root C–G for `{dir}/{game.name}/Content/` containing the xbox executable; falls back to `find_via_package_manager` (PowerShell `Get-AppxPackage`) for deeply nested installs; launches via `gamelaunchhelper.exe`. Xbox game path always ends in `/Content`.
    - `mod.rs` — orchestration (`identify_launcher_for_path`, `launch_with`, `all_launchers`) + all Tauri commands. `game_def_for_id(game_id: &str) -> &'static GameDef` maps `"pd2"` to `&PD2`, `"pdth"` to `&PDTH`, anything else to `&PD3`. Marker files for `identify_launcher_for_path`: `steam_appid.txt`, `.egstore/`, `MicrosoftGame.config`. `configure_game_path(None)` validates the existing saved path first (checks `game.executable` exists there) and preserves the saved launcher as-is — it does not re-run `identify_launcher_for_path` on valid paths, because doing so clobbers games without marker files. Only re-detects launcher+path if the path is stale or absent. `findGamePath()` in `api.ts` always calls `configure_game_path(null)` on every refresh — this is how stale paths (game uninstalled but folder left behind) get cleared. **PD3-only commands**: `is_game_running`, `launch_game`, `launch_without_mods`, `restore_mods`, `stop_game` have no `game_id` parameter and always operate on PD3. These must stay PD3-only until equivalent game-folder logic exists for other games.
    - **Windows `CREATE_NO_WINDOW` invariant**: The release binary sets `windows_subsystem = "windows"` (`main.rs:1`), so it has no console. Any `std::process::Command` on Windows without `creation_flags(0x08000000)` spawns a visible console window. In debug builds (`pnpm dev`) this is invisible because the process inherits the parent console. Every spawn of a **console-mode executable** (cmd, tasklist, PowerShell, cargo, pkill, pgrep) must use `use std::os::windows::process::CommandExt` and `.creation_flags(0x08000000)`. GUI shell programs (`explorer.exe`, `xdg-open`) are exempt — they never attach to a console regardless.

- **`updater.rs`** — auto-update flow via `tauri-plugin-updater`. `UpdaterState` (managed Tauri state) holds the pending `Update` object and its downloaded bytes across two separate commands. Three-phase sequence: `check_for_update` fetches metadata and stores the `Update` object, emitting `updater:update-available`; `download_update` streams bytes and emits `updater:update-progress` (percent) then `updater:update-ready`; `install_update` takes both and applies. Strategy is always `"manual"` — there is no auto-install path.

- **`thumbnails.rs`** — Thumbnail disk cache. `get_thumbnail(filename)` checks `app_cache_dir()/thumbnails/{filename}`, downloads from `https://storage.modworkshop.net/mods/images` if absent (6-slot semaphore, atomic write via `.tmp` rename), and returns the local path. `cleanup_thumbnail_cache` runs fire-and-forget at startup and removes files whose `modified()` time exceeds 90 days. The modworkshop CDN sends no `Cache-Control` header (`cf-cache-status: DYNAMIC`), so without this every app launch revalidates images over the network.

- **`mod_index.rs`** — SHA256-based mod identification. Downloads `index.db` from the `modrexio/modrex-index` GitHub release to `app_data_dir()`, cached with a 1-hour TTL (fire-and-forget at startup). `query_sha256(conn, sha256)` and `query_by_name(conn, name)` are private helpers that take a `&rusqlite::Connection` — testable with in-memory SQLite. `lookup_by_name` returns `Some` only when exactly one mod matches (ambiguous = `None`). Uses `rusqlite` with `features = ["bundled"]` — no native module issues.

### Renderer (`src/renderer/src/`)

**`api.ts`** — the only place `invoke` / `listen` are called. All other renderer code imports from here. `onEvent<T>` wraps `listen` with a cancellation-safe pattern (resolves the `UnlistenFn` async, cancels immediately if component unmounts first). `getGameSettings(gameId)`, `setGamePath(path, gameId?)`, `setLauncher(launcher, gameId?)`, `setLaunchOptions(opts, gameId?)`, `getInstalledLaunchers(gameId?)` all accept an optional `gameId` that defaults to `"pd3"` on the Rust side. `getInstalled(gameId?)` also accepts an optional `gameId` — always pass `activeGame` so the backend guard in `get_installed` can return an empty response for non-pd3 games.

**`App.tsx`** — owns `installed`, `gamePath`, `modsHidden`, `activeGame` as sources of truth. `View` type includes `'welcome'` in addition to the nav views. `getInitialView()` returns `'welcome'` when `modrex:active-game` is absent from localStorage (first launch). `activeGame` initializer reads localStorage and accepts any valid `GameId` (`pd2`, `pdth`, `pd3`) — never assume it defaults to `pd3`. `handleGameChange(g)` synchronously restores `gamePath` from `gamePathCache` (so the UI never flashes "game not found" while re-validation runs in the background), resets `installed`/`folders`/`modsHidden`, saves the game to localStorage, and navigates to the saved nav view. `installedReady` is NOT reset on game switch — it stays `true` to keep the splash screen hidden. `handleShowWelcome()` navigates back to the welcome screen. When `view === 'welcome'` the entire TopBar/Sidebar is hidden — only `WelcomeScreen` renders inside the root div. App version shown in `TopBar.tsx` comes from `import.meta.env.VITE_APP_VERSION`, injected by Vite's `define` in `vite.config.ts` from `package.json` at build time; shows `v-dev` in dev mode. On every window focus (500ms debounce) both `refreshGamePath` and `refreshInstalled` run. `BrowsePage` unmounts on tab switch but shows the last result instantly from `browseCache.ts` on remount (SWR: show cached, re-fetch if stale); `InstalledPage` and `SettingsPage` are CSS-`hidden` when inactive to preserve scroll/drag state. `SettingsPage` uses `key={activeGame}` to force a full remount on game change, ensuring stale per-game state (launcher, paths) never bleeds through.

**`activeGameRef`** — a `useRef<GameId>` kept in sync with `activeGame` via `useLayoutEffect`. Used by `refreshGamePath` and `refreshInstalled` to discard results that arrived after a game switch. **Must be updated via `useLayoutEffect`, never during the render body** — the `react-hooks/refs` ESLint rule enforces this; writing to a ref in the render body is an error caught by the pre-commit hook.

**`gamePathCache`** — a `useRef<Partial<Record<GameId, string | null>>>({})` that stores the last resolved path for each game per session. `refreshGamePath` writes to it after every successful `findGamePath` call. `handleGameChange` reads from it to restore the previous path immediately, preventing the "game not found" flash while the background re-validation completes. `undefined` means the game was never resolved this session; `null` means it was resolved but not found.

**`WelcomeScreen.tsx`** — full-screen game picker shown on first launch and when the user clicks the game switcher in the sidebar. Banner images load from Steam CDN (`cdn.akamai.steamstatic.com/steam/apps/{appid}/library_600x900.jpg`) with a per-game gradient fallback on `onError`. Selecting a game calls `onSelectGame(g: GameId)` which is wired to `handleGameChange` in `App.tsx`.

**`Sidebar.tsx`** — game switcher is an `ArrowLeftRight` + full game name button at the top; clicking calls `onShowWelcome`. No game-selection logic lives in the sidebar itself.

**`modCache.ts`** — 5-minute in-memory TTL cache, persisted to `modrex:mod-cache` in localStorage (24-hour shelf life). On module init, `loadFromStorage()` pre-warms the in-memory Maps from localStorage. Writes are debounced 2 s via `scheduleStorage()` to coalesce batch fetches into a single write. Always use `getCachedMod` / `getCachedModFiles` / `getCachedModLinks` — never call `api.getMod`, `api.listModFiles`, or `api.listModLinks` directly. `getModCacheEntry(id)` is a synchronous accessor that returns `{ mod, fetchedAt }` without fetching — used by `useModData` for the instant pre-populate pass. Only mod data (not files or links) is persisted to localStorage.

**`thumbnailCache.ts`** — Persistent thumbnail cache bridge. Module-level `resolved: Map<filename, assetUrl>` deduplicates IPC calls within a session. `getLocalThumbnail(filename)` invokes `get_thumbnail`, converts the returned path via `convertFileSrc`, and stores the result. `getCachedThumbnailUrl(filename)` is a synchronous accessor used by `useThumbnail` to initialize state without triggering an IPC call on second render. The asset protocol must be enabled in `tauri.conf.json` (`app.security.assetProtocol`) and the Tauri feature `protocol-asset` must be in `Cargo.toml` for `convertFileSrc` URLs to resolve. Never call `api.getThumbnail` directly — always go through `thumbnailCache.ts`. `useModData` pre-warms thumbnails for all installed mods as mod data becomes available (both the sync cache pass and the async fetch pass).

**`hooks/useThumbnail.ts`** — Hook for thumbnail images. Initializes state synchronously from `getCachedThumbnailUrl` (local asset URL if already resolved this session) or falls back to the CDN URL. Fires `getLocalThumbnail` in the background and upgrades `src` to the local asset URL on resolve. Used in `ModCard` and `ModListRow` — never use a bare CDN URL for thumbnails.

**`browseCache.ts`** — in-memory SWR cache for the Browse page. Keyed by `(workshopId, page, query, sort, categoryId)` — the `workshopId` prefix is load-bearing: without it, switching games pollutes the other game's cache. All four exported functions (`getBrowseCache`, `setBrowseCache`, `getCategoriesCache`, `setCategoriesCache`) take `workshopId: number` as their first argument. 5-minute TTL for mod list pages; 1-hour TTL for categories. `getBrowseCache` returns `{ result, stale }` or `null` — callers show the cached result immediately and skip or background-fetch based on `stale`. `categoriesCache` is a `Map<workshopId, {categories, fetchedAt}>` — one entry per game, not a singleton. Not persisted to localStorage (lives only for the process lifetime). `BrowsePage` reads the initial cache synchronously during component init so the first render already has data on return visits.

**localStorage key convention** — Two scopes:

- App-level (same across games): `modrex:<key>` — e.g. `modrex:active-view`, `modrex:active-game`, `modrex:sidebar-collapsed`, `modrex:mod-cache`
- Game-scoped (per game): `` `modrex:${GAMES[activeGame].storageKey}:<key>` `` — e.g. `modrex:pd3:installed-view`, `modrex:pd3:browse-sort`, `modrex:pd3:collapsed-folders`

`GameId = 'pd3' | 'pd2' | 'pdth'` and `GAMES: Record<GameId, { name, shortName, workshopId, storageKey }>` are exported from `src/shared/types.ts`. `workshopId` drives modworkshop API calls; `storageKey` scopes localStorage keys. Never hardcode `'pd3'` or `853` where `activeGame` is available — use `GAMES[activeGame].*`. `BrowsePage` remounts on game change via `key={activeGame}` in `App.tsx` — browse cache and sort preference are both scoped per game.

**`formatCheck.ts`** — `SUPPORTED_FORMATS = new Set(['pak', 'zip', '7z'])` is the single source of truth for installable formats. `.tar.gz` and `.tar.xz` are handled as a special double-extension case in the URL fallback path. `isUnsupportedFormat(type, downloadUrl?)` returns `true` when a file should show a warning before installing: checks `type` first; if undefined, infers from the URL path's file extension. Every install entry point (`BrowsePage.handleInstall`, `ModDetailPage.handleInstall`, `DownloadsTab.handleInstallFile`, `FileSelectModal.handleInstallSelected`) must call this before proceeding. When adding support for a new file format, add it to `SUPPORTED_FORMATS` here.

**`hooks/useModData.ts`** — fetches remote mod metadata for all installed mods. On each `installed` change, it first synchronously pre-populates `modData` from `getModCacheEntry` (instant, no API call) and marks fresh entries in `fetchedAt` so they skip the network fetch. Then it fires the async batch fetch for stale entries: 5 concurrent per batch with 200 ms between batches. Per-mod TTL (5 min) is tracked in a `useRef` so re-renders don't re-trigger fetches. **When `installed` becomes empty (game switch), `modData`, `failedIds`, and `fetchedAt` are all reset immediately** — this prevents stale metadata from the previous game from bleeding through on the next game's render. Negative-id mods are never fetched and never added to `failedIds` (the `id >= 0` skeleton guard depends on this). Returns `modData: Map<number, Mod>`, `failedIds: Set<number>`, and `updatable: InstalledMod[]`. `updatable` deduplicates by `id` and skips any mod where the latest remote version is already installed (handles multi-file mods that share an `id`).

**`hooks/installedUtils.ts`** — pure data helpers: `syntheticMod(ins)` constructs a fallback `Mod` object for negative-id and fetch-failed mods — the pattern is `apiMod ?? syntheticMod(ins)` after the skeleton guard, so negative-id mods render with their local name instead of a skeleton. `getAllModsInFolder(mods, folders, folderId)` recursively collects all mods in a folder subtree (direct children plus nested folders); used for bulk enable/disable on folder toggle. `normalizeModScopes(mods)` — for rendering only, returns a copy of mods where all entries for the same positive id are reassigned to a single `folderId` (root wins if any entry is there; otherwise majority scope). Called in `InstalledPage` as `renderMods = normalizeModScopes(displayMods)` before passing to `computeChildren`. `computeChildren(mods, folders, parentId, visibleFolderIds?)` builds and sorts children (mods before folders, both descending by priority) — filters out folders that have no mods in the normalized array (prevents empty auto-created folders from appearing); the optional `visibleFolderIds` set filters folders not matched by search. `groupChildren` collapses consecutive mod runs into `root-group` grid slots; `filterInstalled(mods, folders, query)` returns matching mods and the set of all ancestor folder IDs that must remain visible.

**`hooks/useDragDrop.ts`** — all DnD state and handlers. `dragDropEnabled: false` in `tauri.conf.json` is required — without it Tauri's native file-drop intercepts HTML5 drag events on Windows.

**InstalledPage component family** — `InstalledPage.tsx` is a ~230-line coordinator; the logic is split across focused files:

- `hooks/useFolderActions.ts` — all folder state (rename, delete, create, collapse, toggle-enable) and their API calls. Owns `renamingFolderId`, `deletingFolderId`, `creatingFolderParentId`, `collapsedFolders`, `loadingFolderId`.
- `hooks/useModActions.ts` — mod operation state: `loadingMod`, `refreshing`, `zipPickerData`. Owns `handleUninstall`, `handleEnable`, `handleDisable`, `handleReinstall`, `handleRefresh`.
- `components/InstalledContext.tsx` — React context that `InstalledPage` provides and all descendants read via `useInstalledContext()`. Contains mod data, view mode, gamePath, folder/mod action handlers, and all DnD handlers. Any new component that needs shared installed-page state should read from this context rather than adding props.
- `components/FolderSection.tsx` — renders a folder row + its contents recursively. Also exports `NewFolderInput` (used at root level in `InstalledPage` and inside folders). Reads everything from `InstalledContext`.
- `components/InstalledModItem.tsx` — renders a single mod group (list or grid variant based on `viewMode` from context). Contains the skeleton guard, `combined` InstalledMod construction, and all per-mod DnD handlers.
- `components/UpdatesModal.tsx` — owns `selectedIds`, `loadingMod`, `updatingAll`, `updateError` internally.
- `components/DeleteFolderModal.tsx` — stateless confirm dialog; `onConfirm`/`onCancel` as props.

### Strings (i18n)

All user-visible strings live in `src/renderer/src/i18n/en.json`. Use the typed helper:

```ts
import { t } from '../i18n'
t('common.install')
t('browse.modCount', { total: 42 })
```

`t(key, vars?)` is fully type-safe — TypeScript errors on unknown keys. Top-level namespaces: `common`, `app`, `topBar`, `sidebar`, `browse`, `installed`, `detail`, `embed`, `fileSelect`, `zipPicker`, `depsWarning`, `settings`.

### Styling

All colors are semantic tokens in `src/renderer/src/index.css` via Tailwind v4's `@theme` block — never use hardcoded Tailwind color classes like `zinc-*` or `red-*`. Token names: `surface`, `surface-raised`, `surface-hover`, `surface-active`, `surface-light`, `border`, `text`, `text-muted`, `text-subtle`, `accent`, `accent-bright`, `danger`, `danger-hover`, `danger-text`, `success`, `success-text`, `warning`.

`createDragImage` in `useDragDrop.ts` builds DOM nodes outside React's render tree — use CSS custom properties in inline styles (`var(--color-surface-raised)` etc.), not Tailwind classes.

Icons: `lucide-react`. Platform SVGs (Steam, Epic, Xbox, Windows, Linux) live in `assets/icons/` — import as React components via `import FooIcon from '...svg?react'` (powered by `vite-plugin-svgr`); use `fill="currentColor"` or the `fill-current` Tailwind class so they inherit text color. The same files are referenced in `README.md` as static `<img>` tags with `#gh-light-mode-only` / `#gh-dark-mode-only` URL fragments for GitHub theme switching. Custom dropdowns: `components/Select.tsx` — its `Option` type accepts an optional `icon?: ReactNode` rendered before the label in both the trigger and the list. Toggles: `components/Toggle.tsx`. Markdown: `components/MarkdownContent.tsx` — never inline `ReactMarkdown` directly. Skeleton loading: `components/SkeletonCard.tsx` (grid) and `components/SkeletonListRow.tsx` (list). `ModCard` accepts `installedCount?: number` — when > 1, shows a "N files" badge over the thumbnail (same style as `InstalledPage`); `BrowsePage` passes `installed.filter(...).length || undefined`. `ModCard` also accepts `onPrefetch?: () => void` called on `onMouseEnter` — `BrowsePage` wires this with a 150 ms debounce that fire-and-forgets `getCachedMod`, `getCachedModFiles`, `getCachedModLinks` so the detail page loads from cache on click.

**Skeleton guard**: render a skeleton only when `!apiMod && !failedIds.has(id) && id >= 0`. The `id >= 0` is load-bearing — negative-id (unrecognized) mods are never fetched and never added to `failedIds`, so without it they render as permanent skeletons.

**Confirm dialogs**: never use `window.confirm`. Two patterns: (1) scoped to a container — `fooId: string | null` state + `absolute inset-0 bg-black/60` backdrop (see `DeleteFolderModal.tsx`); (2) global overlay needed from multiple places — `fixed inset-0 z-50` (see `NonPakConfirmModal.tsx`).

**ModDetailPage error states**: two distinct states, never conflate them. `error` (set by `fetchData`) hides the entire page content — only set it on data-load failures. `installError` is the install-operation error — a dismissible banner that coexists with the page content. Install handlers (`handleInstall`, the `NonPakConfirmModal.onConfirm` callback) must be `async` and `await doInstall()` inside a `try/catch` that calls `setInstallError`; omitting the `await` turns errors into silent unhandled rejections. `doInstall` clears `installError` at entry so it resets automatically on each new attempt.

**DepsWarningModal on the detail page**: `onGotIt` only dismisses the modal and records the dismissal — it does not re-call `doInstall`. The user must click Install again. This is intentional.

**Archive install flow**: `ZipPickerModal` handles multi-pak archives (ZIP, 7z, tar.gz, tar.xz) — all entries pre-selected, installs sequentially, calls `api.deleteTempFile(zipPath)` after all entries finish. The Rust command `install_from_zip_entry` (name kept for backwards compat) uses `extract_entry` internally and dispatches by magic bytes, so it handles all supported archive formats. `parseZipMultiPak(errStr)` is a utility exported from `ZipPickerModal.tsx` used by every install entry point to detect and parse the `ZIP_MULTI_PAK:{...}` error string — the wire protocol name is unchanged even for non-ZIP archives. `FileSelectModal` handles ZIP_MULTI_PAK inline: it pauses its install loop (via a Promise resolved by `zipResolveRef`), renders `ZipPickerModal` after its own main div (so it appears on top at the same `z-50`), then resumes with the next file when ZipPickerModal closes. When adding a new install entry point that calls a Rust install command, handle `parseZipMultiPak` in the catch block. `InstalledMod.archiveBroken` (previously `zipArchive`) is set by `mark_archive_files` when an installed pak file is detected as an archive by magic bytes; persisted in the state file and cached across launches — shown as a warning badge in `ModCard` and `ModListRow`.

## Key domain facts

- **modworkshop game IDs**: PD3 = `853`, PD2 = `218` — stored in `GAMES` in `src/shared/types.ts` and used by `BrowsePage` via `GAMES[activeGame].workshopId`. The Rust `api.rs` no longer hardcodes a game ID for list calls; it receives the ID as a parameter.
- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- All mod images: `${THUMBNAIL_BASE_URL}/${file}` where `THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'` (exported from `src/shared/types.ts`).
- PD3 mods are `.pak` files. Active: `{gamePath}/PAYDAY3/Content/Paks/~mods/`. Disabled: `~mods/disabled/foo.pak.disabled`. `gamePath` is the game install root. State: `.pd3mm.json` inside `~mods/` (travels with the game folder on dual-boot setups).
- "Launch without mods" renames `~mods` → `PAYDAY3/Content/~mods.bak` (one level above `Paks/`) — must be outside `Paks/` because UE5 scans all subdirectories there.
- **Mod priority**: UE5 loads `.pak` files alphabetically, so higher prefix number = loads later = overrides earlier mods. Top of `InstalledPage` = highest priority.
- `InstalledMod.uid` is the stable per-file identity for all commands and DnD. `id` is the modworkshop remote ID (can be negative for unrecognized mods). Use `installedMod?.fileId === file.id` to identify installed variant — version string comparison is unreliable.
- `Mod.download` is `| null` even when `mod.has_download` is true — this happens when a mod has files but no default download set. `Mod.download.type` and `ModFile.type` are typed `string | undefined` — the API omits the field for some mods even when the parent object is present. Use `isUnsupportedFormat(type, downloadUrl)` from `src/renderer/src/formatCheck.ts` rather than comparing `.toLowerCase()` directly — it guards both the `type` field and falls back to the URL path extension when `type` is absent.
- **`Mod.download.url` vs `download_url`**: modworkshop has two distinct download object shapes. File-hosted mods: `download.download_url` (CDN URL), `download.type`, `download.size` present, no `url`. External-link mods: `download.url` (third-party site), no `download_url`/`type`/`size`. Detect link-type with `download.url && !download.download_url`. Links also have a separate endpoint `/mods/{id}/links` (→ `ModLink[]`) for a mod's associated external links list — distinct from the default download object.`ModLink` has `url` but no `download_url`, `type`, or `size`.
- `ModDependency.mod` is `Mod | null` — the modworkshop API returns `null` when a dependency mod has been deleted. Always guard with `d.mod !== null` before accessing any field. `allDeps` arrays must be filtered with `.filter((d) => d.mod !== null)` at the source before being passed downstream.
- **modworkshop has two distinct version fields**: `/mods/{id}` returns a `version` field (e.g. `"2.11"`) and `/mods/{id}/files/latest` returns its own `version` field (e.g. `"1.9.4"`). `InstalledMod.version` must store the **mod-level** value so it matches what `getCachedMod` returns and `useModData` can compare them. Never store the file-level version.
- **Mod folders**: arbitrary nesting. `ModFolder.parentId` is `string | null` (null = root). Disk paths built by `get_folder_path` walking the `parentId` chain. Priority scoped to siblings within the same parent.
- Tauri `identifier` is `io.github.shulhaoleh.pd3modmanager` — must match old Electron `appId` so NSIS upgrades over existing installs. `productName` is `Modrex` — Tauri uses this for `userData` path on Windows.

### Companion repo: modrex-index

`https://github.com/modrexio/modrex-index` — builds and hosts `index.db`. A GitHub Actions workflow runs hourly, streams SHA256 of every `.pak` on modworkshop, writes `(sha256, modRemoteId, modName, fileRemoteId, version)` rows. Schema: `games → sources → mods → files`.

## Testing

Rust unit tests live in separate test files referenced from the module via `#[cfg(test)] mod tests;`. 66 tests across 5 modules — run with `cargo test` inside `src-tauri/`. `tempfile` and `filetime` crates are in `[dev-dependencies]` for filesystem tests.

- `mods/tests.rs` — pure functions + state I/O (naming, paths, zip, state)
- `launchers/mod_tests.rs` — VDF parser + launcher identification
- `settings_tests.rs` — JSON roundtrip
- `mod_index_tests.rs` — in-memory SQLite queries
- `thumbnails_tests.rs` — `cleanup_dir` eviction logic (uses `filetime` to set mtime on temp files)

Renderer tests use Vitest (`pnpm test:renderer`) in a Node environment — no browser APIs needed since tested modules are pure TypeScript. Four test files, 88 tests:

- `src/renderer/src/formatCheck.test.ts` — `isUnsupportedFormat`: type field, URL extension fallback, tar double-extensions, invalid URLs
- `src/renderer/src/hooks/installedUtils.test.ts` — all six exports: `syntheticMod`, `getAllModsInFolder`, `filterInstalled`, `normalizeModScopes`, `computeChildren`, `groupChildren`
- `src/renderer/src/browseCache.test.ts` — TTL/stale logic, cache key isolation (including game isolation via workshopId), categories TTL and per-game independence; uses `vi.resetModules()` + dynamic import for per-test state isolation
- `src/renderer/src/modCache.test.ts` — TTL/expiry for mod/files/links caches, `loadFromStorage` pre-warming and expiry, `scheduleStorage` debounce; uses `vi.doMock('./api', ...)` + `vi.stubGlobal('localStorage', ...)` before each dynamic import

`mods/` submodule uses `#[cfg(test)] pub(crate) use` to re-export private helpers so `tests.rs` can reach them via `use super::*`. The `::zip::` prefix is required in `tests.rs` to reference the external crate (not the local `mod zip` submodule).

## Rules

- **Never run any git command that touches the remote** (push, push tag, delete tag, force push) or is destructive locally (tag -d, reset --hard). Always write out the commands and let the user run them.
- **Commit messages must follow conventional commits** — `type(scope): subject` — enforced by `commitlint.config.ts` at commit time. Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`.
- **Prefer `.expect("reason")` over `.unwrap()`** for paths that are infallible in practice (OnceLock init, app path resolution). Prefer `.unwrap_or_else(|e| e.into_inner())` for Mutex guards so a poisoned lock recovers rather than re-panicking. Reserve plain `.unwrap()` for tests only.
- **Never break the in-app update pipeline.** The updater endpoint is `https://github.com/modrexio/modrex/releases/latest/download/latest.json`. Any change to draft/publish behavior, `latest.json` generation, or the startup update check can silently stop all users on the current release from ever receiving future updates. Verify the full pipeline end-to-end when touching anything updater-related.

## Agent skills

Reusable skills live in `.agents/skills/` and are listed in `AGENTS.md`. Available as Claude Code slash commands:

- `/commit` — read the current diff and propose a conventional commit message; waits for confirmation before committing.
- `/deslop` — audit the branch diff for AI-generated slop (unnecessary comments, defensive checks, wrong abstractions, project convention violations) and fix each issue found.

**Deferred work**: tracked in `.TODO`. Do NOT act on anything in that file unless the user explicitly says "do the TODO: <name>".

**Releasing**: run `pnpm version patch|minor|major` — bumps `package.json`, commits as `chore(release): X.Y.Z`, creates a `vX.Y.Z` tag. Pushing the tag triggers the CI release workflow.
