import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { migrations } from './postgres/schema.js'

function queryTemplate(file: string, startMarker: string, endMarker: string): string {
    const source = readFileSync(file, 'utf8')
    const start = source.indexOf(startMarker)
    assert.notEqual(start, -1, `${file} is missing its query start marker`)
    const queryStart = start + startMarker.length
    const end = source.indexOf(endMarker, queryStart)
    assert.notEqual(end, -1, `${file} is missing its query end marker`)
    return source.slice(queryStart, end)
}

async function executeTemplate(pg: PGlite, template: string, parameterName: string): Promise<void> {
    let parameterIndex = 0
    const query = template.replaceAll('${' + parameterName + '}', () => `$${++parameterIndex}`)
    await pg.query(query, Array(parameterIndex).fill('2026-09-21T03:00:00.000Z'))
}

const pg = new PGlite('memory://')
try {
    for (const migration of migrations) {
        for (const statement of migration.statements) await pg.exec(statement)
    }

    await executeTemplate(
        pg,
        queryTemplate('postgres/select-game.ts', 'const pendingRows = (await sql`', '`) as Array'),
        'selectionAt'
    )
    await executeTemplate(
        pg,
        queryTemplate(
            'postgres/report-coverage.ts',
            'const rows = (await sql`',
            '`) as CoverageRow[]'
        ),
        'reportedAt'
    )
} finally {
    await pg.close()
}

console.log('Postgres runtime query tests passed')
