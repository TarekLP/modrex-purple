<div align="center">

# Modrex

![Demo](assets/logo.png)

</div>

A desktop mod manager for [PAYDAY 3](https://store.steampowered.com/app/1272080/PAYDAY_3/) powered by [modworkshop](https://modworkshop.net/g/payday-3).

## Installation

| Platform        | Download                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Windows         | [Modrex.Setup.exe](https://github.com/modrexio/modrex/releases/latest/download/Modrex_0.8.0_x64-setup.exe) |
| Linux .deb      | [modrex.deb](https://github.com/modrexio/modrex/releases/latest/download/pd3-mod-manager_0.8.0_amd64.deb)  |
| Linux .rpm      | [modrex.rpm](https://github.com/modrexio/modrex/releases/latest/download/modrex-0.8.0-1.x86_64.rpm)        |
| Linux .AppImage | [modrex.AppImage](https://github.com/modrexio/modrex/releases/latest/download/modrex_0.8.0_amd64.AppImage) |

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
- Automatic update checks with one-click in-app updates

## Requirements

| Launcher       | Windows                                              | Linux                                                |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Steam          | ![yes](https://img.shields.io/badge/Yes-brightgreen) | ![yes](https://img.shields.io/badge/Yes-brightgreen) |
| Epic Games     | ![yes](https://img.shields.io/badge/Yes-brightgreen) | ![no](https://img.shields.io/badge/No-red)           |
| Xbox Game Pass | ![yes](https://img.shields.io/badge/Yes-brightgreen) | ![no](https://img.shields.io/badge/No-red)           |

## Troubleshooting

If something goes wrong, attach your log file to a [bug report](https://github.com/modrexio/modrex/issues).

| Platform | Path                |
| -------- | ------------------- |
| Windows  | `%APPDATA%\Modrex\` |
| Linux    | `~/.config/modrex/` |

## Development

```bash
pnpm install
pnpm dev        # start with hot reload
pnpm build      # production build
pnpm typecheck  # type-check renderer
pnpm format     # format all files with prettier
pnpm test       # run Rust unit tests
```

## Tech stack

Tauri v2 · React · Tailwind CSS · Lucide · TypeScript
