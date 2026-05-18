<div align="center">

# PD3 Mod Manager

![Demo](assets/logo.png)

</div>

A desktop mod manager for [PAYDAY 3](https://store.steampowered.com/app/1272080/PAYDAY_3/) powered by [modworkshop](https://modworkshop.net/g/payday-3).

## Features

- Browse and search mods from modworkshop
- Full mod detail page: description, images, downloads, dependencies, and install instructions
- One-click install, uninstall, enable, and disable
- Update detection with selective per-mod updates
- Launch modded or vanilla directly from the app
- Automatically detects your PD3 installation via Steam registry
- Identifies manually placed .pak files via SHA256 lookup against a live mod index

## Installation

| Platform        | Download                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Windows         | [PD3.Mod.Manager.Setup.exe](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/PD3.Mod.Manager.Setup.exe) |
| Linux .deb      | [pd3-mod-manager.deb](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/pd3-mod-manager.deb)             |
| Linux .rpm      | [pd3-mod-manager.rpm](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/pd3-mod-manager.rpm)             |
| Linux .AppImage | [pd3-mod-manager.AppImage](https://github.com/ShulhaOleh/pd3-mod-manager/releases/latest/download/pd3-mod-manager.AppImage)   |

## Requirements

- Windows 10/11 or Linux
- Steam version of PAYDAY 3

## Development

```bash
npm install
npm run dev        # start with hot reload
npm run build      # production build → out/
npm run typecheck  # type-check
npm test           # run tests
```

## Tech stack

Electron · React · Tailwind CSS · electron-vite · TypeScript · Vitest
