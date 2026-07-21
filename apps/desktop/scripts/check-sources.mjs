import { readFileSync } from 'fs'

// modworkshop's per-game id is registered twice by necessity: SOURCE_REGISTRY in Rust and
// workshopId in GAME_SPECS, which the renderer uses directly to build API calls. Neither
// side can see the other, so adding a game to one and forgetting the other compiles fine
// and fails at runtime. This check diffs the two.
//
// Nexus is deliberately NOT checked here: the renderer reads its per-game domain from the
// registry over IPC (sources.ts), so there is no second list to drift. Any source added
// that way needs no entry here.

const rust = readFileSync('src-tauri/src/commands/sources.rs', 'utf8')
const registryBlock = rust.match(/SOURCE_REGISTRY: &\[SourceSpec\] = &\[([\s\S]*?)\n\];/)?.[1]
if (!registryBlock) {
    console.error('check-sources: SOURCE_REGISTRY not found in src-tauri/src/commands/sources.rs')
    process.exit(1)
}

// Each SourceSpec is an id line followed by its games array, so splitting on the id
// lines attributes every SourceGame block to the source it sits under.
const rustSources = new Map()
for (const chunk of registryBlock.split(/\bid:\s*"/).slice(1)) {
    const sourceId = chunk.slice(0, chunk.indexOf('"'))
    const pairs = [...chunk.matchAll(/game_id:\s*"([^"]+)"\s*,\s*native_id:\s*"([^"]+)"/g)].map(
        (m) => [m[1], m[2]]
    )
    rustSources.set(sourceId, new Map(pairs))
}

const ts = readFileSync('src/shared/types.ts', 'utf8')
const specsBlock = ts.match(/const GAME_SPECS = \{([\s\S]*?)\n\} satisfies/)?.[1]
if (!specsBlock) {
    console.error('check-sources: GAME_SPECS not found in src/shared/types.ts')
    process.exit(1)
}

// One entry per game, carrying workshopId.
const tsWorkshop = new Map()
for (const chunk of specsBlock.split(/^ {4}(?=\w+:\s*\{)/m)) {
    const gameId = chunk.match(/^(\w+):\s*\{/)?.[1]
    if (!gameId) continue
    const workshopId = chunk.match(/workshopId:\s*(\d+)/)?.[1]
    if (workshopId) tsWorkshop.set(gameId, workshopId)
}

const errors = []

function diff(sourceId, tsMap) {
    const rustMap = rustSources.get(sourceId)
    if (!rustMap) {
        errors.push(`source '${sourceId}' is missing from the Rust SOURCE_REGISTRY`)
        return
    }
    for (const [gameId, native] of rustMap) {
        if (!tsMap.has(gameId)) {
            errors.push(`${sourceId}: Rust maps '${gameId}' but GAME_SPECS does not`)
            continue
        }
        if (tsMap.get(gameId) !== native) {
            errors.push(
                `${sourceId}: '${gameId}' is '${native}' in Rust but '${tsMap.get(gameId)}' in GAME_SPECS`
            )
        }
    }
    for (const gameId of tsMap.keys()) {
        if (!rustMap.has(gameId)) {
            errors.push(`${sourceId}: GAME_SPECS maps '${gameId}' but the Rust registry does not`)
        }
    }
}

diff('modworkshop', tsWorkshop)

if (errors.length > 0) {
    console.error('Source registry disagrees between Rust and TypeScript:')
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
}

console.log(
    `check-sources: ${tsWorkshop.size} modworkshop game mappings agree between Rust and TypeScript`
)
