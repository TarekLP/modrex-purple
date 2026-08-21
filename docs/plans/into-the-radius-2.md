# Into the Radius 2 support

Feature plan (not yet implemented). Add ITR2 as Modrex's first Nexus-only game (it has
no modworkshop presence). ITR2 is UE5 but not a "typical UE pak game": it ships a nested
install layout and four distinct mod formats routed by content signature. The Vortex
extension for ITR2 (`ITR-MOD/ITR-VORTEX`, no LICENSE file) and Merith-TK's
`game-intotheradius2-modformat` repo are the authoritative format specs; where they
disagree, follow the modformat docs (written by someone who knows the loader).

## Verified game facts (from real install, Steam)

- Steam app id `2307350`, installdir `IntoTheRadius2` (no spaces — SteamDB's installdir
  matches the real folder; a path like `Into The Radius 2` is only the user's description).
- Root exe `IntoTheRadius2.exe` (what Steam launches and Vortex requires).
- Real game process `IntoTheRadius2-Win64-Shipping` under
  `IntoTheRadius2/Binaries/Win64/`.
- **Nested layout**: the game content is NOT at the game root. Structure:
    ```
    steamapps/common/IntoTheRadius2/          ← game_path (Steam installdir)
      IntoTheRadius2.exe                      ← launcher exe (root)
      Engine/                                 ← UE5 engine bits
      IntoTheRadius2/                         ← the real game folder (nested!)
        Binaries/Win64/IntoTheRadius2-Win64-Shipping.exe
        Content/Paks/                         ← vanilla: global.ucas/.utoc,
                                                pakchunk0-Windows.{pak,ucas,utoc},
                                                pakchunk0optional-Windows.*
        Content/ITR2/IniSettings/Settings.ini ← ini-settings mods go here
        Plugins/
    ```
    Consequence: every mod target's `mods_subpath` starts with `IntoTheRadius2/` (the
    Vortex plugin prefixes the same way). `SteamDef.folder_name = "IntoTheRadius2"` with
    `executables = ["IntoTheRadius2.exe"]` resolves cleanly via `is_installation` (root exe
    check). Epic/Xbox: none.

## ITR2 mod formats (four types, content-routed)

Paths are relative to game_path. Confirmed against the real install (no mod folders exist
in a vanilla install; `Content/Mods`, `Paks/Mods`, `Paks/LuaMods`, `Paks/LogicMods` are all
absent until a mod installer creates them).

1. **SML mods** — `IntoTheRadius2/Content/Mods/<name>/`. Identified by a `.uplugin` that
   shares its base name with the accompanying `.pak/.ucas/.utoc`. All four files sit in a
   folder named after the mod. A `.uplugin` in a standard pak mod redirects it here. Follow
   the modformat doc (`Content/Mods/`) even though the Vortex GitHub `main` branch routes
   `.uplugin` to `Mods/` (no `Content`) — the doc is canonical. This is distinct from the
   SML **loader** (Nexus mod 57), whose real install steps put its extracted files in
   `IntoTheRadius2/Content/Paks/Mods` — the loader is pak-only and routes through the
   standard `paks` target, not `sml`.
2. **Standard PAK mods** — `IntoTheRadius2/Content/Paks/Mods/<name>/`. A pak whose parent
   folder is `Mods/`. May be flat (`example-root.pak`) or per-mod folder
   (`<name>/example-folder.pak`).
3. **LogicMods** — `IntoTheRadius2/Content/Paks/LogicMods/<name>/`. The pak must be nested
   under `<name>/LogicMods/` in the archive; the **grandparent folder** becomes the mod
   name. A pak directly under `<name>/` is treated as a standard pak mod.
4. **Lua mods (UE4SS)** — `IntoTheRadius2/Content/Paks/LuaMods/<name>/`. Identified by
   `enabled.txt` + `Scripts/main.lua`. Shared libraries go to
   `LuaMods/shared/<name>/` (no `enabled.txt`).

UE4SS loader placement: `dwmapi.dll` → `IntoTheRadius2/Binaries/Win64/`, `UE4SS.dll` +
`UE4SS-settings.ini` → `IntoTheRadius2/Content/Paks/`, `Mods` renamed `LuaMods` →
`IntoTheRadius2/Content/Paks/LuaMods/`.

Nexus ids: ITR2 domain `intotheradius2`, numeric id `6632`. ITR1 (separate, later):
domain `intotheradiusvr`, numeric id `4286`, Steam app `1012790`, folder `IntoTheRadius`,
exe `IntoTheRadius.exe`, UE4, paks into `Content/Paks` requiring `_P` filename suffix.

## Implementation plan

### 1. Backend — Rust

