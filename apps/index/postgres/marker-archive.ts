import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'

import type { ContentEntry } from './content-archive.js'

interface CentralDirectoryEntry {
    name: string
    localOffset: number
    compressedSize: number
    compressionMethod: number
}

const maxFullArchiveBytes = 50 * 1024 * 1024
const pdmodPassword = `0$45'5))66S2ixF51a<6}L2UK`
const pdmodHashlistPath = join(import.meta.dirname, '..', 'pdmod_hashlist.txt')

function chooseMarker(paths: string[]): string | null {
    const files = paths.filter((path) => !path.endsWith('/'))
    if (files.length === 0) return null

    const depth = (path: string) => path.split('/').length - 1
    const firstMatch = (names: string[]): string | undefined =>
        files.find((path) => {
            const normalized = path.toLowerCase()
            return (
                names.some((name) => normalized === name || normalized.endsWith(`/${name}`)) &&
                depth(path) <= 1
            )
        })

    const marker = firstMatch(['mod.txt']) ?? firstMatch(['base.lua']) ?? firstMatch(['main.xml'])
    if (marker) return marker

    const raidMarker = firstMatch(['supermod.xml']) ?? firstMatch(['mod.xml'])
    if (raidMarker) return raidMarker

    const sorted = [...files].sort((left, right) => left.localeCompare(right))
    const roots = [...new Set(files.map((path) => path.split('/')[0]))]
    if (roots.length === 1 && roots[0] !== '') {
        const prefix = `${roots[0]}/`
        return (
            sorted
                .filter((path) => path.startsWith(prefix))
                .map((path) => ({ path, relative: path.slice(prefix.length) }))
                .sort((left, right) => left.relative.localeCompare(right.relative))[0]?.path ?? null
        )
    }

    return sorted[0] ?? null
}

async function request(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, {
        ...init,
        headers: { 'User-Agent': 'modrex-index-builder', ...init.headers },
        redirect: 'follow',
    })
}

async function contentLength(url: string): Promise<number | null> {
    const response = await request(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return null
    const length = Number(response.headers.get('content-length'))
    return Number.isSafeInteger(length) && length > 0 ? length : null
}

async function rangeGet(url: string, start: number, end: number): Promise<Buffer> {
    const response = await request(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(60_000),
    })
    if (response.status !== 200 && response.status !== 206) {
        throw new Error(`range request returned ${response.status}`)
    }
    return Buffer.from(await response.arrayBuffer())
}

function findEocd(buffer: Buffer): { offset: number; size: number } | null {
    for (let position = buffer.length - 22; position >= 0; position--) {
        if (buffer.readUInt32LE(position) !== 0x06054b50) continue
        const size = buffer.readUInt32LE(position + 12)
        const offset = buffer.readUInt32LE(position + 16)
        if (size !== 0xffffffff && offset !== 0xffffffff) return { offset, size }
    }
    return null
}

function parseCentralDirectory(buffer: Buffer): CentralDirectoryEntry[] {
    const entries: CentralDirectoryEntry[] = []
    for (let position = 0; position + 46 <= buffer.length;) {
        if (buffer.readUInt32LE(position) !== 0x02014b50) break
        const fileNameLength = buffer.readUInt16LE(position + 28)
        const extraLength = buffer.readUInt16LE(position + 30)
        const commentLength = buffer.readUInt16LE(position + 32)
        entries.push({
            name: buffer.subarray(position + 46, position + 46 + fileNameLength).toString('utf8'),
            compressionMethod: buffer.readUInt16LE(position + 10),
            compressedSize: buffer.readUInt32LE(position + 20),
            localOffset: buffer.readUInt32LE(position + 42),
        })
        position += 46 + fileNameLength + extraLength + commentLength
    }
    return entries
}

async function markerFromZip(url: string, size: number | null): Promise<ContentEntry | null> {
    try {
        const archiveSize = size ?? (await contentLength(url))
        if (!archiveSize || archiveSize < 22) return null

        const tail = await rangeGet(url, Math.max(0, archiveSize - 65_557), archiveSize - 1)
        const eocd = findEocd(tail)
        if (!eocd) return null

        const entries = parseCentralDirectory(
            await rangeGet(url, eocd.offset, eocd.offset + eocd.size - 1)
        )
        const name = chooseMarker(entries.map((entry) => entry.name))
        const entry = name ? entries.find((candidate) => candidate.name === name) : undefined
        if (!entry || entry.compressedSize === 0) return null

        const header = await rangeGet(url, entry.localOffset, entry.localOffset + 29)
        if (header.readUInt32LE(0) !== 0x04034b50) return null
        const dataStart = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
        const compressed = await rangeGet(url, dataStart, dataStart + entry.compressedSize - 1)

        let content: Buffer
        if (entry.compressionMethod === 0) content = compressed
        else if (entry.compressionMethod === 8) {
            try {
                content = inflateRawSync(compressed)
            } catch {
                return null
            }
        } else return null

        return { sha256: createHash('sha256').update(content).digest('hex'), entryName: entry.name }
    } catch (error) {
        if (error instanceof Error && error.message === 'range request returned 416') return null
        throw error
    }
}

async function markerFromFullArchive(
    url: string,
    extension: '.7z' | '.rar'
): Promise<ContentEntry | null> {
    const response = await request(url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`download returned ${response.status}`)

    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'modrex-marker-'))
    try {
        const archive = join(temporaryDirectory, `archive${extension}`)
        const output = join(temporaryDirectory, 'out')
        writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
        try {
            execFileSync('7z', ['x', archive, `-o${output}`, '-y'], { stdio: 'ignore' })
        } catch {
            return null
        }
        if (!existsSync(output)) return null
        const paths = (readdirSync(output, { recursive: true }) as string[])
            .filter((path) => statSync(join(output, path)).isFile())
            .map((path) => path.replace(/\\/g, '/'))
        const marker = chooseMarker(paths)
        if (!marker) return null
        const content = readFileSync(join(output, marker))
        return { sha256: createHash('sha256').update(content).digest('hex'), entryName: marker }
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true })
    }
}

