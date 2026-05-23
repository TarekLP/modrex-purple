<div align="center">

# PD3 Mod Manager

![Demo](assets/logo.png)

</div>

A desktop mod manager for [PAYDAY 3](https://store.steampowered.com/app/1272080/PAYDAY_3/) powered by [modworkshop](https://modworkshop.net/g/payday-3).

## Installation

| Platform        | Download                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Windows         | [PD3.Mod.Manager.Setup.exe](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/PD3.Mod.Manager.Setup.exe) |
| Linux .deb      | [pd3-mod-manager.deb](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/pd3-mod-manager.deb)             |
| Linux .rpm      | [pd3-mod-manager.rpm](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/pd3-mod-manager.rpm)             |
| Linux .AppImage | [pd3-mod-manager.AppImage](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/pd3-mod-manager.AppImage)   |

## Features

- Browse and search mods from modworkshop
- Full mod detail page: description, images, downloads, changelog, dependencies, and install instructions
- Rich description rendering: formatted text, tables, collapsible sections, colored text, and inline video embeds (YouTube, Streamable)
- One-click install, uninstall, enable, and disable
- Organize mods into folders with arbitrary nesting depth and drag-and-drop reordering
- Mods with multiple installed files grouped as a single card
- Update detection with selective per-mod updates
- Launch modded or vanilla directly from the app
- Automatically detects your PD3 installation (Steam, Epic Games, Xbox Game Pass)
- Identifies manually placed .pak files via SHA256 lookup against a live mod index

## Requirements

| Launcher       | Windows                                              | Linux                                                |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Steam          | ![yes](https://img.shields.io/badge/Yes-brightgreen) | ![yes](https://img.shields.io/badge/Yes-brightgreen) |
| Epic Games     | ![yes](https://img.shields.io/badge/Yes-brightgreen) | ![no](https://img.shields.io/badge/No-red)           |
| Xbox Game Pass | ![yes](https://img.shields.io/badge/Yes-brightgreen) | ![no](https://img.shields.io/badge/No-red)           |

## Troubleshooting

If something goes wrong, open **Settings → Open log file** and attach it to your [bug report](https://github.com/ShulhaOleh/pd3-mod-manager/issues).

Log file locations:

| Platform | Path                                      |
| -------- | ----------------------------------------- |
| Windows  | `%APPDATA%\pd3-mod-manager\logs\main.log` |
| Linux    | `~/.config/pd3-mod-manager/logs/main.log` |

## Development

```bash
pnpm install
pnpm dev        # start with hot reload
pnpm build      # production build to out/
pnpm typecheck  # type-check
pnpm test       # run tests
```

## Tech stack

Electron · React · Tailwind CSS · electron-vite · TypeScript · Vitest
