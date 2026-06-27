# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start Tauri app (launches Vite dev server then Tauri)
pnpm build        # Production build — installer written to src-tauri/target/release/bundle/nsis/ even if it exits 1 (signing requires TAURI_SIGNING_PRIVATE_KEY, CI-only)
pnpm dist:win     # Same as build but with explicit --target x86_64-pc-windows-msvc
pnpm dist:linux   # Package Linux AppImage + .deb
pnpm typecheck    # Type-check renderer without emitting (same as: pnpm tsc --noEmit)
pnpm format       # Format all files with prettier
pnpm format:check # Check formatting without writing
pnpm lint         # ESLint on renderer source (src/renderer/src/)
pnpm lint:fix     # ESLint with auto-fix
pnpm test         # Run all tests: Rust (cargo test) then renderer (vitest)
pnpm test:renderer # Run only renderer TypeScript tests (vitest)
pnpm generate-licenses # Regenerate THIRD_PARTY_LICENSES.md (run after adding/updating deps)
cargo clippy      # Rust lints (run from src-tauri/); a handful of pre-existing warnings are expected (too_many_arguments on install_file/install_from_zip_entry/install_host_pack/install_cb_flat_archive, plus a few minor style lints) — only treat *new* warnings as signal
cargo fmt         # Format Rust code (run from src-tauri/)
```

Run a single Rust test by name filter:

```bash
cd src-tauri && cargo test strip_priority
```

Run a single renderer test file or filter by name:

```bash
pnpm test:renderer -- src/renderer/src/browseCache.test.ts
pnpm test:renderer -- -t "returns stale"
```

In `pnpm dev`, renderer changes (`src/renderer/`) apply instantly via Vite HMR — no restart needed. Rust changes (`src-tauri/`) trigger an automatic `cargo` recompile via Tauri's file watcher; the window reloads when done.

**Pre-commit hooks** (`.husky/pre-commit`): runs `prettier --check` then `eslint` — both must pass before a commit is accepted. Run `pnpm format` and `pnpm lint:fix` to fix failures. `commit-msg` runs `commitlint` to enforce the conventional commit format.

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

### Per-module details (load on demand)

Deep per-file architecture and invariants live in path-scoped rule files under
`.claude/rules/` that load automatically when Claude opens the matching code:

- **`.claude/rules/backend.md`** (`src-tauri/**`) — Rust backend modules: the `mods/` engine, launchers, loaders (SuperBLT/DAHM/PDTHModOverrides/UE4SS), `settings`, `api`, `mod_index`, `thumbnails`, `news`.
- **`.claude/rules/renderer.md`** (`src/renderer/**`) — React renderer: `api.ts`, the `App.tsx` state model, the caches, `BrowsePage`/`ModDetailPage`/`InstalledPage` families, styling, i18n, and the archive-install flow.

## Key domain facts

- **modworkshop game IDs**: PD3 = `853`, PD2 = `1`, PDTH = `2`, Crime Boss: Rockay City = `857` — stored in `GAMES` in `src/shared/types.ts` and used by `BrowsePage` via `GAMES[activeGame].workshopId`. The Rust `api.rs` no longer hardcodes a game ID for list calls; it receives the ID as a parameter.
- **Crime Boss: Rockay City** (`game_id: "cb"`) is UE4. Steam app id `2933080`, install folder `CrimeBossRockayCity`, launcher exe `CrimeBoss.exe`, running process `CrimeBoss-Win64-Shipping`. Available on Steam and Epic Games Store on PC (also on PS5/Xbox Series X|S, but those are console releases — out of scope for a desktop app). Mods install into `{gamePath}/CrimeBoss/Mods/<name>/Content/Paks/WindowsNoEditor/<name>-WindowsNoEditor.{pak,ucas,utoc}` (the official ModKit's "Package Mod" output location) — **not** the legacy `~mods` File-unit convention PD3 uses, even though both games are UE pak-based. Reason: the official UGC mod-loader, which enumerates `Mods/<name>/` folders, additively merges multiple mods' Data Table Extensions (e.g. several mods each adding rows to the jobs/weapons tables); plain `~mods` is generic Unreal pak-mounting with no merge semantics, so two mods that both extend the same table silently conflict there (last-loaded wins) — confirmed by user reports, not just isolated single-mod testing. `zip.rs::resolve_crimeboss_archive` (gated by `cfg.game_id == "cb"`) always synthesizes the `Content/Paks/WindowsNoEditor/` skeleton itself around the found `.pak` + `.ucas`/`.utoc` siblings, regardless of whether the source archive shipped a loose triplet or the ModKit's already-wrapped folder — Modrex never copies an archive's wrapper folder as-is for this game. This applies identically to the multi-pak path: `install_from_zip_entry` calls the same `extract_entry_into_crimeboss_skeleton` for every CB pak entry, which is why `ZipPickerModal` must never recreate a CB pak archive's internal wrapper directory as real app folders — see `isCrimeBossPakArchive` in the Archive install flow section above. A zip whose multiple pak entries all sit inside one ModKit-wrapped directory (e.g. several variants packaged together) is a real, observed shape, not a hypothetical. `naming.rs::mod_folder_name` derives the `Mods/<name>/` folder name from the mod's display name. UE5 IoStore's `.ucas`/`.utoc` sidecars (present for nearly every real Crime Boss mod, unlike PD3 where most mods ship a bare `.pak`) are carried alongside the `.pak` through every File-unit op via `naming.rs::sidecar_path`/`zip.rs::extract_entry_with_sidecars` — `Path::with_extension` is unsafe for this since a disabled mod's filename is `Foo.pak.disabled`. **Safety invariant**: the Directory-unit temp-cleanup path in `install_mod`/`install_file` assumes PD2/PDTH's two-level temp scheme (`{uuid_dir}/{dir_name}`, where `tmp.parent()` is safe to `remove_dir_all`) — Crime Boss's synthesized skeleton root _is_ `tmp` itself, one level under the OS temp dir, so both functions have an explicit `cfg.game_id == "cb"` branch that removes `tmp` directly instead of `tmp.parent()`.

**Manual target override** (`install.rs::move_crimeboss_mod_target_op`, command `move_crimeboss_mod_target`): there's no file-content signal that tells Modrex whether a `.pak` was built by the official ModKit (belongs in `Mods/`, gets the Data Table merge above) or is a pre-ModKit-era loose pak (belongs in `~mods`, no merge) — `resolve_crimeboss_archive` always assumes the former for new installs. This op is the user-initiated escape hatch: it toggles a tracked mod between the two targets by unwrapping the skeleton into a flat prefixed pak (`Mods/` → `~mods`) or wrapping a flat pak into a fresh skeleton (`~mods` → `Mods/`), reusing `install_mod_from_path` for the actual write/state update — but that function's own stale-entry cleanup computes the old path inside the _new_ target's directory, which never matches on a cross-target move, so the op removes the real old location itself afterward. Since `install_mod_from_path` always installs as enabled, the op re-runs `disable_mod_op` afterward if the mod was disabled before the move, to restore that state (and resync `crimeboss_settings`). Renderer: `InstalledModItem` shows a persistent "ModKit"/"Legacy" badge plus a `FolderSymlink` icon button (gated on `activeGame === 'cb'` and `location` being `undefined`/`"paks"` — never shown for `ue4ss_mods`/host packs) — the move is otherwise silent, so the badge is what tells the user which target a mod is currently in. Either direction confirms first via `MoveCrimeBossTargetModal`'s `toLegacy` prop, which only changes the wording (the merge-tradeoff explanation for `Mods/` → `~mods`, a plain confirmation for the reverse) — both directions need a confirm step since neither has any other feedback.

**Per-install target choice** (`GameSettings.crimeboss_install_mode`, `"auto"` default or `"ask"`, set via `set_crimeboss_install_mode` — always writes to the `"cb"` game entry regardless of `activeGame`, since the setting is meaningless elsewhere): lets the user decide the destination up front instead of relying on the move op after the fact. `src/renderer/src/hooks/useCrimeBossInstallTarget.ts` is the single place this is implemented — `runInstall(modId, modName, install)` checks `getSettingsCache('cb')?.settings.crimebossInstallMode` and, when `"ask"`, defers `install` until the user picks in `CrimeBossInstallTargetModal` instead of calling it immediately. There is still no install path that writes directly into `~mods` — choosing "legacy" runs the normal install (always `Mods/`) via `confirmChoice`, then fetches a fresh `get_installed` (not the caller's possibly-stale `installed` prop) to find the entries whose `id` matches and whose `location` is still unset, and relocates each via `moveCrimeBossModTarget`. Wired into all three install entry points that can trigger a _new_ Crime Boss install — `BrowsePage`, `ModDetailPage`'s header, and `DownloadsTab` — but deliberately not reinstall/update, which keep installing wherever the existing tracked entry already lives.

**Enable/disable does not work by moving files** — `commands/mods/crimeboss_settings.rs`. Reverse-engineered against real installs: the game's UGC mod-loader tracks each mod's active state in its own JSON file at `%USERPROFILE%\Saved Games\CrimeBoss\<platform>\Saved\ModSettings\<id>.json` (outside the game install dir entirely — the game redirects its UE `Saved/` folder there), read/written directly by the in-game Options > Mods screen. Moving a mod's files (to a `disabled` subfolder, or anywhere else) has zero effect on this — confirmed live: a mod Modrex moved to `Mods/disabled/<name>/` kept reading `"enabled": "true"` in its settings file indefinitely. The file's `<id>` is **not** derivable from the mod's display name — it's `lowercase(pak_filename without the "CrimeBoss-WindowsNoEditor" suffix)`, e.g. `DallasPDCrimeBoss-WindowsNoEditor.pak` maps to `dallaspd.json` (verified against 10+ real installed mods). Schema: a JSON array of `{"name": ..., "value": ...}` objects (values are strings, even for booleans — `"value": "true"`, not `true`); mods with author-defined custom settings have more entries in the same array that must survive untouched. `crimeboss_settings::sync_enabled` (called from `install.rs`'s `enable_mod_op`/`disable_mod_op`, gated by `cfg.game_id == "cb"`) finds the `enabled` entry and flips its value, leaving everything else alone. Two things this can't do anything about: (1) **the settings file doesn't exist until the game has launched with the mod present at least once** (created lazily, not at install time) — `sync_enabled` no-ops rather than synthesize a guessed schema for a fresh mod; (2) **the platform subfolder name is only verified for Steam** (`"steam"` maps to `"Steam"`) — anything else no-ops rather than guess at an unverified path. Mods built outside the ModKit's standard pipeline (pak doesn't end in `CrimeBoss-WindowsNoEditor`, e.g. older loose `~mods`-only mods like "Total Mission Value") have no UGC object and thus no settings file to sync at all — this is expected, not a bug. Resolved via the `USERPROFILE` env var, matching this codebase's existing pattern for OS-specific paths elsewhere (`epic.rs`'s `PROGRAMDATA` lookup) rather than the Windows known-folder API.

**UE4SS** (Lua scripting/native modding framework, supported on both Crime Boss and PD3) splits into two layers that are handled completely differently, and conflating them is the easiest way to get this wrong:

1. **The loader itself** (`commands/ue4ss.rs`) — modeled like SuperBLT/DAHM (presence-detected, one-shot install, never tracked in state), but parameterized per `(game_id, launcher)` instead of hardcoded to one game, because detection genuinely varies: Crime Boss has one maintained release (proxy `dwmapi.dll`); PD3 has **two independently-maintained mod pages** distributing it over time with **different proxy DLLs** (`xinput1_3.dll` for the newer one, `dxgi.dll` for the older one still in real use — e.g. DebugMenuMod, a live PD3 mod, depends on the older page specifically) — both verified against their real downloaded archives, and detection checks every known name per game so it doesn't matter which release a user has. There is no canonical download URL the way SuperBLT/DAHM have (each release is just somebody's modworkshop mod page, no guaranteed long-term host), so install goes through the _normal_ mod-install flow rather than a dedicated fetch — see `zip.rs`'s `UE4SS_LOADER` sentinel above.
2. **UE4SS sub-mods** (Lua mods other authors publish separately, dropped into the loader's `Mods/` folder) — these _are_ tracked, via the `ue4ss_mods` `ScanTarget` (Directory-unit, marker `Scripts/main.lua`, added to both `PD3_ENGINE` and `CRIMEBOSS_ENGINE`) and a `mods.txt`-file sync (`mods/ue4ss_modstxt.rs`) instead of file-move for enable/disable.

**The hard part is telling the loader, its own bundled framework sub-mods, and a real third-party sub-mod apart — all three can look identical.** Verified against both real downloaded releases: the full loader zip contains a top-level `UE4SS-settings.ini` _and_ ships ~9-10 bundled framework sub-mods (`ActorDumperMod`, `BPModLoaderMod`, `ConsoleCommandsMod`, etc.) inside its own `Mods/` folder, each with the exact same `Scripts/main.lua` shape a genuine standalone sub-mod has. So: `has_ue4ss_loader_signature`'s top-level-`UE4SS-settings.ini` check is what distinguishes "this download is the whole loader" from "this download is one sub-mod" (a sub-mod never carries that file); and `ModUnit::Directory`'s `excluded_names` list (the verified bundled-module names) is what stops those 9-10 internal modules from being ambient-scanned into Modrex's Installed list as if a user had downloaded them — `index_gated_markers` (the mechanism that solves the equivalent DAHM problem) can't apply here, because `modrex-index` only ever hashes `.pak` files and these are plain `.lua` scripts it never sees. `reconcile_state`'s framework-only purge checks `excluded_names` too, so entries that got ambient-scanned into `state.json` _before_ `excluded_names` existed self-heal on the next load rather than needing a manual fix.

- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- PD3 mods are `.pak` files. Active: `{gamePath}/PAYDAY3/Content/Paks/~mods/`. Disabled: `~mods/disabled/foo.pak.disabled`. `gamePath` is the game install root. State: `.modrex.json` inside `~mods/` (was `.pd3mm.json`; migrated transparently on first launch after upgrade; travels with the game folder on dual-boot setups).
- PDTH supports a fourth mod format: `.pdmod` — a ZipCrypto-encrypted ZIP (password `0$45'5))66S2ixF51a<6}L2UK`) containing `pdmod.json` (an `ItemQueue` manifest) plus replacement asset files. `BundlePath` and `BundleExtension` fields in the manifest are Bob Jenkins lookup8 hashes; `commands/mods/pdmod.rs` resolves them via an embedded 130k-entry hashlist (`pdmod_hashlist.txt`, sourced from HW12Dev/PDModExtractor) and writes each asset to `assets/mod_overrides/<mod_name>/<resolved_path>.<resolved_ext>`. `zip.rs::resolve_archive_download` intercepts `.pdmod` files before `detect_archive` (since they are valid ZIPs by magic bytes and would otherwise fall through to the Directory-unit path). Location tag is `"mod_overrides"`.
- PD2 mods come in three flavors: BLT mods (`mod.txt`) and BeardLib mods (`main.xml`) both live in `{gamePath}/mods/` — Modrex scans for either marker (`entry_markers: &["mod.txt", "main.xml"]`); asset-replacement mods (any directory) live in `{gamePath}/assets/mod_overrides/` (`entry_markers: &[]`). Disabled mods of any flavor move to their respective `disabled/` subdirectories. State: `.modrex.json` inside `{gamePath}/mods/`. No numeric priority prefix — BLT/BeardLib load alphabetically. Disabling moves the whole folder; no extension rename. PDTH has BLT mods (`mods/` + `mod.txt`) and DAHM sub-mods (`mods/` + `base.lua`); it also has `mod_overrides` like PD2. PDTH has two loader mods handled as hardcoded exceptions: PDTHModOverrides (id 53474, `DINPUT8.dll` + `PDTHModOverrides.dll`) and DAHM (id 14267, `lightfx.dll`) — both are detected by DLL presence in the game root and installed via dedicated commands rather than the normal mod-install flow. BeardLib mods declare their modworkshop id in `main.xml` (`<AssetUpdates provider="modworkshop" id="N">`); `get_installed` uses this to identify them when the SHA256 hash misses — see the `get_installed` identification pipeline.
- **Host-mod content packs** (PD2): some add-ons (e.g. Menu Backgrounds background sets) carry no marker and no asset structure — they install _inside another mod's_ folder, which the scan-target model can't infer. `host_mods.rs` recognizes them by content signature and routes them via `install_host_pack`; they're tracked with a `host:<id>:<subpath>` `location`. A flat folder of loose files matching no host falls back to `UNRECOGNIZED_ARCHIVE` (the UI shows the author's instructions) rather than being silently dropped into `mod_overrides`. The manager places files and stops: it never writes a host mod's runtime/in-game settings to "activate" a pack (selecting it inside the host mod is the user's job).
- "Launch without mods" for PD3 renames `~mods` → `PAYDAY3/Content/~mods.bak` (one level above `Paks/`) — must be outside `Paks/` because UE5 scans all subdirectories there. For BLT/BeardLib games, `do_restore` and `launch_without_mods` iterate `cfg.targets` — each target gets its own backup (`mods.bak/`, `assets/mod_overrides.bak/`); a target is skipped if its backup doesn't exist. Only user mod subdirectories are moved; `base/` is excluded from the primary target only (BLT recreates it if missing, showing a "base mod missing" dialog). `fs::remove_dir` (not `remove_dir_all`) on cleanup so failed renames are never silently deleted.
- **Mod priority**: UE5 loads `.pak` files alphabetically, so higher prefix number = loads later = overrides earlier mods. Top of `InstalledPage` = highest priority.
- `InstalledMod.uid` is the stable per-file identity for all commands and DnD. `id` is the modworkshop remote ID (can be negative for unrecognized mods). Use `installedMod?.fileId === file.id` to identify installed variant — version string comparison is unreliable.
- `Mod.download` is `| null` even when `mod.has_download` is true — this happens when a mod has files but no default download set. `Mod.download.type` and `ModFile.type` are typed `string | undefined` — the API omits the field for some mods even when the parent object is present. Use `isUnsupportedFormat(type, downloadUrl)` from `src/renderer/src/formatCheck.ts` rather than comparing `.toLowerCase()` directly — it guards both the `type` field and falls back to the URL path extension when `type` is absent.
- **`Mod.download.url` vs `download_url`**: modworkshop has two distinct download object shapes. File-hosted mods: `download.download_url` (CDN URL), `download.type`, `download.size` present, no `url`. External-link mods: `download.url` (third-party site), no `download_url`/`type`/`size`. Detect link-type with `download.url && !download.download_url`. Links also have a separate endpoint `/mods/{id}/links` (→ `ModLink[]`) for a mod's associated external links list — distinct from the default download object.`ModLink` has `url` but no `download_url`, `type`, or `size`.
- `ModDependency.mod` is `Mod | null` — the modworkshop API returns `null` when a dependency mod has been deleted. Always guard with `d.mod !== null` before accessing any field. `allDeps` arrays must be filtered with `.filter((d) => d.mod !== null)` at the source before being passed downstream.
- **modworkshop has two distinct version fields**: `/mods/{id}` returns a `version` field (e.g. `"2.11"`) and `/mods/{id}/files/latest` returns its own `version` field (e.g. `"1.9.4"`). `InstalledMod.version` must store the **mod-level** value so it matches what `getCachedMod` returns and `useModData` can compare them. Never store the file-level version.
- **Mod folders**: arbitrary nesting. `ModFolder.parentId` is `string | null` (null = root). Disk paths built by `get_folder_path` walking the `parentId` chain. Priority scoped to siblings within the same parent.
- Tauri `identifier` is `modrex` (changed from `io.github.shulhaoleh.pd3modmanager` in v0.10.0). `productName` is `Modrex` — Tauri uses this for `userData` path on Windows. The full upgrade chain (Electron → old Tauri identifier → current) is handled by `nsis/installer-hooks.nsi` (removes the old install via its registry uninstall key) and `migrate_from_old_identifier()` / `migrate_from_electron()` in `settings.rs` (migrates app data on first launch).

### Companion repo: modrex-index

`https://github.com/modrexio/modrex-index` — builds and hosts `index.db`. A GitHub Actions workflow (manually/externally triggered via `workflow_dispatch`, no built-in schedule) streams SHA256 of every `.pak` on modworkshop, writes `(sha256, modRemoteId, modName, fileRemoteId, version)` rows. Schema: `games → sources → mods → files`.

## Usage analytics (opt-in telemetry)

Anonymous, opt-in GA4 usage analytics sent from Rust (`commands/analytics.rs`), proxied
through `modrex.net`. Full design + local proxy-testing steps live in
**`.claude/rules/analytics.md`** (loads when you open the analytics code).

## Testing

Rust unit tests live in separate test files referenced from the module via `#[cfg(test)] mod tests;`, or inline in the module file itself. 248 tests across 11 modules — run with `cargo test` inside `src-tauri/`. `tempfile` and `filetime` crates are in `[dev-dependencies]` for filesystem tests; `tokio = { version = "1", features = ["rt", "macros"] }` is in `[dev-dependencies]` (in addition to the production dep) to enable `#[tokio::test]` for async filesystem tests.

- `mods/tests.rs` — pure functions + state I/O (naming, paths, zip, state); multi-target engine routing; `InstalledMod.location` round-trip; four async `find_untracked_paks` filesystem tests (primary=None location, secondary location tag, known-set cross-target isolation, backup-skip per target)
- `launchers/mod_tests.rs` — VDF parser + launcher identification
- `settings_tests.rs` — JSON roundtrip; analytics consent tri-state + anonymous-ID generation
- `mod_index_tests.rs` — in-memory SQLite queries; two-game setup (PAYDAY 3 + PAYDAY 2); cross-game isolation tests verify a PD2 hash never matches PD3 and vice versa
- `thumbnails_tests.rs` — `cleanup_dir` eviction logic (uses `filetime` to set mtime on temp files)
- `superblt_tests.rs` — SuperBLT loader-presence detection across the three loader filenames
- `pdth_overrides_tests.rs` — PDTHModOverrides loader-presence detection (`DINPUT8.dll` required; `PDTHModOverrides.dll` alone is insufficient) + ZIP loader-file extraction overwrite
- `api_tests.rs` — `parse_rate_limit_remaining` header parsing (present/zero/absent/malformed)
- `news_tests.rs` — `parse_news_html` against a saved fixture; `extract_total_pages` against inline WP-PageNavi HTML (both the `.last`-link case and the last-page case where that link is absent); `category_url`/`category_slug` page-segment and game-mapping logic
- `ue4ss_tests.rs` — loader presence detection per game/launcher (including both PD3 proxy DLL variants), unverified-launcher no-ops, directory-named-like-the-proxy-file edge case
- `commands/mods/pdmod.rs` (inline `#[cfg(test)] mod tests`) — `hash64` determinism and known-value round-trip against the embedded hashlist, `safe_output` path-traversal rejection and backslash normalisation, `extract_pdmod` full ZipCrypto round-trip (builds a real encrypted archive in memory, extracts, verifies output path and bytes), unknown-hash skip returning the correct error string

Renderer tests use Vitest (`pnpm test:renderer`). The default environment is `node` (`vitest.config.ts`, matching `src/**/*.test.{ts,tsx}`) — pure-logic test files need no browser APIs. Eight test files, 172 tests:

- `src/renderer/src/formatCheck.test.ts` — `isUnsupportedFormat`: type field, URL extension fallback, tar double-extensions, invalid URLs
- `src/renderer/src/hooks/installedUtils.test.ts` — all eight exports: `syntheticMod`, `getAllModsInFolder`, `filterInstalled`, `normalizeModScopes`, `computeChildren`, `groupChildren`, `groupInstalledByIdentity`, `computeHealthSummary`
- `src/renderer/src/browseCache.test.ts` — TTL/stale logic, cache key isolation (including game isolation via workshopId), categories TTL and per-game independence; uses `vi.resetModules()` + dynamic import for per-test state isolation
- `src/renderer/src/modCache.test.ts` — TTL/expiry for mod/files/links caches, `loadFromStorage` pre-warming and expiry, `scheduleStorage` debounce; `fetchInstalledModsMeta` chunking/partial-failure and its isolation from `modCache`; uses `vi.doMock('./api', ...)` + `vi.stubGlobal('localStorage', ...)` before each dynamic import
- `src/renderer/src/deps.test.ts` — `collectDeps` (direct + template dependency merging), `isLoaderDep`/`isOffsiteDep` classification, `missingRequiredDeps`, `offsiteDepHost`, `isUe4ssLoaderId`/`ue4ssLoaderIdsFor` (both PD3 mod pages recognized, Crime Boss's single one, undefined/unknown-game fallthrough)
- `src/renderer/src/requestPriority.test.ts` — `waitForForegroundClear` recency-window behavior (immediate resolution when idle, waits out the quiet window after `markForegroundActivity`, extends on a repeated mark mid-wait) using fake timers; fresh module per test (`vi.resetModules()`) to avoid cross-test state bleed
- `src/renderer/src/components/ZipPickerModal.test.ts` — `computeAutoUpdateSelection` filename-matching against prior installs (matched/excluded/missing/no-match cases) and `installZipPickerEntries`'s install loop, with `../api` mocked via `vi.doMock`
- `src/renderer/src/components/UpdatesModal.test.tsx` — the one component-rendering test in the suite, using `@testing-library/react` with a per-file `// @vitest-environment jsdom` pragma (rather than switching the global default, so the rest of the suite stays on the faster `node` environment). Verifies the batch "Update All" queue resumes the remaining selected mods on its own after a picker modal (e.g. `ZipPickerModal`) closes, instead of stalling until the user clicks "Update Selected" again

