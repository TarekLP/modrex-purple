import { execFileSync } from 'node:child_process'

const nextVersion = process.env.npm_new_version
if (!nextVersion) {
    console.error('pnpm did not provide the next version to the preversion lifecycle')
    process.exit(1)
}

const existingTag = execFileSync('git', ['tag', '--list', `v${nextVersion}`], {
    encoding: 'utf8',
}).trim()
if (existingTag) {
    console.error(`Release tag ${existingTag} already exists`)
    process.exit(1)
}

const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], {
    encoding: 'utf8',
}).trim()

if (status) {
    console.error('Tracked files must be clean before creating a desktop release:')
    console.error(status)
    process.exit(1)
}
