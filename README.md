<div align="center">

<img src="assets/icon.png" style="width: 10%" alt="Modrex icon" />

# Modrex

[![Latest Release](https://img.shields.io/github/v/release/modrexio/modrex?style=flat-square&label=release)](https://github.com/modrexio/modrex/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/modrexio/modrex/total?style=flat-square)](https://github.com/modrexio/modrex/releases)
[![Windows](https://img.shields.io/badge/Windows-0078D4?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyBmaWxsPSJ3aGl0ZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNDQ4IDUxMiI+PCEtLSEgRm9udCBBd2Vzb21lIEZyZWUgNi43LjIgYnkgQGZvbnRhd2Vzb21lIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20gTGljZW5zZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tL2xpY2Vuc2UvZnJlZSAoSWNvbnM6IENDIEJZIDQuMCwgRm9udHM6IFNJTCBPRkwgMS4xLCBDb2RlOiBNSVQgTGljZW5zZSkgQ29weXJpZ2h0IDIwMjQgRm9udGljb25zLCBJbmMuIC0tPjxwYXRoIGQ9Ik0wIDkzLjdsMTgzLjYtMjUuM3YxNzcuNEgwVjkzLjd6bTAgMzI0LjZsMTgzLjYgMjUuM1YyNjguNEgwdjE0OS45em0yMDMuOCAyOEw0NDggNDgwVjI2OC40SDIwMy44djE3Ny45em0wLTM4MC42djE4MC4xSDQ0OFYzMkwyMDMuOCA2NS43eiIvPjwvc3ZnPg==)](https://github.com/modrexio/modrex/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)](https://github.com/modrexio/modrex/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/tenzpx8JRM)

A desktop mod manager for [PAYDAY 3](https://store.steampowered.com/app/1272080/PAYDAY_3/), [PAYDAY 2](https://store.steampowered.com/app/218620/PAYDAY_2/), [PAYDAY: The Heist](https://store.steampowered.com/app/24240/PAYDAY_The_Heist/), and [Crime Boss: Rockay City](https://store.steampowered.com/app/2933080/Crime_Boss_Rockay_City/) powered by [modworkshop](https://modworkshop.net).

</div>

## Installation

| Platform                                                                                                                                              | Download                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| <img src="assets/icons/windows.svg#gh-light-mode-only" width="16"><img src="assets/icons/windows-white.svg#gh-dark-mode-only" width="16"> Windows     | [Modrex.Setup.exe](https://github.com/modrexio/modrex/releases/latest/download/Modrex_0.11.1_x64-setup.exe) |
| <img src="assets/icons/linux.svg#gh-light-mode-only" width="16"><img src="assets/icons/linux-white.svg#gh-dark-mode-only" width="16"> Linux .deb      | [modrex.deb](https://github.com/modrexio/modrex/releases/latest/download/pd3-mod-manager.deb)               |
| <img src="assets/icons/linux.svg#gh-light-mode-only" width="16"><img src="assets/icons/linux-white.svg#gh-dark-mode-only" width="16"> Linux .rpm      | [modrex.rpm](https://github.com/modrexio/modrex/releases/latest/download/pd3-mod-manager.rpm)               |
| <img src="assets/icons/linux.svg#gh-light-mode-only" width="16"><img src="assets/icons/linux-white.svg#gh-dark-mode-only" width="16"> Linux .AppImage | [modrex.AppImage](https://github.com/modrexio/modrex/releases/latest/download/modrex_0.11.1_amd64.AppImage) |

## Features

- Supports PAYDAY 3, PAYDAY 2, PAYDAY: The Heist, and Crime Boss: Rockay City — switch games from a searchable game picker
- Browse and search mods from modworkshop
- In-app News tab with the latest posts for each game
- Full mod detail page: description, images, downloads, changelog, dependencies, and install instructions
- Rich description rendering: formatted text, tables, collapsible sections, colored text, and inline video embeds (YouTube, Streamable)
- One-click install, uninstall, enable, and disable — supports `.pak`, `.zip`, `.7z`, `.rar`, and `.tar.gz`/`.tar.xz` mods
- Organize mods into folders with arbitrary nesting depth and drag-and-drop reordering
- Mods with multiple installed files grouped as a single card, with per-file management
- Update detection with selective per-mod updates
- Launch modded or vanilla directly from the app
- Automatically detects your game installation (Steam, Epic Games Store, Xbox App)
- One-click install for mod loaders: SuperBLT (PD2), DAHM and PDTHModOverrides (PDTH), UE4SS (PD3, Crime Boss)
- Identifies manually placed mod files via SHA256 lookup against a live mod index
- Automatic update checks with one-click in-app updates

## Requirements

Steam works on Windows and Linux for every supported game. Epic Games Store and Xbox App are Windows-only.

| Game                    | <img src="assets/icons/steam.svg#gh-light-mode-only" width="16"><img src="assets/icons/steam-white.svg#gh-dark-mode-only" width="16"> Steam | <img src="assets/icons/epicgames.svg#gh-light-mode-only" width="16"><img src="assets/icons/epicgames-white.svg#gh-dark-mode-only" width="16"> Epic Games | <img src="assets/icons/xbox.svg#gh-light-mode-only" width="16"><img src="assets/icons/xbox-white.svg#gh-dark-mode-only" width="16"> Xbox App |
| ----------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------: |
| PAYDAY 3                |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                   ![yes](https://img.shields.io/badge/Yes-brightgreen)                                                   |                                             ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |
| PAYDAY 2                |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                   ![yes](https://img.shields.io/badge/Yes-brightgreen)                                                   |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |
| PAYDAY: The Heist       |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                        ![no](https://img.shields.io/badge/No-red)                                                        |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |
| Crime Boss: Rockay City |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                   ![yes](https://img.shields.io/badge/Yes-brightgreen)                                                   |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |

## Troubleshooting

If something goes wrong, attach your log file to a [bug report](https://github.com/modrexio/modrex/issues).

| Platform | Path                               |
| -------- | ---------------------------------- |
| Windows  | `%APPDATA%\Modrex\logs\modrex.log` |
| Linux    | `~/.config/modrex/logs/modrex.log` |

## Development

| Command                  | Description                        |
| ------------------------ | ---------------------------------- |
| `pnpm install`           | Install dependencies               |
| `pnpm dev`               | Start with hot reload              |
| `pnpm build`             | Production build                   |
| `pnpm typecheck`         | Type-check renderer                |
| `pnpm format`            | Format all files with Prettier     |
| `pnpm lint`              | Lint renderer source               |
| `pnpm test`              | Run all tests (Rust + renderer)    |
| `pnpm generate-licenses` | Regenerate THIRD_PARTY_LICENSES.md |

## Tech stack

Tauri v2 · React · Tailwind CSS · Lucide · TypeScript

## License

Modrex is open source under the [MIT License](LICENSE).