`mods/` submodule uses `#[cfg(test)] pub(crate) use` to re-export private helpers so `tests.rs` can reach them via `use super::*`. The `::zip::` prefix is required in `tests.rs` to reference the external crate (not the local `mod zip` submodule).

## Rules

- **Never run any git command that touches the remote** (push, push tag, delete tag, force push) or is destructive locally (tag -d, reset --hard). Always write out the commands and let the user run them.
- **When adding or updating dependencies** (Cargo.toml or package.json), remind the user to run `pnpm generate-licenses` to update `THIRD_PARTY_LICENSES.md`. The pre-commit hook does this automatically when dep files are staged. CI enforces it via the `check-licenses` job in `ci.yml`.
- **Commit messages must follow conventional commits** — `type(scope): subject` — enforced by `commitlint.config.ts` at commit time. Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`.
- **Prefer `.expect("reason")` over `.unwrap()`** for paths that are infallible in practice (OnceLock init, app path resolution). Prefer `.unwrap_or_else(|e| e.into_inner())` for Mutex guards so a poisoned lock recovers rather than re-panicking. Reserve plain `.unwrap()` for tests only.
- **Never break the in-app update pipeline.** The updater endpoint is `https://github.com/modrexio/modrex/releases/latest/download/latest.json`. Any change to draft/publish behavior, `latest.json` generation, or the startup update check can silently stop all users on the current release from ever receiving future updates. Verify the full pipeline end-to-end when touching anything updater-related.
- **Content Security Policy** lives in `tauri.conf.json` as `csp` (production) + `devCsp` (dev, relaxed with `'unsafe-inline'`/`'unsafe-eval'` and localhost ws/http for Vite HMR). When adding any external resource — image host, iframe/embed provider, web font, or a renderer `fetch` — add its origin to the matching directive in **both** `csp` and `devCsp`. `dangerousDisableAssetCspModification: ["style-src"]` stops Tauri injecting style hashes (which would void `'unsafe-inline'` and break Tailwind/Radix/`createDragImage` inline styles); scripts still get Tauri's nonce injection, so `script-src` stays `'self'`. Mod descriptions render untrusted HTML via `rehypeRaw`, so the CSP is real defense-in-depth — keep it tight.
- **New install entry points** must handle all four archive sentinels in their catch block via `handleInstallSentinel` (`src/renderer/src/installSentinels.ts`) — `ZIP_MULTI_PAK`, `HOST_MOD_PACK`, `CB_FLAT_ARCHIVE`, `UNRECOGNIZED_ARCHIVE`. Missing any one surfaces a raw `**:{...}` string as a user-visible error. See `BrowsePage.handleInstall` for the canonical pattern.
- **External URL opening is gated.** Every renderer call site funnels through the `shell_open_external` command, which runs `sanitize_external_url` (allow `http`/`https`/`mailto` only; reject `cmd`-breakout chars) before shelling out. Mod-description links are attacker-controlled — never bypass this command or pass untrusted URLs to a shell directly. The markdown link handler in `MarkdownContent.tsx` mirrors the scheme allowlist so disallowed links render as plain text.

