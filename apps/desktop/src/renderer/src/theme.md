# Colour themes

The app's accent colour is driven by a `data-theme` attribute on `<html>`. The renderer
theme store (`theme.ts`) sets the attribute; `index.css` maps each id to the four accent
custom properties it overrides. Surfaces and semantic status colours never change.

## Modes

- **Automatic (default)** — the accent follows the active game via `GAME_THEMES`
  (`pd3` green, `pd2` blue, `pdth` red, `cb` orange, `raid` dark red).
- **Manual override** — chosen in Settings > Application > Theme and persisted in
  `localStorage` under `modrex:theme-mode`. `App.tsx` calls `syncThemeForGame(activeGame)`
  on game changes, which re-resolves the colour only while mode is automatic.

## Files

| File               | Role                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `src/theme.ts`     | Theme ids, `GAME_THEMES` mapping, mode persistence, `data-theme` application              |
| `src/index.css`    | One `:root[data-theme='<id>']` block per theme with the four `--modrex-accent*` variables |
| `src/i18n/en.json` | `settings.theme.*` labels shown in the picker                                             |

## Adding a game

Add the game to `GAME_THEMES` in `theme.ts`. Its `Record<GameId, ThemeId>` type makes a
missing entry a compile error. Reuse an existing theme id if the game doesn't need a new
colour.

## Adding a colour

1. `theme.ts` `THEMES`: `id: { accent, fill }` (fill is the Settings swatch colour).
2. `index.css`: a `:root[data-theme='<id>']` block with the four accent variables.
3. `en.json`: a `settings.theme.<id>` label.

The picker's "Automatic" swatch builds its gradient from `THEMES`, so no UI change needed.

## Contrast bar

New accent values should meet the same bar as the existing themes (~5:1 accent on dark
surfaces, ~4:1 accent-fill behind button text), and should stay distinct from the danger
colour ramp.
