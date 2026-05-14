import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export async function downloadFile(
    url: string,
    ext: string,
    onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
    const dest = join(tmpdir(), `pd3-mod-${randomUUID()}.${ext}`)
    const res = await fetch(url, { headers: { 'User-Agent': 'pd3-mod-manager/0.1.0' } })
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
    const total = parseInt(res.headers.get('content-length') ?? '0', 10)
    let downloaded = 0
    const counter = new Transform({
        transform(chunk, _, cb) {
            downloaded += chunk.length
            onProgress?.(downloaded, total)
            cb(null, chunk)
        },
    })
    await pipeline(res.body as unknown as NodeJS.ReadableStream, counter, createWriteStream(dest))
    return dest
}