- **`launchers/games/itr2.rs`** (new): `GameDef { name: "Into the Radius 2",
executables: ["IntoTheRadius2.exe"], process_names: ["IntoTheRadius2-Win64-Shipping"],
steam: Some(SteamDef { app_id: 2307350, folder_name: "IntoTheRadius2" }) }`.
  Epic/Xbox: `None`.
- **`launchers/games/mod.rs`**: `mod itr2; pub use itr2::ITR2;`
- **`commands/games.rs`**: append `GameSpec { id: "itr2", engine: &ITR2_ENGINE, def: &ITR2 }`.
  Conformance tests cover registry invariants automatically.
- **`commands/mods/engine.rs`** — `ITR2_ENGINE`, four targets, `SignalSource::None`,
  every `mods_subpath` prefixed `IntoTheRadius2/`:
    - `sml` → `IntoTheRadius2/Content/Mods`
    - `paks` → `IntoTheRadius2/Content/Paks/Mods`
    - `logicmods` → `IntoTheRadius2/Content/Paks/LogicMods`
    - `lua_mods` → `IntoTheRadius2/Content/Paks/LuaMods`
    - disabled/backup subpaths follow the existing `<dir>/disabled`, `<dir>.bak` pattern.
- **`commands/sources.rs`**: add ITR2 to **nexus only** (`native_id: "intotheradius2"`,
  `numeric_id: Some(6632)`). No modworkshop entry → first Nexus-only game; existing tests
  (`every_modworkshop_game_has_no_numeric_id`, `every_nexus_game_has_a_numeric_id`) hold.
- **`commands/mods/zip.rs`**: `resolve_intotheradius_archive` gated by `cfg.game_id ==
"itr2"`, porting the Vortex routing table:
    - `.uplugin` + same-base pak → `sml`
    - `enabled.txt` + `Scripts/main.lua` → `lua_mods`
    - pak with `LogicMods/` parent → `logicmods` (grandparent name)
    - else → `paks`
      Mixed-type archives route per-group via the existing ZipMultiPak picker (same shape as
      `resolve_crimeboss_archive` and the `pdmod` intercept).

### 2. Renderer / shared

- **`packages/games/index.ts`**: `workshopId` becomes optional (`workshopId?: number`);
  add `itr2` spec with `nexusDomain: 'intotheradius2'`, `launchers: ['Steam']`, the four
  `modTargets` paths. Guard the one `workshopId` consumer (BrowsePage).
- **`App.tsx`**: `readBrowseSource` fallback becomes the first source the game actually
  offers (`sourcesForGame(gameId)[0]`) instead of hardcoded `'modworkshop'`; verify the
  modworkshop browse-pane gating (line ~618) holds when a game has no modworkshop source.
- **`theme.ts`** (`GAME_THEMES`) + **`en.json`**: game name and target labels (i18n policy:
  `en.json` only).

### 3. Consistency checks + index

- **`check-sources.mjs`**: no change needed — a Nexus-only game maps no modworkshop id on
  either side, so the Rust↔TS diff stays symmetric.
- **`check-games.mjs`**: add `itr2: 'itr2'` to `gameFiles` and `itr2: 'ITR2'` to
  `engineNames`.
- **`apps/index`**: per-game snapshot needed for `index_game_name: "Into the Radius 2"`;
  without it identification degrades to name-matching only.

### 4. Tests

- Unit tests for the resolver routing table: each of the four archive shapes plus a mixed
  archive. Conformance suite auto-covers registry invariants.

## Open items (verify against real mods before finalizing)

- `lua_mods` shared-library case (`LuaMods/shared/<name>/` carries no `enabled.txt`) —
  likely `excluded_names`/marker nuance.
- Which target is `primary()` — drives `.modrex.json` location and the install default.
- SML destination discrepancy: modformat says `Content/Mods/`, Vortex GitHub `main` says
  `Mods/`. Real Nexus pages (MCM mod 171, Revive System mod 231) confirm the loader
  (mod 57) installs to `Content/Paks/Mods` — a pak-only archive the `paks` target routes
  correctly — while `.uplugin`-based SML mods stay in `Content/Mods` per modformat. The one
  unverified case: whether mod 57's archive ships a `.uplugin` (which would misroute it to
  `sml`); test against a real SML loader download.
- Install as Nexus-only depends on the Nexus browse path already present in the renderer
  (`sources.ts`, `SourceSelect`, BrowsePage nexus branch, `BetaBadge` marks nexus beta).

## Scope notes

- Nexus fetch tool 403s on direct nexusmods.com fetches; GitHub repos (`modformat`,
  `ITR-VORTEX`) are the reliable sources for format facts.
- ITR1 is the same shape but a separate later feature (user-owned requirement is ITR2
  first).