export async function extractMarkerEntry(
    url: string,
    knownSize: number | null
): Promise<ContentEntry | null> {
    const extension = new URL(url).pathname.toLowerCase()
    if (extension.endsWith('.7z') || extension.endsWith('.rar')) {
        const size = knownSize ?? (await contentLength(url))
        if (size === null || size > maxFullArchiveBytes) return null
        return markerFromFullArchive(url, extension.endsWith('.rar') ? '.rar' : '.7z')
    }
    return markerFromZip(url, knownSize)
}

function mix64(a: bigint, b: bigint, c: bigint): [bigint, bigint, bigint] {
    const mask = 0xffffffffffffffffn
    a = ((a - b - c) ^ (c >> 43n)) & mask
    b = ((b - c - a) ^ (a << 9n)) & mask
    c = ((c - a - b) ^ (b >> 8n)) & mask
    a = ((a - b - c) ^ (c >> 38n)) & mask
    b = ((b - c - a) ^ (a << 23n)) & mask
    c = ((c - a - b) ^ (b >> 5n)) & mask
    a = ((a - b - c) ^ (c >> 35n)) & mask
    b = ((b - c - a) ^ (a << 49n)) & mask
    c = ((c - a - b) ^ (b >> 11n)) & mask
    a = ((a - b - c) ^ (c >> 12n)) & mask
    b = ((b - c - a) ^ (a << 18n)) & mask
    c = ((c - a - b) ^ (b >> 22n)) & mask
    return [a, b, c]
}

function hash64(value: string): bigint {
    const input = Buffer.from(value, 'utf8')
    const mask = 0xffffffffffffffffn
    let a = 0n
    let b = 0n
    let c = 0x9e3779b97f4a7c13n
    let position = 0
    while (position + 24 <= input.length) {
        a = (a + input.readBigUInt64LE(position)) & mask
        b = (b + input.readBigUInt64LE(position + 8)) & mask
        c = (c + input.readBigUInt64LE(position + 16)) & mask
        ;[a, b, c] = mix64(a, b, c)
        position += 24
    }
    const byte = (offset: number): bigint =>
        position + offset < input.length ? BigInt(input[position + offset]) : 0n
    c = (c + BigInt(input.length)) & mask
    a =
        (a +
            byte(0) +
            (byte(1) << 8n) +
            (byte(2) << 16n) +
            (byte(3) << 24n) +
            (byte(4) << 32n) +
            (byte(5) << 40n) +
            (byte(6) << 48n) +
            (byte(7) << 56n)) &
        mask
    b =
        (b +
            byte(8) +
            (byte(9) << 8n) +
            (byte(10) << 16n) +
            (byte(11) << 24n) +
            (byte(12) << 32n) +
            (byte(13) << 40n) +
            (byte(14) << 48n) +
            (byte(15) << 56n)) &
        mask
    c =
        (c +
            byte(16) +
            (byte(17) << 8n) +
            (byte(18) << 16n) +
            (byte(19) << 24n) +
            (byte(20) << 32n) +
            (byte(21) << 40n) +
            (byte(22) << 56n)) &
        mask
    ;[, , c] = mix64(a, b, c)
    return c
}

let pdmodHashlist: Map<bigint, string> | undefined

function resolvedPdmodHashlist(): Map<bigint, string> {
    if (pdmodHashlist) return pdmodHashlist
    pdmodHashlist = new Map()
    for (const line of readFileSync(pdmodHashlistPath, 'utf8').split('\n')) {
        const value = line.trim()
        if (value) pdmodHashlist.set(hash64(value), value)
    }
    return pdmodHashlist
}

interface PdmodItem {
    BundlePath: string
    BundleExtension: string
    ReplacementFile: string
}

export async function extractPdmodEntry(url: string): Promise<ContentEntry | null> {
    const response = await request(url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`download returned ${response.status}`)
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'modrex-pdmod-'))
    try {
        const archive = join(temporaryDirectory, 'archive.pdmod')
        const output = join(temporaryDirectory, 'out')
        mkdirSync(output)
        writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
        try {
            execFileSync('7z', ['x', archive, `-p${pdmodPassword}`, `-o${output}`, '-y'], {
                stdio: 'ignore',
            })
        } catch {
            return null
        }
        const manifestPath = join(output, 'pdmod.json')
        if (!existsSync(manifestPath)) return null
        const manifest = JSON.parse(
            readFileSync(manifestPath, 'utf8').replace(
                /("BundlePath"|"BundleExtension"):\s*(\d+)/g,
                (_match, key: string, value: string) => `${key}: ${JSON.stringify(value)}`
            )
        ) as { ItemQueue: PdmodItem[] }
        const hashlist = resolvedPdmodHashlist()
        const replacements = manifest.ItemQueue.flatMap((item) => {
            const path = hashlist.get(BigInt(item.BundlePath))
            const extension = hashlist.get(BigInt(item.BundleExtension))
            return path && extension
                ? [{ path: `${path}.${extension}`, replacement: item.ReplacementFile }]
                : []
        }).sort((left, right) => left.path.localeCompare(right.path))
        const first = replacements[0]
        if (!first) return null
        const replacementPath = join(output, first.replacement)
        if (!existsSync(replacementPath)) return null
        return {
            sha256: createHash('sha256').update(readFileSync(replacementPath)).digest('hex'),
            entryName: first.path,
        }
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true })
    }
}
