# Monorepo Migration Contract

Status: approved for implementation on 2026-07-21. The August-release sequencing gate
was explicitly overridden by the project owner.

This document defines the invariants and review boundaries for moving the Modrex product
repositories into `modrexio/modrex`. It is a structural migration: a step must not change
runtime behavior unless that behavior change is called out and reviewed separately.

## Target structure

```text
modrexio/modrex
  apps/
    desktop/       # current modrex-main
    site/          # current modrex-site
    index/         # current modrex-index
  packages/
    games/         # added after the structural migration is stable
  install.config.json
  pnpm-workspace.yaml
```

`mget` remains in `modrexio/mget`. It is an independently versioned install engine used
by projects other than the Modrex desktop application and gains no useful coupling from
the product monorepo.

## Permanent public contracts

The migration must preserve all of these contracts:

1. Desktop releases and updater artifacts remain in `modrexio/modrex`. Existing bare
   `vX.Y.Z` tags continue to mean desktop releases, and
   `https://github.com/modrexio/modrex/releases/latest/download/latest.json` remains valid.
2. `install.config.json` stays at the repository root so
   `https://raw.githubusercontent.com/modrexio/modrex/main/install.config.json` remains valid.
3. `modrexio/modrex-index` remains an independent legacy producer for the `latest-index`
   release. Existing clients permanently fetch
   `https://github.com/modrexio/modrex-index/releases/download/latest-index/index.db`; its
   fixed game set and exported schema remain frozen for old desktop versions.
4. `modrexio/mget` remains the tag host used by the install-script Function.
5. `modrex.net`, `/install.sh`, and `/api/collect` remain available throughout the site
   migration.

## Structural boundaries

- `apps/desktop` keeps `src/` and `src-tauri/` together. Their generated-binding and Tauri
  path coupling is intentional.
- The site keeps `functions/` beside its Astro project. Cloudflare Pages must use
  `apps/site` as its project root so Pages Functions retain their current routes.
- Site and index history is imported as merge ancestry, not flattened into one snapshot.
  Their old repositories remain available after the import for rollback and historical
  links.
- The initial imports use the exact tracked trees from the source repositories. Quality
  unification happens in a later reviewed step so import defects and policy changes cannot
  obscure each other.
- `packages/games` is a later behavior change. It is not bundled with file movement.

## CI, commits, and security

The finished repository has one commit policy and one root hook installation:

- Conventional commits use project scopes such as `desktop`, `site`, `index`, `games`,
  `ci`, and `repo`.
- One root `commitlint` configuration validates every commit.
- One root Husky pre-commit hook routes staged files to the relevant checks.
- Full GitHub CI remains authoritative and exposes an always-running aggregate required
  check, even when project-specific jobs are skipped.
- Shared game-data changes run checks for every consumer.
- Desktop-specific Rust, updater, IPC, CSP, and license checks remain desktop-specific.
- Site-specific Astro, Pages Function, and production-build checks remain site-specific.
- The indexer gains the common formatting, linting, type-checking, testing, and audit bar.
- Release and cross-repository publication credentials receive only the permissions needed
  for their target.

## Migration steps and review gates

Every numbered step is implemented without a commit, verified, presented for owner review,
and committed only after approval. Commits contain no automated co-author attribution.

1. Record this contract and establish the pre-migration baseline.
2. Create the root workspace and move the desktop to `apps/desktop`; update every local,
   CI, release, updater, agent-rule, and generated-file path without changing behavior.
3. Import the site at `apps/site`, preserve its history, and add its workspace/CI wiring.
   The existing Cloudflare project continues serving production.
4. Create and verify a temporary Cloudflare Pages project rooted at `apps/site` before any
   domain change.
5. Import the indexer at `apps/index`, preserve its history, and make the legacy release
   repository explicit in every download and publish operation.
6. Unify repository-wide quality, code style, commit policy, CI, and security enforcement.
7. Run the monorepo index workflow manually against legacy publication, first as a no-op
   and then through a real changed run when one is naturally available.
8. Repoint the external scheduler to the monorepo workflow and change its interval to
   30 minutes.
9. Move `modrex.net` to the verified Pages project, keeping the former Pages deployment
   available for rollback.
10. Add `packages/games` and switch consumers in separately reviewed changes.

## Baseline recorded on 2026-07-21

All four working trees were clean on `main` before migration work began:

- `modrexio/modrex`: `5cc6450`
- `modrexio/modrex-site`: `cb89fdd`
- `modrexio/modrex-index`: `2690e45`
- `modrexio/mget`: `070f86c`

Baseline verification:

- Desktop version, command registration, CSP, game/source registry, updater, formatting,
  lint, and TypeScript checks passed.
- Desktop Rust tests could not complete because a running development instance held
  `src-tauri/target/debug/modrex.exe` open. The first structural step must rerun the full
  desktop gate after that process is closed; this is not treated as a source failure.
- Site unit tests passed: 2 files and 24 tests. The production Astro build produced all
  21 pages successfully.
- Index staged-rebuild checkpoint/resume verification passed.

## Owner-operated changes

The following actions require the owner because they affect external systems or secrets:

- Authorize the Cloudflare GitHub App for the monorepo if it does not already have access.
- Create the temporary Pages project and later move the `modrex.net` custom domain.
- Add a narrowly scoped GitHub credential that allows the monorepo workflow to update the
  legacy `modrex-index` release.
- Repoint the external scheduler after the new workflow has been verified.
- Push reviewed commits and tags. Agents do not push remote changes.

## Temporary Pages verification

Before changing `modrex.net`, create a temporary Cloudflare Pages project from the
`modrexio/modrex` repository. This project verifies the monorepo deployment without
touching the live Pages project or any custom domain.

Use these settings:

| Setting                | Value                          |
| ---------------------- | ------------------------------ |
| Project name           | `modrex-site-monorepo-preview` |
| Production branch      | `main`                         |
| Root directory         | `apps/site`                    |
| Build command          | `pnpm build`                   |
| Build output directory | `dist`                         |
| Node version           | `22`                           |

The root directory is required: Cloudflare Pages Functions must be in the Pages project
root, and `apps/site/functions/` contains the existing `/install.sh` and `/api/collect`
routes. `pnpm install` from that directory resolves the root workspace lockfile; this was
verified locally before the project is created.

Copy the existing site's build environment values into both Production and Preview as
appropriate, including `GITHUB_TOKEN` and `MODREX_GA_MEASUREMENT_ID`. Do not attach
`modrex.net`, alter the current Pages project, or change DNS during this verification.

Acceptance checks after the first deployment:

1. The generated `*.pages.dev` URL renders the site and its docs.
2. The Pages deployment recognizes the Functions directory.
3. `curl -fsSL https://<preview-host>/install.sh | sh -n` succeeds.
4. A `POST` to `https://<preview-host>/api/collect` without credentials returns the
   function's expected client error, confirming that the route is deployed without
   sending analytics.
