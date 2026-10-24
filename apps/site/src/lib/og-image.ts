import { getImage } from 'astro:assets'
import browseMods from '../assets/screenshots/browse-mods-window.webp'

// Derived from the screenshot rather than pointing at it: the source is a 2560px WebP,
// which scrapers may not decode, at a size and aspect ratio no card expects. Generated
// at build time so it can never drift from the screenshot it is cut from. JPEG, not
// PNG, because Astro's PNG encoder does not quantize and lands around 780kB here;
// scrapers are the one audience with no WebP or AVIF guarantee. Astro deduplicates the
// transform, so every page calling this shares one generated file.
export function getOgImage() {
    return getImage({
        src: browseMods,
        width: 1200,
        height: 630,
        fit: 'cover',
        position: 'top',
        format: 'jpeg',
        quality: 82,
    })
}
