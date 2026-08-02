import { readFileSync, readdirSync } from 'fs'

// Locale files are auto-discovered at runtime (locales.ts's import.meta.glob), so there
// is no registry to keep in sync, so this check only has to verify a translation file's
// own shape against en.json. A locale missing a key silently falls back to English at
// runtime with no signal anywhere; this is what makes that failure loud instead.

const I18N_DIR = 'src/renderer/src/i18n'

function flatten(obj, prefix = '') {
    const out = {}
    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string') out[path] = value
        else if (value && typeof value === 'object') Object.assign(out, flatten(value, path))
    }
    return out
}

function interpolationVars(value) {
    return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

const en = JSON.parse(readFileSync(`${I18N_DIR}/en.json`, 'utf8'))
const enFlat = flatten(en)
const enKeys = Object.keys(enFlat)

const localeFiles = readdirSync(I18N_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'en.json')
    .map((f) => f.replace(/\.json$/, ''))

const errors = []

for (const id of localeFiles) {
    const bundle = JSON.parse(readFileSync(`${I18N_DIR}/${id}.json`, 'utf8'))
    const bundleFlat = flatten(bundle)

    const missing = enKeys.filter((key) => !(key in bundleFlat))
    const extra = Object.keys(bundleFlat).filter((key) => !(key in enFlat))
    if (missing.length > 0) {
        errors.push(`'${id}' is missing ${missing.length} key(s):\n  ${missing.join('\n  ')}`)
    }
    if (extra.length > 0) {
        errors.push(`'${id}' has key(s) not present in en.json:\n  ${extra.join('\n  ')}`)
    }

    for (const key of enKeys) {
        if (!(key in bundleFlat)) continue
        const enVars = interpolationVars(enFlat[key]).join(',')
        const localeVars = interpolationVars(bundleFlat[key]).join(',')
        if (enVars !== localeVars) {
            errors.push(
                `'${id}' key '${key}' has interpolation vars [${localeVars}], expected [${enVars}]`
            )
        }
    }
}

if (errors.length > 0) {
    console.error('check-i18n: found problems:')
    for (const err of errors) console.error(`  ${err}`)
    process.exit(1)
}

console.log(
    `check-i18n: ${enKeys.length} keys, ${localeFiles.length} translated locale(s), all complete`
)
