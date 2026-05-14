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

## Requirements

- Windows 10/11
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
