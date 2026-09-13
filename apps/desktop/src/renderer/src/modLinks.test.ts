import { describe, it, expect } from 'vitest'
import { parseModworkshopModId } from './modLinks'

describe('parseModworkshopModId', () => {
    it('parses standard https ModWorkshop mod URLs', () => {
        expect(parseModworkshopModId('https://modworkshop.net/mod/12345')).toBe(12345)
        expect(parseModworkshopModId('https://www.modworkshop.net/mod/12345')).toBe(12345)
        expect(parseModworkshopModId('http://modworkshop.net/mod/12345')).toBe(12345)
        expect(parseModworkshopModId('http://www.modworkshop.net/mod/12345')).toBe(12345)
    })

    it('parses URLs with trailing slashes, queries, hashes, or subpaths', () => {
        expect(parseModworkshopModId('https://modworkshop.net/mod/12345/')).toBe(12345)
        expect(parseModworkshopModId('https://modworkshop.net/mod/12345?tab=description')).toBe(
            12345
        )
        expect(parseModworkshopModId('https://modworkshop.net/mod/12345#downloads')).toBe(12345)
        expect(parseModworkshopModId('https://modworkshop.net/mod/12345/comments')).toBe(12345)
    })

    it('returns null for non-mod ModWorkshop paths', () => {
        expect(parseModworkshopModId('https://modworkshop.net/game/1')).toBeNull()
        expect(parseModworkshopModId('https://modworkshop.net/user/456')).toBeNull()
        expect(parseModworkshopModId('https://modworkshop.net/')).toBeNull()
    })

    it('returns null for non-ModWorkshop URLs', () => {
        expect(parseModworkshopModId('https://nexusmods.com/payday3/mods/123')).toBeNull()
        expect(parseModworkshopModId('https://github.com/modrexio/modrex')).toBeNull()
        expect(parseModworkshopModId('https://google.com')).toBeNull()
    })

    it('returns null for invalid or empty inputs', () => {
        expect(parseModworkshopModId('')).toBeNull()
        expect(parseModworkshopModId('   ')).toBeNull()
        expect(parseModworkshopModId(null)).toBeNull()
        expect(parseModworkshopModId(undefined)).toBeNull()
        expect(parseModworkshopModId('not a url')).toBeNull()
        expect(parseModworkshopModId('/mod/12345')).toBeNull()
        expect(parseModworkshopModId('modworkshop.net/mod/12345')).toBeNull()
        expect(parseModworkshopModId('https://modworkshop.net/mod/not-a-number')).toBeNull()
        expect(parseModworkshopModId('https://modworkshop.net/mod/0')).toBeNull()
        expect(parseModworkshopModId('https://modworkshop.net/mod/-5')).toBeNull()
    })
})
