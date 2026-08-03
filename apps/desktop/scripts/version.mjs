import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const conf = readFileSync('src-tauri/tauri.conf.json', 'utf8')
writeFileSync(
    'src-tauri/tauri.conf.json',
    conf.replace(/"version": "[^"]+"/, `"version": "${version}"`)
)

const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
writeFileSync(
    'src-tauri/Cargo.toml',
    cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`)
)

execFileSync('cargo', ['update', '--manifest-path', 'src-tauri/Cargo.toml', '-p', 'modrex'], {
    stdio: 'inherit',
})

const changelogPath = '../../CHANGELOG.md'
const changelog = readFileSync(changelogPath, 'utf8')
const unreleasedBody = changelog.match(/## Unreleased\n([\s\S]*?)\n## /)?.[1].trim()
if (!unreleasedBody) {
    console.warn(
        `Warning: CHANGELOG.md Unreleased section is empty — v${version} will ship with no release notes.`
    )
}
writeFileSync(
    changelogPath,
    changelog.replace(/## Unreleased\n+/, `## Unreleased\n\n## ${version}\n\n`)
)

// The workspace package is below the repository's .git directory, so pnpm does not
// create its release commit and tag.
execFileSync(
    'git',
    [
        'add',
        'package.json',
        'src-tauri/tauri.conf.json',
        'src-tauri/Cargo.toml',
        'src-tauri/Cargo.lock',
        '../../CHANGELOG.md',
    ],
    { stdio: 'inherit' }
)
execFileSync('git', ['commit', '-m', `chore(release): ${version}`], { stdio: 'inherit' })
execFileSync('git', ['tag', '-a', `v${version}`, '-m', `chore(release): ${version}`], {
    stdio: 'inherit',
})
