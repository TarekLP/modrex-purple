import { readFileSync } from 'fs'

// A game is registered twice by necessity: GAME_REGISTRY in Rust (engine config +
// storefront def) and @modrex/games (shared UI/index metadata). Neither side can see the
// other, so adding a game to one and forgetting the other compiles fine and fails at
// runtime — the renderer sends a game id the backend rejects as unknown, or the picker
// silently omits a supported game. This check diffs the two id lists.

const rust = readFileSync('src-tauri/src/commands/games.rs', 'utf8')
const registryBlock = rust.match(/GAME_REGISTRY: &\[GameSpec\] = &\[([\s\S]*?)\n\];/)?.[1]
if (!registryBlock) {
    console.error('check-games: GAME_REGISTRY not found in src-tauri/src/commands/games.rs')
    process.exit(1)
}
const rustIds = [...registryBlock.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1])

const ts = readFileSync('../../packages/games/index.ts', 'utf8')
const specsBlock = ts.match(/const GAME_SPECS = \{([\s\S]*?)\n\} satisfies/)?.[1]
if (!specsBlock) {
    console.error('check-games: GAMES not found in packages/games/index.ts')
    process.exit(1)
}
const tsIds = [...specsBlock.matchAll(/^ {4}(\w+):\s*\{/gm)].map((m) => m[1])

const missingInTs = rustIds.filter((id) => !tsIds.includes(id))
const missingInRust = tsIds.filter((id) => !rustIds.includes(id))

let failed = false
if (missingInTs.length > 0) {
    failed = true
    console.error('Games in Rust GAME_REGISTRY but missing from GAMES (packages/games):')
    for (const id of missingInTs) console.error(`  ${id}`)
}
if (missingInRust.length > 0) {
    failed = true
    console.error('Games in GAMES (packages/games) but missing from Rust GAME_REGISTRY:')
    for (const id of missingInRust) console.error(`  ${id}`)
}

if (failed) process.exit(1)
console.log(`check-games: ${rustIds.length} games, Rust and TypeScript registries agree`)
