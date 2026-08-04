import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function fail(message) {
    console.error(message)
    process.exit(1)
}

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const desktopRoot = fileURLToPath(new URL('../', import.meta.url))
const desktopPackagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const tauriConfigPath = fileURLToPath(new URL('../src-tauri/tauri.conf.json', import.meta.url))
const cargoManifestPath = fileURLToPath(new URL('../src-tauri/Cargo.toml', import.meta.url))
const changelogPath = fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url))
const version = process.env.npm_new_version
const oldVersion = process.env.npm_old_version
if (!version || !oldVersion) fail('pnpm did not provide the release versions')

const rootVersion = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
).version
if (rootVersion !== version) {
    fail(`Root package version is ${rootVersion}, expected ${version}`)
}

const desktopPackage = readFileSync(desktopPackagePath, 'utf8')
const desktopVersion = JSON.parse(desktopPackage).version
if (desktopVersion !== oldVersion) {
    fail(`Desktop package version is ${desktopVersion}, expected ${oldVersion}`)
}

const conf = readFileSync(tauriConfigPath, 'utf8')
const tauriVersion = JSON.parse(conf).version
if (tauriVersion !== oldVersion) {
    fail(`Tauri version is ${tauriVersion}, expected ${oldVersion}`)
}

const cargo = readFileSync(cargoManifestPath, 'utf8')
const cargoVersion = cargo.match(/^version = "([^"]+)"$/m)?.[1]
if (cargoVersion !== oldVersion) {
    fail(`Cargo version is ${cargoVersion ?? 'missing'}, expected ${oldVersion}`)
}

const changelog = readFileSync(changelogPath, 'utf8')
const unreleasedBody = changelog.match(/## Unreleased\n([\s\S]*?)\n## /)?.[1].trim()
if (!changelog.includes('## Unreleased\n')) fail('CHANGELOG.md has no Unreleased section')
if (!unreleasedBody) {
    console.warn(
        `Warning: CHANGELOG.md Unreleased section is empty — v${version} will ship with no release notes.`
    )
}

writeFileSync(
    desktopPackagePath,
    desktopPackage.replace(`"version": "${oldVersion}"`, `"version": "${version}"`)
)
writeFileSync(
    tauriConfigPath,
    conf.replace(`"version": "${oldVersion}"`, `"version": "${version}"`)
)
writeFileSync(
    cargoManifestPath,
    cargo.replace(`version = "${oldVersion}"`, `version = "${version}"`)
)
writeFileSync(
    changelogPath,
    changelog.replace(/## Unreleased\n+/, `## Unreleased\n\n## ${version}\n\n`)
)

execFileSync('cargo', ['update', '--manifest-path', cargoManifestPath, '-p', 'modrex'], {
    stdio: 'inherit',
})
execFileSync(process.execPath, ['scripts/check-version.mjs'], {
    cwd: desktopRoot,
    stdio: 'inherit',
})

execFileSync(
    'git',
    [
        'add',
        '--',
        'package.json',
        'apps/desktop/package.json',
        'apps/desktop/src-tauri/tauri.conf.json',
        'apps/desktop/src-tauri/Cargo.toml',
        'apps/desktop/src-tauri/Cargo.lock',
        'CHANGELOG.md',
    ],
    { cwd: repoRoot, stdio: 'inherit' }
)
