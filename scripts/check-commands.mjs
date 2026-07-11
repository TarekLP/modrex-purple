import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// The renderer-to-Rust command channel has no compile-time link: a command must be
// registered in generate_handler! in lib.rs AND invoked by that exact name from
// api.ts. A name missing on either side fails only at runtime, silently. This
// check diffs the two lists and also enforces that api.ts stays the only renderer
// file that talks to the invoke API.

const librs = readFileSync('src-tauri/src/lib.rs', 'utf8')
const handlerBlock = librs.match(/generate_handler!\[([\s\S]*?)\]/)?.[1]
if (!handlerBlock) {
    console.error('check-commands: generate_handler![...] not found in src-tauri/src/lib.rs')
    process.exit(1)
}
const registered = new Set([...handlerBlock.matchAll(/(?:\w+::)+(\w+)/g)].map((m) => m[1]))

const apiTs = readFileSync('src/renderer/src/api.ts', 'utf8')
const invoked = new Set([...apiTs.matchAll(/\binvoke(?:<[^>]*>)?\(\s*'([^']+)'/g)].map((m) => m[1]))

const missing = [...invoked].filter((name) => !registered.has(name))
const unused = [...registered].filter((name) => !invoked.has(name))

function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) yield* walk(path)
        else if (/\.tsx?$/.test(entry.name)) yield path
    }
}

const strayImports = []
for (const path of walk('src/renderer/src')) {
    if (path.replace(/\\/g, '/') === 'src/renderer/src/api.ts') continue
    if (/\.test\.tsx?$/.test(path)) continue
    // convertFileSrc imports are fine (thumbnailCache.ts); only invoke is api.ts-only
    if (
        /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*'@tauri-apps\/api\/core'/.test(
            readFileSync(path, 'utf8')
        )
    ) {
        strayImports.push(path)
    }
}

let failed = false
if (missing.length > 0) {
    failed = true
    console.error('Commands invoked in api.ts but not registered in generate_handler! (lib.rs):')
    for (const name of missing) console.error(`  ${name}`)
}
if (unused.length > 0) {
    failed = true
    console.error('Commands registered in generate_handler! (lib.rs) but never invoked in api.ts:')
    for (const name of unused) console.error(`  ${name}`)
}
if (strayImports.length > 0) {
    failed = true
    console.error('Renderer files importing @tauri-apps/api/core outside api.ts:')
    for (const path of strayImports) console.error(`  ${path}`)
}

if (failed) process.exit(1)
console.log(`check-commands: ${invoked.size} commands, registration and invocation agree`)
