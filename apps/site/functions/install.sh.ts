// Serves curl -fsSL https://modrex.net/install.sh | sh: fetches a pinned
// release of the shared mget engine (github.com/modrexio/mget) plus modrex's
// own install.config.json, flattens the config into CFG_* shell exports, and
// concatenates them into one script. See mget's README for the full design —
// this function only implements the "Worker integration" section documented
// there.
//
// The engine tag is pinned deliberately, never the main branch: a bad push to
// mget would otherwise break every project's install simultaneously the
// moment this function re-fetches it. ENGINE_PIN accepts three forms:
//   - an exact tag ("v1.1.0"): fully deterministic, no extra API call.
//   - a bare major ("v1"): auto-resolves to the latest v1.x.x tag on every
//     request — picks up patches/minors automatically, never a breaking
//     major, the same convention as GitHub Actions' @v4-style tags. Only
//     safe if mget's SemVer discipline (major = breaking) actually holds.
//   - "latest": resolves to the single highest-semver tag across all majors.
//     No safety net at all — not used for modrex itself, but available for a
//     project that wants full auto-update over caution.
// mget is a script fetched directly from a tag, not a binary distribution, so
// there's no GitHub Release to query — resolution reads tags directly for
// both "latest" and bare-major forms, never the Releases API.
const ENGINE_PIN = 'v1'
const CONFIG_URL = 'https://raw.githubusercontent.com/modrexio/modrex/main/install.config.json'

interface GhTag {
    name: string
}

// GitHub rejects unauthenticated API requests with no User-Agent.
const GH_API_HEADERS = { 'User-Agent': 'modrex-install-worker' }

export function parseSemver(tag: string): { major: number; minor: number; patch: number } | null {
    const m = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/)
    return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null
}

async function fetchTags(): Promise<GhTag[]> {
    const res = await fetch('https://api.github.com/repos/modrexio/mget/tags?per_page=100', {
        headers: GH_API_HEADERS,
    })
    if (!res.ok) throw new Error(`GitHub API (tags) failed: ${res.status}`)
    return res.json()
}

export async function resolveEngineTag(pin: string): Promise<string> {
    if (parseSemver(pin)) return pin // exact tag, no API call needed

    const majorMatch = pin.match(/^v(\d+)$/)
    if (pin !== 'latest' && !majorMatch) throw new Error(`invalid ENGINE_PIN: ${pin}`)

    const tags = await fetchTags()
    const wantedMajor = majorMatch ? Number(majorMatch[1]) : null
    const best = tags
        .map((t) => parseSemver(t.name))
        .filter(
            (v): v is NonNullable<typeof v> =>
                v !== null && (wantedMajor === null || v.major === wantedMajor)
        )
        .sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch)[0]
    if (!best) throw new Error(`no tags found matching ${pin}`)
    return `v${best.major}.${best.minor}.${best.patch}`
}

export interface InstallConfig {
    schema_version: number
    project_name: string
    github_repo?: string
    manifest_url: string
    pubkey?: string
    preferred_variant?: Record<string, string>
    macos_bundle_name?: string
    macos_executable_name?: string
    deb_package_name?: string
    rpm_package_name?: string
    install_dir: string
    add_to_path?: boolean
    post_install_cmd?: string
    uninstall_manifest?: string
    install_url?: string
}

// Single-quoted shell literal, the only form mget's engine ever needs to
// parse: embedded single quotes are the one character that has to be escaped
// (close the quote, emit an escaped quote, reopen). Getting this wrong is
// exactly how a config value turns into unintended shell code — see mget's
// README, "Worker integration" — so this is the one thing here that must not
// be simplified away.
export function shellQuote(value: unknown): string {
    return `'${String(value ?? '').replaceAll("'", `'"'"'`)}'`
}

function flattenPreferredVariant(variant: Record<string, string> | undefined): string {
    return Object.entries(variant ?? {})
        .map(([os, v]) => `${os}:${v}`)
        .join(' ')
}

export function buildPrelude(config: InstallConfig): string {
    const flat: Record<string, unknown> = {
        schema_version: config.schema_version,
        project_name: config.project_name,
        github_repo: config.github_repo ?? '',
        manifest_url: config.manifest_url,
        pubkey: config.pubkey ?? '',
        preferred_variant: flattenPreferredVariant(config.preferred_variant),
        macos_bundle_name: config.macos_bundle_name ?? '',
        macos_executable_name: config.macos_executable_name ?? '',
        deb_package_name: config.deb_package_name ?? '',
        rpm_package_name: config.rpm_package_name ?? '',
        install_dir: config.install_dir,
        add_to_path: config.add_to_path ?? true,
        post_install_cmd: config.post_install_cmd ?? '',
        uninstall_manifest: config.uninstall_manifest ?? '',
        install_url: config.install_url ?? '',
    }
    return Object.entries(flat)
        .map(([key, value]) => `CFG_${key.toUpperCase()}=${shellQuote(value)}`)
        .join('\n')
}

export async function onRequestGet(): Promise<Response> {
    let engine: string
    let config: InstallConfig
    try {
        const engineTag = await resolveEngineTag(ENGINE_PIN)
        const engineUrl = `https://raw.githubusercontent.com/modrexio/mget/${engineTag}/install.sh`
        const [engineRes, configRes] = await Promise.all([fetch(engineUrl), fetch(CONFIG_URL)])
        if (!engineRes.ok) {
            return new Response(`# fetching mget engine failed: ${engineRes.status}\nexit 1\n`, {
                status: 502,
                headers: { 'Content-Type': 'text/x-shellscript' },
            })
        }
        if (!configRes.ok) {
            return new Response(
                `# fetching install.config.json failed: ${configRes.status}\nexit 1\n`,
                {
                    status: 502,
                    headers: { 'Content-Type': 'text/x-shellscript' },
                }
            )
        }
        engine = await engineRes.text()
        config = await configRes.json()
    } catch (err) {
        return new Response(`# install script fetch failed: ${String(err)}\nexit 1\n`, {
            status: 502,
            headers: { 'Content-Type': 'text/x-shellscript' },
        })
    }

    // The engine file has its own shebang as its first line; only one may
    // survive in the concatenated output.
    const engineBody = engine.replace(/^#!.*\n/, '')
    const script = `#!/bin/sh\n${buildPrelude(config)}\n${engineBody}`

    return new Response(script, {
        headers: {
            'Content-Type': 'text/x-shellscript',
            // Correctness (always serving the current engine/config) matters far
            // more than caching a script that's fetched once per install, rarely.
            'Cache-Control': 'no-store',
        },
    })
}
