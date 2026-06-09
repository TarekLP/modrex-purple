import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')

function findLicenseText(pkgPath) {
    const candidates = [
        'LICENSE',
        'LICENSE.txt',
        'LICENSE.md',
        'license',
        'license.txt',
        'LICENCE',
        'LICENCE.txt',
    ]
    for (const name of candidates) {
        const p = join(pkgPath, name)
        if (existsSync(p)) return readFileSync(p, 'utf-8').trim()
    }
    return null
}

const raw = execSync('pnpm licenses list --prod --json', { cwd: rootDir }).toString()
const npmData = JSON.parse(raw)

let npmLines = []
const seen = new Set()

for (const packages of Object.values(npmData)) {
    for (const pkg of packages) {
        if (seen.has(pkg.name)) continue
        seen.add(pkg.name)

        const text = pkg.paths?.[0] ? findLicenseText(pkg.paths[0]) : null
        npmLines.push(`### ${pkg.name} ${pkg.versions?.[0] ?? ''}`)
        npmLines.push(``)
        npmLines.push(`**License:** ${pkg.license}`)
        npmLines.push(``)
        if (text) {
            npmLines.push('```')
            npmLines.push(text)
            npmLines.push('```')
        }
        npmLines.push(``)
        npmLines.push('---')
        npmLines.push(``)
    }
}

const rustTmp = join(rootDir, 'src-tauri', '_rust-licenses.tmp.md')
let rustLines = []
try {
    execSync(`cargo about generate about.hbs -o "${rustTmp}"`, {
        cwd: join(rootDir, 'src-tauri'),
    })
    rustLines = readFileSync(rustTmp, 'utf-8').split('\n')
    unlinkSync(rustTmp)
} catch (e) {
    console.warn('cargo-about failed — skipping Rust section:', e.message)
    rustLines = ['> Run `cargo install cargo-about --features=cli` then re-run this script.']
}

const header = [
    '# Third-Party Licenses',
    '',
    'This file lists all third-party dependencies bundled in Modrex and their license terms.',
    'Regenerate with `pnpm generate-licenses`.',
    '',
    '---',
    '',
    '## JavaScript / TypeScript Dependencies',
    '',
]

const rustHeader = ['## Rust / C Dependencies', '']

const output = [...header, ...npmLines, ...rustHeader, ...rustLines].join('\n')
writeFileSync(join(rootDir, 'THIRD_PARTY_LICENSES.md'), output)
console.log('Written THIRD_PARTY_LICENSES.md')
