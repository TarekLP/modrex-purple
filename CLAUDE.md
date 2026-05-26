# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start Tauri app (launches Vite dev server then Tauri)
pnpm build        # Production build
pnpm dist:win     # Package Windows NSIS installer
pnpm dist:linux   # Package Linux AppImage + .deb
pnpm typecheck    # Type-check renderer without emitting
pnpm format       # Format all files with prettier
pnpm format:check # Check formatting without writing
pnpm test         # Run Rust unit tests (cargo test inside src-tauri/)
```

Run a single Rust test by name filter:

```bash
cd src-tauri && cargo test strip_priority
```

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

- **`settings.rs`** — reads/writes `settings.json` in Tauri's `app_data_dir()` (`%APPDATA%\Modrex\` on Windows). Fields: `gamePath?`, `launcher?`, `launchOptions?`, `skipFileOpenLogWarning?`, `dismissedDepsWarnings?`. On first launch after the Electron-to-Tauri migration, `migrate_from_electron` copies settings from `%APPDATA%\PD3 Mod Manager\`. Called from `lib.rs` setup hook before the window shows.

- **`api.rs`** — modworkshop REST API via `reqwest`. Params sent as query string (GET requests). `get_mod` returns extra fields (`images`, `banner`, `dependencies`, `instructs_template`, `tags`) absent from `list_mods` results. `API_SEMAPHORE` caps concurrent requests at 3; 429 responses are retried once after 1.5–3 s jitter.

- **`download.rs`** — streams file to `temp_dir()/pd3-mod-{uuid}.{ext}`, emitting `download:progress` Tauri events with `{ downloaded, total }`. `total` is `0` when the server omits `content-length` — callers must handle the indeterminate case.

- **`mods.rs`** — the most complex module. Key helpers:
    - `mods_base(game_path)` / `disabled_base` / `get_state_path` build canonical paths
    - `apply_priority_prefix(filename, priority)` / `strip_priority_prefix(filename)` — filenames on disk are always `NNN_name.pak`
    - `get_folder_path(folders, folder_id)` — recursive, builds slash-separated path from `parentId` chain (e.g. `001_weapons/002_rifles`)
    - `disabled_mod_path` appends `.disabled` to the `.pak` filename — the extension change is what actually disables mods (UE5 scans all subdirectories of `Paks/`, so subdirectory alone is insufficient)
    - `reconcile_state` — marks missing files `missing: true` without dropping them; migrates legacy `disabled/foo.pak` to `disabled/foo.pak.disabled`; when `~mods.bak` exists reads state from there
    - `get_installed` command runs the full identification pipeline: upgrade synthetic mods (SHA256 → index lookup), find untracked paks, auto-create folder entries for nested paths, reconcile by SHA256, identify remaining untracked files. After identification, untracked paks whose `id` matches an already-tracked remote mod id are skipped (`tracked_ids` guard) — prevents stale on-disk files from overwriting a freshly-installed state entry.
    - `install_mod` stores the **mod-level** version from `/mods/{id}` (not the file-level version from `/files/latest`) so the stored version matches what `getCachedMod` returns and `useModData` compares against. It also inherits `folder_id` from the existing state entry when the caller omits it (the normal update path from the UI passes no `folderId`), and the state write in `install_mod_from_path` propagates errors instead of silently swallowing them.
    - `InstalledMod.uid` has `#[serde(default)]` so state files predating the uid field still deserialize

