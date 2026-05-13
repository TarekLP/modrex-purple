# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app with HMR (main + renderer dev server)
npm run build        # Production build → out/
npm run preview      # Preview production build
npm run typecheck    # Type-check without emitting
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

### Key domain facts

- **modworkshop game ID for PD3 is `853`** — hardcoded in `src/main/api.ts`.
- The modworkshop REST API at `api.modworkshop.net` requires a `User-Agent` header or returns 403. Most GET endpoints are public (no auth token needed).
- API params are sent as **query string parameters**, not request body — Node's `fetch` (undici) rejects GET requests with a body.
- PD3 mods are `.pak` files. The install path relative to any Steam library root is `steamapps/common/PAYDAY 3`.
- Anti-cheat (Nebula) is not a concern — mods work online freely. Client-side mods work with others in lobby; server-side mods only affect the local player.

### Commit style

All commits must follow conventional commits: `type(scope): subject`.
Keep commits focused — one logical change per commit.
