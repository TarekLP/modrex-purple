import AdmZip from 'adm-zip'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface ContentEntry {
    sha256: string
    entryName: string
}

const contentExtensions = ['.pak', '.ucas', '.utoc', '.lua']

function matchesContentExtension(name: string): boolean {
    const lower = name.toLowerCase()
    return contentExtensions.some((extension) => lower.endsWith(extension))
}

function detectFormat(buffer: Buffer): 'zip' | '7z' | 'rar' | 'pak' {
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
    ) {
        return 'zip'
    }
    if (
        buffer.length >= 6 &&
        buffer[0] === 0x37 &&
        buffer[1] === 0x7a &&
        buffer[2] === 0xbc &&
        buffer[3] === 0xaf &&
        buffer[4] === 0x27 &&
        buffer[5] === 0x1c
    ) {
        return '7z'
    }
    if (
        buffer.length >= 6 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x61 &&
        buffer[2] === 0x72 &&
        buffer[3] === 0x21 &&
        buffer[4] === 0x1a &&
        buffer[5] === 0x07
    ) {
        return 'rar'
    }
    return 'pak'
}

function hashContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex')
}

function extractWith7z(buffer: Buffer, extension: '.7z' | '.rar'): ContentEntry[] {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'modrex-idx-'))
    try {
        const archive = join(temporaryDirectory, `archive${extension}`)
        const outputDirectory = join(temporaryDirectory, 'out')
        writeFileSync(archive, buffer)
        if (extension === '.7z') {
            execFileSync(
                '7z',
                [
                    'x',
                    archive,
                    `-o${outputDirectory}`,
                    ...contentExtensions.map((item) => `*${item}`),
                    '-r',
                    '-y',
                ],
                { stdio: 'ignore' }
            )
            return (readdirSync(outputDirectory, { recursive: true }) as string[])
                .filter(matchesContentExtension)
                .map((entryName) => ({
                    sha256: hashContent(readFileSync(join(outputDirectory, entryName))),
                    entryName: entryName.replace(/\\/g, '/'),
                }))
        }

        execFileSync('7z', ['x', archive, `-o${outputDirectory}`, '-y'], { stdio: 'ignore' })
        return (readdirSync(outputDirectory, { recursive: true }) as string[])
            .filter((entryName) => {
                try {
                    return (
                        matchesContentExtension(entryName) &&
                        statSync(join(outputDirectory, entryName)).isFile()
                    )
                } catch {
                    return false
                }
            })
            .map((entryName) => ({
                sha256: hashContent(readFileSync(join(outputDirectory, entryName))),
                entryName: entryName.replace(/\\/g, '/'),
            }))
    } catch {
        return []
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true })
    }
}

export function extractContentEntries(buffer: Buffer, fallbackName: string): ContentEntry[] {
    const format = detectFormat(buffer)

    if (format === 'zip') {
        try {
            const archive = new AdmZip(buffer)
            return archive
                .getEntries()
                .filter((entry) => !entry.isDirectory && matchesContentExtension(entry.entryName))
                .map((entry) => ({
                    sha256: hashContent(entry.getData()),
                    entryName: entry.entryName.replace(/\\/g, '/'),
                }))
        } catch {
            return []
        }
    }
    if (format === '7z') return extractWith7z(buffer, '.7z')
    if (format === 'rar') return extractWith7z(buffer, '.rar')

    return [{ sha256: hashContent(buffer), entryName: fallbackName }]
}