- **`launchers/`** — split into focused files so touching one launcher never requires touching another:
    - `types.rs` — `GameDef` struct (`name`, `executable`, `process_name`, `steam?`, `epic?`, `xbox?`) and `Launcher` trait (`id`, `is_installed`, `find_game`, `identify_path`, `launch`)
    - `pd3.rs` — the only file with PAYDAY 3 specifics; change game here when adding a second game
    - `steam.rs` — Windows: `reg query` for install path, then walks `libraryfolders.vdf`; Linux: checks `STEAM_DIR`, `XDG_DATA_HOME`, snap, flatpak paths
    - `epic.rs` — reads `%PROGRAMDATA%\Epic\...\Manifests\*.item` JSON
    - `xbox.rs` — `find_in_drives` scans every subdirectory of each drive root C–G for `{dir}/{game.name}/Content/` containing the xbox executable; falls back to `find_via_package_manager` (PowerShell `Get-AppxPackage`) for deeply nested installs; launches via `gamelaunchhelper.exe`. Xbox game path always ends in `/Content`.
    - `mod.rs` — orchestration (`identify_launcher_for_path`, `launch_with`, `all_launchers`) + all Tauri commands. `GAME` constant is the single binding point between launcher logic and game data. Marker files for `identify_launcher_for_path`: `steam_appid.txt`, `.egstore/`, `MicrosoftGame.config`. `configure_game_path(None)` auto-detects and **saves** the detected path. On first renderer call when settings has no game path, `findGamePath()` in `api.ts` triggers this automatically.

- **`mod_index.rs`** — SHA256-based mod identification. Downloads `index.db` from the `modrexio/modrex-index` GitHub release to `app_data_dir()`, cached with a 1-hour TTL (fire-and-forget at startup). `query_sha256(conn, sha256)` and `query_by_name(conn, name)` are private helpers that take a `&rusqlite::Connection` — testable with in-memory SQLite. `lookup_by_name` returns `Some` only when exactly one mod matches (ambiguous = `None`). Uses `rusqlite` with `features = ["bundled"]` — no native module issues.

### Renderer (`src/renderer/src/`)

**`api.ts`** — the only place `invoke` / `listen` are called. All other renderer code imports from here. `onEvent<T>` wraps `listen` with a cancellation-safe pattern (resolves the `UnlistenFn` async, cancels immediately if component unmounts first).

**`App.tsx`** — owns `installed`, `gamePath`, `modsHidden` as sources of truth. On every window focus (500ms debounce) both `refreshGamePath` and `refreshInstalled` run. `BrowsePage` unmounts on tab switch (fresh fetch each visit); `InstalledPage` and `SettingsPage` are CSS-`hidden` when inactive to preserve scroll/drag state.

**`modCache.ts`** — 5-minute TTL cache. Always use `getCachedMod` / `getCachedModFiles` — never call `api.getMod` or `api.listModFiles` directly.

**`hooks/installedUtils.ts`** — pure data helpers: `computeChildren(mods, folders, parentId)` builds and sorts children (mods before folders, both descending by priority); `groupChildren` collapses consecutive mod runs into `root-group` grid slots.

**`hooks/useDragDrop.ts`** — all DnD state and handlers. `dragDropEnabled: false` in `tauri.conf.json` is required — without it Tauri's native file-drop intercepts HTML5 drag events on Windows.

### Strings (i18n)

All user-visible strings live in `src/renderer/src/i18n/en.json`. Use the typed helper:

```ts
import { t } from '../i18n'
t('common.install')
t('browse.modCount', { total: 42 })
```

`t(key, vars?)` is fully type-safe — TypeScript errors on unknown keys. Top-level namespaces: `common`, `app`, `topBar`, `sidebar`, `browse`, `installed`, `detail`, `embed`, `fileSelect`, `depsWarning`, `settings`.

### Styling

All colors are semantic tokens in `src/renderer/src/index.css` via Tailwind v4's `@theme` block — never use hardcoded Tailwind color classes like `zinc-*` or `red-*`. Token names: `surface`, `surface-raised`, `surface-hover`, `surface-active`, `surface-light`, `border`, `text`, `text-muted`, `text-subtle`, `accent`, `accent-bright`, `danger`, `danger-hover`, `danger-text`, `success`, `success-text`, `warning`.

`createDragImage` in `useDragDrop.ts` builds DOM nodes outside React's render tree — use CSS custom properties in inline styles (`var(--color-surface-raised)` etc.), not Tailwind classes.

