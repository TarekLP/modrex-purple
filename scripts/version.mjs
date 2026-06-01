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

const readme = readFileSync('README.md', 'utf8')
writeFileSync(
    'README.md',
    readme
        .replace(/Modrex_[\d.]+_x64-setup\.exe/g, `Modrex_${version}_x64-setup.exe`)
        .replace(/modrex_[\d.]+_amd64\.AppImage/g, `modrex_${version}_amd64.AppImage`)
)

execSync('git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock README.md', {
    stdio: 'inherit',
})
