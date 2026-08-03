<div align="center">

<img src="assets/icon.png" width="96" alt="Modrex icon" />

# Modrex

[![Latest Release](https://img.shields.io/github/v/release/modrexio/modrex?style=flat-square&label=release)](https://github.com/modrexio/modrex/releases/latest)
[![Downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fmodrex.net%2Fapi%2Fdownloads&style=flat-square)](https://github.com/modrexio/modrex/releases)
[![Windows](https://img.shields.io/badge/Windows-0078D4?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyBmaWxsPSJ3aGl0ZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgNDQ4IDUxMiI+PCEtLSEgRm9udCBBd2Vzb21lIEZyZWUgNi43LjIgYnkgQGZvbnRhd2Vzb21lIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20gTGljZW5zZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tL2xpY2Vuc2UvZnJlZSAoSWNvbnM6IENDIEJZIDQuMCwgRm9udHM6IFNJTCBPRkwgMS4xLCBDb2RlOiBNSVQgTGljZW5zZSkgQ29weXJpZ2h0IDIwMjQgRm9udGljb25zLCBJbmMuIC0tPjxwYXRoIGQ9Ik0wIDkzLjdsMTgzLjYtMjUuM3YxNzcuNEgwVjkzLjd6bTAgMzI0LjZsMTgzLjYgMjUuM1YyNjguNEgwdjE0OS45em0yMDMuOCAyOEw0NDggNDgwVjI2OC40SDIwMy44djE3Ny45em0wLTM4MC42djE4MC4xSDQ0OFYzMkwyMDMuOCA2NS43eiIvPjwvc3ZnPg==)](https://github.com/modrexio/modrex/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)](https://github.com/modrexio/modrex/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/tenzpx8JRM)

A desktop mod manager for [PAYDAY 3](https://store.steampowered.com/app/1272080/PAYDAY_3/), [PAYDAY 2](https://store.steampowered.com/app/218620/PAYDAY_2/), [PAYDAY: The Heist](https://store.steampowered.com/app/24240/PAYDAY_The_Heist/), [Crime Boss: Rockay City](https://store.steampowered.com/app/2933080/Crime_Boss_Rockay_City/), and [RAID: World War II](https://store.steampowered.com/app/414740/RAID_World_War_II/) powered by [modworkshop](https://modworkshop.net) and [Nexus Mods](https://www.nexusmods.com).

<img src="assets/example.png" width="900" alt="Modrex app screenshot" />

</div>

## Installation

Linux:

```sh
curl -fsSL https://modrex.net/install.sh | sh
```

Or grab a specific package:

| Platform                                                                                                                                              | Download                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| <img src="assets/icons/windows.svg#gh-light-mode-only" width="16"><img src="assets/icons/windows-white.svg#gh-dark-mode-only" width="16"> Windows     | [modrex_x86_64.exe](https://github.com/modrexio/modrex/releases/latest/download/modrex_x86_64.exe)           |
| <img src="assets/icons/linux.svg#gh-light-mode-only" width="16"><img src="assets/icons/linux-white.svg#gh-dark-mode-only" width="16"> Linux .deb      | [modrex_x86_64.deb](https://github.com/modrexio/modrex/releases/latest/download/modrex_x86_64.deb)           |
| <img src="assets/icons/linux.svg#gh-light-mode-only" width="16"><img src="assets/icons/linux-white.svg#gh-dark-mode-only" width="16"> Linux .rpm      | [modrex_x86_64.rpm](https://github.com/modrexio/modrex/releases/latest/download/modrex_x86_64.rpm)           |
| <img src="assets/icons/linux.svg#gh-light-mode-only" width="16"><img src="assets/icons/linux-white.svg#gh-dark-mode-only" width="16"> Linux .AppImage | [modrex_x86_64.AppImage](https://github.com/modrexio/modrex/releases/latest/download/modrex_x86_64.AppImage) |

## Features

- Supports PAYDAY 3, PAYDAY 2, PAYDAY: The Heist, Crime Boss: Rockay City, and RAID: World War II, with a searchable game picker
- Browse and search mods from modworkshop, or from Nexus Mods after signing in (every game except RAID)
- In-app News tab with the latest posts for each game
- Full mod detail page: description, images, downloads, changelog, dependencies, and install instructions
- Rich description rendering: formatted text, tables, collapsible sections, colored text, and inline video embeds (YouTube, Streamable)
- One-click install, uninstall, enable, and disable for `.pak`, `.zip`, `.7z`, `.rar`, `.tar.gz`/`.tar.xz`, and `.pdmod` (PDTH) mods
- Organize mods into folders with arbitrary nesting depth and drag-and-drop reordering
- Mods with multiple installed files grouped as a single card, with per-file management
- Health Check scans your entire library and bulk-repairs missing files, broken archives, outdated installs, and missing dependencies
- Update detection with selective per-mod updates
- Launch modded or vanilla directly from the app
- Automatically detects your game installation (Steam, Epic Games Store, Xbox App)
- One-click install for mod loaders: SuperBLT (PD2), DAHM and PDTHModOverrides (PDTH), UE4SS (PD3, Crime Boss), RAID-SuperBLT (RAID)
- Identifies manually placed mod files via SHA256 lookup against a live mod index
- Discord Rich Presence shows the active game on your profile
- Automatic update checks with one-click in-app updates

## Requirements

Steam works on Windows and Linux for every supported game. Epic Games Store and Xbox App are Windows-only.

| Game                    | <img src="assets/icons/steam.svg#gh-light-mode-only" width="16"><img src="assets/icons/steam-white.svg#gh-dark-mode-only" width="16"> Steam | <img src="assets/icons/epicgames.svg#gh-light-mode-only" width="16"><img src="assets/icons/epicgames-white.svg#gh-dark-mode-only" width="16"> Epic Games | <img src="assets/icons/xbox.svg#gh-light-mode-only" width="16"><img src="assets/icons/xbox-white.svg#gh-dark-mode-only" width="16"> Xbox App |
| ----------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------: |
| PAYDAY 3                |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                   ![yes](https://img.shields.io/badge/Yes-brightgreen)                                                   |                                             ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |
| PAYDAY 2                |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                   ![yes](https://img.shields.io/badge/Yes-brightgreen)                                                   |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |
| PAYDAY: The Heist       |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                        ![no](https://img.shields.io/badge/No-red)                                                        |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |
| Crime Boss: Rockay City |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                   ![yes](https://img.shields.io/badge/Yes-brightgreen)                                                   |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |
| RAID: World War II      |                                            ![yes](https://img.shields.io/badge/Yes-brightgreen)                                             |                                                        ![no](https://img.shields.io/badge/No-red)                                                        |                                                  ![no](https://img.shields.io/badge/No-red)                                                  |

## Troubleshooting

If something goes wrong, attach your log file to a [bug report](https://github.com/modrexio/modrex/issues). The easiest way to get it is from inside the app: **Settings > Logs > Open log file**. If the app won't start, grab it directly:

| Platform | Path                                    |
| -------- | --------------------------------------- |
| Windows  | `%LOCALAPPDATA%\Modrex\logs\Modrex.log` |
| Linux    | `~/.local/share/modrex/logs/Modrex.log` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, commands, and commit style.

## License

Modrex is open source under the [MIT License](LICENSE).
