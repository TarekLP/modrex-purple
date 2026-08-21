# Halo: Campaign Evolved (HCE) support

Feature plan (research complete, **implemented and green as of 2026-08-17**). HCE is
Modrex's second Nexus-only game (no modworkshop presence), like ITR2. HCE is a UE 5.5.x mod
for Halo CE's engine, distributed free via Steam, Xbox App / Game Pass, and Nexus. It
supports two mod formats (UE4SS Lua + PAK) plus an ASI hook loader.

## Implementation status

All planned work is landed and verified:

- `pnpm checks` passes (exit 0): check-games (7), check-sources (6 nexus), check-commands
  (90), format, lint, typecheck (incl. Astro + new HCE docs page), all renderer tests.
- `cargo test` 480 pass incl. `asi_detects_either_proxy_dll_in_the_binaries_folder`;
  `cargo clippy --all-targets` clean with `-D warnings`.
- HCE is fully wired end-to-end: Rust registry, engines, loaders, sources, ue4ss descriptor,
  Welcome screen (Steam CDN banner + green accent), theme, site docs page.
- Cover image: HCE's Steam app page has no `library_600x900.jpg` (404); the only standard
  portrait image is the store `library_capsule_2x.jpg` (600x900) served from
  `shared.fastly.steamstatic.com`, which was added to `img-src` in both `csp` and `devCsp`.
  WelcomeScreen uses that URL.
- Skill reviews on the HCE diff (danger-audit, deslop, ai-review) all clean — no blocker
  patterns, no slop, no comments to strip.

### Verified against the owner's live install (`D:\Games\Halo.Campaign.Evolved`)

- The `~mods/` folder holds BOTH loose paks and subfolders of paks (`cortana/`, `kat_ears/`,
  `Superior Marines/`); each pak ships as a `.pak` + `.ucas` + `.utoc` triple. The File-unit
  scan recurses into subdirs (mod.rs `scan_active`), so subfolder paks are found too.
- The `.pak`/`.ucas`/`.utoc` triple is fully handled: `copy_file_with_sidecars`,
  `rename_with_sidecars`, `remove_file_with_sidecars` (install.rs), and
  `extract_entry_with_sidecars` (zip.rs) carry IoStore siblings through install, enable,
  disable, uninstall, and priority-prefix renaming (`sidecar_path` keys on the stem, so
  `003_Halo_CE_Viewmodels_P.pak` correctly drags `003_..._P.ucas`/`.utoc`). This is the same
  game-agnostic machinery Crime Boss uses.
- **`.baboon` files** (`Halo_CE_Viewmodels_P.baboon`): SQLite DBs (`project`/`tabs`/`overlays`
  tables pointing at weapon tag paths) — the "Baboon" HCE tag-overlay editor's project state.
  Modrex treats them as untracked and does NOT carry them through File-unit ops. Owner is
  unsure whether the Reach-engine-under-UE hybrid reads them at runtime, so this is
  **deliberately left untracked pending an in-game test**; if toggling a `.baboon`-carrying
  mod proves the game needs it, add `baboon` to that mod's companion handling.
- UE4SS `Mods/` contains HCE's own framework sub-mods NOT in `UE4SS_BUNDLED_SUBMODS`:
  `HCEBPModLoaderMod`, `HCEConsoleCommandsMod`, `HCEConsoleEnablerMod`, `CinematicFGFix`
  (all enabled via `mods.txt`/`enabled.txt`). They would ambient-scan as fake user mods;
  see Open items.

Deviations from the plan below (all owner-approved):

- **Xbox product_id**: shipped as `MODREX_PLACEHOLDER` (see hce.rs comment + Open items).
- **loaders.rs**: detection uses the new `DetectStrategy::FilesInDir { subpath, files }`
  variant (nested Binaries dir, either `version.dll` or `winmm.dll`); install uses the new
  `InstallStrategy::ExtractEntriesInto { url, entries, subpath }` variant (extract into the
  nested Binaries dir instead of the game root). Both are small, load-bearing extensions,
  not fake abstractions — the ASI loader genuinely needs a nested destination.
- **Site docs**: HCE gained a real docs page
  (`apps/site/src/content/docs/docs/games/halo-campaign-evolved.mdx`) plus an `hce` entry in
  `docsGameRegistry` — required because the site's `docsGameRegistry satisfies Record<GameId,
