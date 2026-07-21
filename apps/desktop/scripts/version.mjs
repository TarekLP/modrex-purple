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

const readmePath = '../../README.md'
const readme = readFileSync(readmePath, 'utf8')
writeFileSync(
    readmePath,
    readme
        .replace(/Modrex_[\d.]+_x64-setup\.exe/g, `Modrex_${version}_x64-setup.exe`)
        .replace(/modrex_[\d.]+_amd64\.AppImage/g, `modrex_${version}_amd64.AppImage`)
)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleasedBody = changelog.match(/## Unreleased\n([\s\S]*?)\n## /)?.[1].trim()
if (!unreleasedBody) {
    console.warn(
        `Warning: CHANGELOG.md Unreleased section is empty — v${version} will ship with no release notes.`
    )
}
writeFileSync(
    'CHANGELOG.md',
    changelog.replace(/## Unreleased\n+/, `## Unreleased\n\n## ${version}\n\n`)
)

execSync(
    'git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock ../../README.md CHANGELOG.md',
    { stdio: 'inherit' }
)
