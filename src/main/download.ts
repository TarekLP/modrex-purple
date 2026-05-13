import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export async function downloadFile(url: string, ext: string): Promise<string> {
    const dest = join(tmpdir(), `pd3-mod-${randomUUID()}.${ext}`)
    const res = await fetch(url, { headers: { 'User-Agent': 'pd3-mod-manager/0.1.0' } })
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest))
    return dest
}