## Agent skills

Reusable skills live in `.agents/skills/` and are listed in `AGENTS.md`. Available as Claude Code slash commands:

- `/commit` — read the current diff and propose a conventional commit message; waits for confirmation before committing.
- `/deslop` — audit the branch diff for AI-generated slop (unnecessary comments, defensive checks, wrong abstractions, project convention violations) and fix each issue found.
- `/changelog` — add user-facing entries (Keep a Changelog categories: Added/Changed/Fixed/Security) to `CHANGELOG.md`'s `## Unreleased` section for recent commits or uncommitted changes. Run this after any user-facing change, not just at release time — it's what keeps release notes from requiring a re-read of every commit.

**Deferred work**: tracked in `.TODO`. Do NOT act on anything in it unless the user explicitly says "do the TODO: <name>" — never infer intent from the file on your own.

**Releasing**: run `pnpm version patch|minor|major` — bumps `package.json`, commits as `chore(release): X.Y.Z`, creates a `vX.Y.Z` tag. As part of the version bump, `scripts/version.mjs` stamps `CHANGELOG.md`'s `## Unreleased` section into a `## X.Y.Z` section (no brackets, no date — opening a fresh empty `Unreleased` above it) and stages it into the release commit — so `/changelog` entries written before the version number was known land in the right place automatically. Pushing the tag triggers the CI release workflow, which extracts that section (`scripts/changelog-section.mjs`) as the GitHub release body instead of an auto-generated commit dump, and publishes the release as `vX.Y.Z` (not "Modrex vX.Y.Z").