Icons: `lucide-react`. Custom dropdowns: `components/Select.tsx`. Toggles: `components/Toggle.tsx`. Markdown: `components/MarkdownContent.tsx` — never inline `ReactMarkdown` directly. Skeleton loading: `components/SkeletonCard.tsx` (grid) and `components/SkeletonListRow.tsx` (list).

**Confirm dialogs**: never use `window.confirm`. Pattern: `fooId: string | null` state → inline modal with `absolute inset-0 bg-black/60` backdrop. See `deletingFolderId` in `InstalledPage.tsx`.

## Key domain facts

- **modworkshop game ID for PD3 is `853`** — hardcoded in `api.rs`.
- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- All mod images: `${THUMBNAIL_BASE_URL}/${file}` where `THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'` (exported from `src/shared/types.ts`).
- PD3 mods are `.pak` files. Active: `{gamePath}/PAYDAY3/Content/Paks/~mods/`. Disabled: `~mods/disabled/foo.pak.disabled`. `gamePath` is the game install root. State: `.pd3mm.json` inside `~mods/` (travels with the game folder on dual-boot setups).
- "Launch without mods" renames `~mods` → `PAYDAY3/Content/~mods.bak` (one level above `Paks/`) — must be outside `Paks/` because UE5 scans all subdirectories there.
- **Mod priority**: UE5 loads `.pak` files alphabetically, so higher prefix number = loads later = overrides earlier mods. Top of `InstalledPage` = highest priority.
- `InstalledMod.uid` is the stable per-file identity for all commands and DnD. `id` is the modworkshop remote ID (can be negative for unrecognized mods). Use `installedMod?.fileId === file.id` to identify installed variant — version string comparison is unreliable.
- **modworkshop has two distinct version fields**: `/mods/{id}` returns a `version` field (e.g. `"2.11"`) and `/mods/{id}/files/latest` returns its own `version` field (e.g. `"1.9.4"`). `InstalledMod.version` must store the **mod-level** value so it matches what `getCachedMod` returns and `useModData` can compare them. Never store the file-level version.
- **Mod folders**: arbitrary nesting. `ModFolder.parentId` is `string | null` (null = root). Disk paths built by `get_folder_path` walking the `parentId` chain. Priority scoped to siblings within the same parent.
- Tauri `identifier` is `io.github.shulhaoleh.pd3modmanager` — must match old Electron `appId` so NSIS upgrades over existing installs. `productName` is `Modrex` — Tauri uses this for `userData` path on Windows.

### Companion repo: modrex-index

`https://github.com/modrexio/modrex-index` — builds and hosts `index.db`. A GitHub Actions workflow runs hourly, streams SHA256 of every `.pak` on modworkshop, writes `(sha256, modRemoteId, modName, fileRemoteId, version)` rows. Schema: `games → sources → mods → files`.

## Testing

Rust unit tests live in separate `*_tests.rs` files, referenced from the module via `#[cfg(test)] #[path = "foo_tests.rs"] mod tests;`. 53 tests across 4 modules — run with `cargo test` inside `src-tauri/`. The renderer has no tests. `tempfile` crate is in `[dev-dependencies]` for filesystem tests.

Modules with tests: `mods.rs` (pure functions + state I/O), `launchers/mod.rs` (VDF parser + launcher identification), `settings.rs` (JSON roundtrip), `mod_index.rs` (in-memory SQLite queries).

## Agent skills

Reusable skills live in `.agents/skills/` and are listed in `AGENTS.md`. Available as Claude Code slash commands:

- `/commit` — read the current diff and propose a conventional commit message; waits for confirmation before committing.
- `/deslop` — audit the branch diff for AI-generated slop (unnecessary comments, defensive checks, wrong abstractions, project convention violations) and fix each issue found.

**Releasing**: run `pnpm version patch|minor|major` — bumps `package.json`, commits as `chore(release): X.Y.Z`, creates a `vX.Y.Z` tag. Pushing the tag triggers the CI release workflow.
