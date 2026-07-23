import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.INDEX_DATABASE_URL
if (!databaseUrl) throw new Error('INDEX_DATABASE_URL is required')

const sql = neon(databaseUrl)
const [row] = (await sql`
    SELECT COUNT(DISTINCT mods.id)::TEXT AS supported_mods
    FROM mods
    JOIN files ON files.mod_id = mods.id
`) as Array<{ supported_mods: string }>

process.stdout.write(row?.supported_mods ?? '0')