...>` and `docsGames.test.ts` both fail to typecheck once GameId grows.

## Verified game facts

- Steam app id `2806050`, installdir `Halo Campaign Evolved`.
- Internal UE5 project codename **Meteorite**. The exe and all game binaries live at the
  nested `Meteorite/Binaries/Win64/` folder — there is no `HaloCampaignEvolved.exe` at the
  install root, so `GameDef.executables` is the nested relative path (Steam and manual
  copies both resolve; a folder picked by hand is recognised as a real install). Running
  process `HaloCampaignEvolved-Win64-Shipping`.
- Storefronts chosen for first pass: **Steam** + **Xbox App / Game Pass** (WinGDK).
  WinGDK loader behaviour is unverified; the Xbox launcher def ships with a **placeholder
  product_id** (owner-confirmed) so real Game Pass installs are not detected until the real
  id lands. Steam remains the verified path.
- Nexus: domain `halocampaignevolved`, numeric id `9685` (~232 mods). Nexus-only → stays
  out of `apps/index/modworkshop-games.ts` and the modworkshop browse pane (BrowsePage is
  gated on `hasSource(...)`).

## Mod formats

1. **PAK mods** — user-confirmed: `Meteorite/Content/Paks/~mods/`, PD3-style File-unit
   (numeric priority prefix, `.pak`/`.ucas`/`.utoc`). This supersedes the wiki's
   "~mods unconfirmed" note. Mirrors PD3 paks exactly.
2. **UE4SS Lua mods** — `Meteorite/Binaries/Win64/ue4ss/Mods/<name>/Scripts/main.lua`
   (Directory-unit, mirrors PD3/CB/ITR2). Requires the UE4SS loader (see below).
3. **ASI mods (.asi)** — sit next to the executable in `Meteorite/Binaries/Win64/` and load
   via the Ultimate ASI Loader hook. **Loader-only scope**: Modrex installs/detects the ASI
   loader but does not track `.asi` files as mods (owner decision). Your launch_without_mods
   idea — temporarily move the `.asi` files out of the exe folder — is the right future
   mechanism and is documented as a designed extension point, NOT implemented now: a File-unit
   target whose `mods_subpath` is the exe folder is impossible anyway (`do_restore` renames the
   whole mods dir, which would move the game exe).

### UE4SS loader (HCE)

UE4SS for HCE is distributed as Nexus mod 9 ("UE4SS for Halo Campaign Evolved"; mods 53/58
also carry instructions). UE 5.5.x → needs UE4SS **experimental**, not stable 3.0.1.

- Loader: proxy `dwmapi.dll` + `ue4ss/` folder → `Meteorite/Binaries/Win64/`.
- Sub-mods: `ue4ss/Mods/<name>/Scripts/main.lua` (Directory-unit).
- Loader package recognised by top-level `UE4SS-settings.ini` → `ResolveError::Ue4ssLoader`
    - `has_ue4ss_loader_signature`, exactly like PD3/CB.
- Steam "verify integrity" deletes UE4SS.
- WinGDK: unsupported until verified (mirrors CB/PD3 Game Pass handling).

### ASI loader (Ultimate ASI Loader, ThirteenAG)

- Source: https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases — proxy DLLs
  `dinput8.dll`/`version.dll`/`winmm.dll` dropped next to the executable. x64 zips:
  `version-x64.zip`, `winmm-x64.zip`. The HCE Input Latency Fix mod page instructs
  "version.dll or winmm.dll" next to the exe.
- Modrex installs `version.dll` from `version-x64.zip` into `Meteorite/Binaries/Win64/`.
- Detection: `version.dll` **or** `winmm.dll` present in `Meteorite/Binaries/Win64/`
  (either counts; mirrors PD3 UE4SS's dual-DLL handling).
- Loader registry entry: `id: "asi"`, `games: ["hce"]`, GitHub release URL, `ExtractEntries`.
  Install destination must be the nested `Meteorite/Binaries/Win64/`, not game root → needs
  a small extension to the loader install path (see plan).
- Not tracked in state.json, never uninstallable through Modrex (same model as UE4SS/DAHM).

## Implementation plan

### 1. Backend — Rust

- **`launchers/games/hce.rs`** (new): `GameDef { name: "Halo: Campaign Evolved",
executables: ["HaloCampaignEvolved.exe"], process_names:
["HaloCampaignEvolved-Win64-Shipping"], steam: Some(SteamDef { app_id: 2806050,
folder_name: "Halo Campaign Evolved" }), xbox: Some(XboxDef { product_id:
"<PLACEHOLDER>", executable: "Meteorite/Binaries/WinGDK/HaloCampaignEvolved.exe" }) }`.
- **`launchers/games/mod.rs`**: `mod hce; pub use hce::HCE;`
- **`commands/games.rs`**: append `GameSpec { id: "hce", engine: &HCE_ENGINE, def: &HCE }`.
  Conformance tests auto-cover registry invariants.
- **`commands/mods/engine.rs`** — `HCE_ENGINE`, `SignalSource::None`, two targets:
    - `paks` → `Meteorite/Content/Paks/~mods` (File-unit, `.pak`, `.disabled`, priority
      prefix, PD3-style)
    - `ue4ss_mods` → `Meteorite/Binaries/Win64/ue4ss/Mods` (Directory-unit, marker
      `Scripts/main.lua`, `excluded_names: UE4SS_BUNDLED_SUBMODS`)
    - disabled/backup subpaths follow the existing `<dir>/disabled`, `<dir>.bak` pattern.
      State filename `.modrex.json`.
- **`commands/ue4ss.rs`**: add `("hce", "steam")` → `dwmapi.dll` into
  `["Meteorite", "Binaries", "Win64"]`.
- **`commands/loaders.rs`**: add the `asi` loader entry. Detection strategy for a nested
  binaries dir with two accepted DLL names (either `version.dll` or `winmm.dll`); install
  must extract `version.dll` from the GitHub `version-x64.zip` into
  `Meteorite/Binaries/Win64/` (nested, not game root).
- **`commands/sources.rs`**: add HCE to **nexus only** (`native_id:
"halocampaignevolved"`, `numeric_id: Some(9685)`).

### 2. Renderer / shared

- **`theme.ts`** `GAME_THEMES`: `hce: 'green'` (owner-confirmed).
- **`WelcomeScreen.tsx`**: game entry, same shape as ITR2 (hero + blur, source badge
  Nexus).
- **`shared/types.ts`**: `GameId` union already extended with `'hce'` on the itr2 branch.

### 3. Consistency checks

- **`check-games.mjs`**: 6 → 7 games.
- **`check-sources.mjs`**: nexus 5 → 6.
- i18n: `en.json` only for any new strings, then `pnpm i18n:fill de`.

### 4. Tests + verification

- Conformance suite auto-covers registry invariants (unique target tags, disabled/backup
  dir invariants, state round-trip, store detection).
- Loader registry invariants (unique ids, games registered, modworkshop ids don't collide).
- UE4SS descriptor test for `("hce", "steam")`.
- Run `pnpm checks`, then danger-audit / deslop / ai-review skills on the diff.

## Open items

- Xbox `product_id` placeholder must be replaced with the real Store id (from the Microsoft
  Store listing for Halo: Campaign Evolved) and the WinGDK exe name verified before Game
  Pass auto-detection can work.
- WinGDK UE4SS / ASI loader behaviour unverified — unsupported until confirmed.
- HCE's shipped UE4SS framework sub-mods (`HCEBPModLoaderMod`, `HCEConsoleCommandsMod`,
  `HCEConsoleEnablerMod`, `CinematicFGFix`) are not in `UE4SS_BUNDLED_SUBMODS` and would
  ambient-scan as fake user mods. Confirm they are shipped with the loader (not user-placed)
  before adding them to the exclusion list.
- `.baboon` companion handling: pending the owner's in-game test of whether the game reads
  them at runtime (see status section).

## Scope notes

- Nexus-only games stay out of `apps/index/modworkshop-games.ts` (invariant: game served by
  modworkshop ⟺ `workshopId` present).
- Nexus direct fetches 403; use websearch / fetch-and-index for research.
- `.asi` mods are loader-only for now. The future launch_without_mods mechanism (move
  individual `.asi` files, never rename the exe folder) is recorded here so the design
  constraint isn't lost.
