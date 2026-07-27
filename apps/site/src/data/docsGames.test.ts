import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GAME_IDS, GAMES } from '@modrex/games'
import { describe, expect, it } from 'vitest'
import { docsGameRegistry, docsGames } from './docsGames'

const gameDocsDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../content/docs/docs/games'
)

describe('documentation game registry', () => {
    it('registers every game known to the app', () => {
        expect(Object.keys(docsGameRegistry).sort()).toEqual([...GAME_IDS].sort())
    })

    it('has exactly one MDX page for every published game', () => {
        const pageSlugs = readdirSync(gameDocsDirectory)
            .filter((name) => name.endsWith('.mdx') && name !== 'index.mdx')
            .map((name) => name.slice(0, -'.mdx'.length))
            .sort()
        const publishedSlugs = docsGames.map((game) => game.slug).sort()

        expect(pageSlugs).toEqual(publishedSlugs)
        expect(new Set(publishedSlugs).size).toBe(publishedSlugs.length)
    })

    it('uses canonical mod target IDs from each game specification', () => {
        for (const id of GAME_IDS) {
            const registration = docsGameRegistry[id]
            if (registration.status === 'unreleased') {
                expect(registration.reason.trim()).not.toBe('')
                continue
            }

            const canonicalTargetIds = GAMES[id].modTargets.map((target) => target.id)
            for (const target of registration.targets) {
                if ('targetId' in target) {
                    expect(canonicalTargetIds).toContain(target.targetId)
                }
            }
        }
    })
})
