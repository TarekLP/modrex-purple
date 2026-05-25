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

execSync('git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock', {
    stdio: 'inherit',
})
