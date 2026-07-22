import { execFileSync } from 'node:child_process'

const [before, after] = process.argv.slice(2)

if (!before || !after) {
    throw new Error('Usage: detect-added-games.mjs <before-sha> <after-sha>')
}

function gameIds(revision) {
    const source = execFileSync('git', ['show', `${revision}:packages/games/index.ts`], {
        encoding: 'utf8',
    })
    const registry = source.match(/const GAME_SPECS = \{([\s\S]*?)\n\} satisfies/)?.[1]
    if (!registry) throw new Error(`Could not find GAME_SPECS in ${revision}`)
    return new Set([...registry.matchAll(/^ {4}(\w+):\s*\{/gm)].map((match) => match[1]))
}

const previous = gameIds(before)
const added = [...gameIds(after)].filter((id) => !previous.has(id))

if (added.length > 1) {
    throw new Error(
        `One push added multiple games (${added.join(', ')}); dispatch each backfill manually.`
    )
}

process.stdout.write(added[0] ?? '')
