import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

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

execSync('cargo update --manifest-path src-tauri/Cargo.toml -p modrex', { stdio: 'inherit' })

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

// npm's version command commits and tags only when the package directory itself holds a
// .git entry. The desktop app is a workspace member two levels under the repository root,
// so that step silently never runs and the release commit and tag are made here instead.
// Without the tag the release workflow, which triggers on it, never fires at all.
execSync(
    'git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock ../../CHANGELOG.md',
    { stdio: 'inherit' }
)
execSync(`git commit -m "chore(release): ${version}"`, { stdio: 'inherit' })
execSync(`git tag v${version}`, { stdio: 'inherit' })
