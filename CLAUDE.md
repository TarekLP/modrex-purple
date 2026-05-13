# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app with HMR (main + renderer dev server)
npm run build        # Production build → out/
npm run preview      # Preview production build
npm run typecheck    # Type-check without emitting
npm run format       # Format all files with prettier
npm run format:check # Check formatting without writing
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
```

Run a single test file:

```bash
npx vitest run src/main/steam.test.ts
```

## Architecture

Electron app with three processes wired by `electron-vite`:

- **`src/main/`** — Node.js main process. All OS-level work lives here: API calls, file system operations, Steam registry reads, mod install/uninstall. No DOM access.
- **`src/preload/`** — Thin bridge. Exposes main-process functions to the renderer via `contextBridge`.
- **`src/renderer/`** — React + Tailwind UI. Communicates with main exclusively through IPC — never touches the file system or network directly.
- **`src/shared/`** — TypeScript types shared between main and renderer (e.g. `Mod`, `ModFile`, `Category`).

### Main process modules

- **`api.ts`** — modworkshop REST API calls. `listMods`, `getMod`, `getLatestFile`, `listCategories`, `registerDownload`. All public GET endpoints, no auth token needed. Params sent as query string (Node fetch rejects GET with body).
- **`steam.ts`** — finds PD3 install path by reading Windows registry (`HKLM\SOFTWARE\WOW6432Node\Valve\Steam`) and scanning `libraryfolders.vdf`.
- **`mods.ts`** — mod file operations. Installs `.pak` files to `{gamePath}/Content/Paks/~mods/`, moves to `~mods/disabled/` on disable, removes on uninstall. Tracks state in a JSON file. Pure functions (`addToState`, `removeFromState`, `setEnabled`, `activeModPath`, `disabledModPath`) are exported separately for testing.

### Renderer components

- **`App.tsx`** — shell with sidebar + view switcher. Fetches `gamePath` once on mount and passes it down.
- **`components/Sidebar.tsx`** — nav between Browse and Installed views.
- **`components/BrowsePage.tsx`** — paginated mod grid. Fetches `listMods` + `getInstalled`; handles install/uninstall/enable/disable.
- **`components/InstalledPage.tsx`** — list of installed mods with enable/disable/remove.
- **`components/ModCard.tsx`** — single mod card used by BrowsePage.

### Key domain facts

- **modworkshop game ID for PD3 is `853`** — hardcoded in `api.ts`.
- The modworkshop API at `api.modworkshop.net` requires a `User-Agent` header or returns 403.
- Mod thumbnails: `thumbnail.file` is a bare filename. Full URL: `${THUMBNAIL_BASE_URL}/${file}` where `THUMBNAIL_BASE_URL = 'https://storage.modworkshop.net/mods/images'` (exported from `src/shared/types.ts`).
- PD3 mods are `.pak` files. Active path: `{gamePath}/Content/Paks/~mods/`. Disabled path: `{gamePath}/Content/Paks/~mods/disabled/`.
- Anti-cheat (Nebula) is not a concern — mods work online freely.

## Workflow

- Commits must follow conventional commits: `type(scope): subject`
- Keep commits focused — one logical change per commit
- When writing tests + implementation, commit tests first before writing implementation
