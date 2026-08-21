# Pak viewer

Feature plan (implemented). In the Installed mods section, a button on a pak mod
opens a modal listing the assets the pak contains/modifies. PD3 and Crime Boss
paks are AES-encrypted; per-game keys are baked into the sidecar and overridable
in Settings. FModel itself is GUI-only with no official headless mode, so the
"headless FModel" engine is a bundled CUE4Parse console sidecar.

## Engine: CUE4Parse sidecar

- .NET 10 console built on CUE4Parse, published as a self-contained single file
  by `scripts/build-pakviewer.mjs` into `pakviewer/dist/` (win-x64 / linux-x64),
  globbed into the bundle as a resource.
- CLI: `--pak <file> --game <pd3|cb> [--aes <key>] [--usmap <file>]` -> JSON on
  stdout with readable entry paths, per-asset size, and object-level names when
  a usmap is supplied. Exit 0 = listed, 1 = listing failed (reason on stderr),
  2 = bad arguments.
- Both games are UE 4.27 (`EGame.GAME_UE4_27`). Baked keys: PD3
  `27DFBADB...`, CB `40A34FBE...`; `--aes` (a user Settings override) always wins.
- Why not pure-Rust `repak`: CUE4Parse natively handles the AES + obfuscated
  index, the .usmap mapping, and CB's IoStore (`.ucas/.utoc`). `repak` does
  none of those.
- Not a Tauri sidecar (`externalBin`/`tauri-plugin-shell`): spawned with
  `tokio::process::Command` from `app.path().resource_dir()` in prod, from
  `pakviewer/dist/` in dev.

## Rust backend (`apps/desktop/src-tauri`)

- `list_pak_assets(game_id, uid)` — resolve the mod's pak path via the mods
  engine (`resolve_pak_path`: `ue4ss_mods`/`host:`/missing → error; directory
  units navigate `Content/Paks/WindowsNoEditor`, file units use active/disabled
  path incl. `.pak.disabled`), spawn the sidecar, return `Vec<PakAsset>`.
- `get_pak_viewer_config(game_id)` → `{hasAesOverride, usmapPath}` (the AES key
  itself never crosses IPC); `set_pak_aes_key(game_id, key)` (hex validated,
  empty clears); `set_pak_usmap_path(game_id, path|null)`.
- Commands registered in `ipc_builder()`, bindings regenerated, `api.ts`
  wrappers added (check-commands enforces the 1:1; 89 commands).

## Renderer

- Settings, Pak viewer section: AES key (Bundled/Custom badge, per game) and
  `.usmap` mapping path (manual text input — no file picker exists). Applied to
  both pd3 and cb.
- InstalledModItem: archive button gated to pak-based games (`pd3`, `cb`;
  PD2/PDTH/RAID are Diesel — hidden), and to mods with a resolvable pak
  (not `ue4ss_mods`, not `host:`-located, not missing).
- PakViewerModal: collapsible folder tree from asset paths, search, match/total
  count summary, per-asset class + size; error states (missing AES / wrong key).

## Scope notes

- New strings go in `en.json` only (i18n policy).
- CUE4Parse is MIT — noted in `pakviewer/README.md`.
- `.usmap` files are per game-version; the user supplies the path (same as
  FModel). Classic `.pak` only in v1.
- Windows-first; self-contained sidecar is ~45 MB.

## Verification

- Sidecar run against real PD3 and CB paks with the baked keys -> readable
  paths, exit 0 (CB `pakchunk0-WindowsNoEditor.pak`: 4226 assets). `.pak.disabled`
  opens via pak magic. `.usmap` path validated via the Settings input.
- Modal tree/search in the desktop app; `pnpm checks` + `cargo test` clean.

## Small note about PAYDAY 3 (PD3)

- PAYDAY 3 is undergoing an update to Unreal engine 5.5.4 this August 2026
- While currently the game is on UE 4.27 and is accessible without a USMap, starting with this Update the pak viewer will need a USMap to access all of the game files properly.
