# CLAUDE.md

This file is the canonical guide for the Modrex product monorepo.

## Repository structure

| Path | Purpose |
| --- | --- |
| apps/desktop/ | Tauri v2 desktop application (Rust + React) |
| apps/site/ | Astro marketing and documentation site |
| apps/index/ | Mod-identification index builder |
| packages/games/ | Shared declarative game data (added after structural migration) |
| install.config.json | Root-level public contract consumed by modrex.net/install.sh |

Read the CLAUDE.md inside the relevant application before working in it. During the
migration, applications not yet under apps/ remain in their existing repositories and
continue operating independently.

## Root commands

The root commands currently delegate to the desktop application so the established
developer workflow remains valid while the workspace is assembled:

```sh
pnpm install
pnpm dev
pnpm build
pnpm checks
pnpm test
pnpm release:desktop patch|minor|major
```

Project-specific commands can also be run from the application directory.

## Permanent compatibility contracts

- Bare vX.Y.Z tags and GitHub Releases belong to the desktop application.
- install.config.json stays at the repository root.
- Existing desktop clients continue downloading index.db from the
  modrexio/modrex-index repository's latest-index release.
- modrexio/mget remains an independent repository and tag host.
- Never run a git command that touches a remote. Write the command for the owner instead.
- Never commit unless the owner explicitly approves the reviewed step.

See docs/architecture/monorepo-migration.md for migration order and invariants.
