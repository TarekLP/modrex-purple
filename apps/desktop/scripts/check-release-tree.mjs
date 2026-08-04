import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function fail(message) {
    console.error(message)
    process.exit(1)
}

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
if (resolve(process.cwd()) !== resolve(repoRoot)) {
    fail('Run pnpm version patch, minor, or major from the repository root.')
}

const nextVersion = process.env.npm_new_version
if (!nextVersion) fail('pnpm did not provide the next version to the preversion lifecycle')

const oldVersion = process.env.npm_old_version
if (!oldVersion) fail('pnpm did not provide the current version to the preversion lifecycle')

const rootVersion = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
).version
const desktopVersion = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version
if (rootVersion !== oldVersion || desktopVersion !== oldVersion) {
    fail(
        `Release versions must agree before bumping: root=${rootVersion}, desktop=${desktopVersion}, expected=${oldVersion}`
    )
}

const existingTag = execFileSync('git', ['tag', '--list', `v${nextVersion}`], {
    cwd: repoRoot,
    encoding: 'utf8',
}).trim()
if (existingTag) fail(`Release tag ${existingTag} already exists`)

const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    cwd: repoRoot,
    encoding: 'utf8',
}).trim()

if (status) {
    fail(`Tracked files must be clean before creating a desktop release:\n${status}`)
}
