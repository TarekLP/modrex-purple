import { Children, cloneElement, isValidElement, type ReactNode } from 'react'
import * as bbcode from 'bbcode-to-react'
import { api } from '../api'
import { YOUTUBE_EMBED } from '../embeds'
import { t } from '../i18n'
import { EmbedPlayer } from './EmbedPlayer'

// Nexus mod descriptions are BBCode. Parsed here with the actual bbcode-to-react
// library, the same one Nexus's own mod manager Vortex uses (Nexus-Mods/Vortex,
// src/renderer/src/controls/bbcode/), instead of a hand-rolled regex approximation.
// A real tokenizing parser handles malformed input the way Vortex does. Regex can only
// match shapes it was written against.
const { Tag, Parser } = bbcode

// A textarea is RCDATA. Setting its innerHTML decodes entities without parsing markup
// as real elements.
function decodeEntities(text: string): string {
    const el = document.createElement('textarea')
    el.innerHTML = text
    return el.value
}

// Vortex's own preprocessing step: real description data mixes literal br HTML into
// otherwise-BBCode text, normalized into the br tag before parsing. Real Nexus data
// terminates every line with a newline directly followed by a literal br, so the
// newline is swallowed into the same match. Left as a separate text node it breaks the
// block-adjacency check in stripRedundantBreaks below.
function preprocess(text: string): string {
    return decodeEntities(text.replace(/\n?<br\s*\/?>\n?/gi, '[br][/br]'))
}

// Tag.getContent() always HTML-escapes its text (it exists to build a safe HTML
// string for toHTML). toReact has no string to escape into, so a value read this way
// for use as a raw prop (an image src, a bare url) needs the escape undone, or a real
// ampersand in a URL comes back out as the literal text "amp" entity form. Confirmed
// against a live Nexus mod whose button image lost all its styling this way, since its
// colors are set through the query string.
function decodeContentEscape(text: string): string {
    return decodeEntities(text)
}

// Vortex's own br tag, not a bbcode-to-react default.
class BrTag extends Tag {
    toReact() {
        return <br />
    }
}

// Vortex's own size override, a relative scale in rem rather than the base library's
// pixel size.
class SizeTag extends Tag {
    toReact() {
        const size = Number(this.params.size)
        if (Number.isNaN(size)) return Children.toArray(this.getComponents())
        return (
            <span style={{ fontSize: `${1 + size * 0.1}rem` }}>
                {Children.toArray(this.getComponents())}
            </span>
        )
    }
}

class LineTag extends Tag {
    constructor(renderer: unknown, settings: unknown) {
        super(renderer, settings)
        // Nexus emits line without a closing tag. It must not adopt the rest of the
        // description as children and progressively nest every later divider.
        this.SELF_CLOSE = true
        this.STRIP_OUTER = true
    }

    toReact() {
        return <hr />
    }
}

class HeadingTag extends Tag {
    toReact() {
        return <h3>{Children.toArray(this.getComponents())}</h3>
    }
}

class FontTag extends Tag {
    toReact() {
        return (
            <span style={{ fontFamily: this.params.font }}>
                {Children.toArray(this.getComponents())}
            </span>
        )
    }
}

class YoutubeTag extends Tag {
    toReact() {
        const value = decodeContentEscape(this.renderer.strip(this.getContent(true)))
        const id =
            YOUTUBE_EMBED.detect(value) ?? (/^[A-Za-z0-9_-]{6,20}$/.test(value) ? value : null)
        if (!id) return Children.toArray(this.getComponents())
        return <EmbedPlayer embed={{ def: YOUTUBE_EMBED, id }} />
    }
}

class SpoilerTag extends Tag {
    toReact() {
        return (
            <details className="my-2 border border-border rounded-lg overflow-hidden">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text bg-surface-raised hover:bg-surface-hover transition-colors select-none">
                    {this.params.label || t('detail.spoiler')}
                </summary>
                <div className="px-3 py-2">{Children.toArray(this.getComponents())}</div>
            </details>
        )
    }
}

// Overrides the base library's own url, link and email tags (which open a plain
// target blank anchor) to route through api.openExternal instead, matching
// MarkdownContentImpl's own link handling. Mod descriptions are attacker controlled.
class LinkTag extends Tag {
    toReact() {
        // An explicit param (the equals form) comes straight from the raw token and
        // was never escaped. Only the getContent fallback (a bare url with no param)
        // needs the escape undone.
        let url = this.renderer.strip(
            this.params[this.name] || decodeContentEscape(this.getContent(true))
        )
        if (/javascript:/i.test(url)) url = ''
        if (!url.length) return Children.toArray(this.getComponents())
        if (this.name === 'email') url = `mailto:${url}`
        if (!/^(https?|mailto):/i.test(url)) return Children.toArray(this.getComponents())
        const href = url
        return (
            // eslint-disable-next-line no-restricted-syntax -- gated: scheme allowlisted above, click routed through api.openExternal
            <a
                href={href}
                onClick={(e) => {
                    e.preventDefault()
                    api.openExternal(href)
                }}
                className="text-accent-bright underline cursor-pointer"
            >
                {Children.toArray(this.getComponents())}
            </a>
        )
    }
}

function imageDimension(value: string | undefined): number | undefined {
    if (!value) return undefined
    const dimension = Number(value)
    if (!Number.isInteger(dimension) || dimension <= 0 || dimension > 4096) return undefined
    return dimension
}

class ImageTag extends Tag {
    constructor(renderer: unknown, settings: unknown) {
        super(renderer, settings)
        // The img=URL form is self-closing, while img with URL content needs its
        // closing tag so the parser can collect that content.
        this.SELF_CLOSE = Boolean(this.params.img)
    }

    toReact() {
        const src = decodeContentEscape(
            this.renderer.strip(this.params.img || this.getContent(true))
        )
        if (!src.length) return null
        if (!/^https?:/i.test(src)) return null

        let layoutClass = 'inline-block'
        switch (this.params.align?.toLowerCase()) {
            case 'center':
                layoutClass = 'block mx-auto'
                break
            case 'right':
                layoutClass = 'block ml-auto'
                break
            case 'left':
                layoutClass = 'block mr-auto'
                break
        }

        return (
            <img
                src={src}
                alt=""
                loading="lazy"
                width={imageDimension(this.params.width)}
                height={imageDimension(this.params.height)}
                className={[layoutClass, 'max-w-full h-auto rounded my-2'].join(' ')}
            />
        )
    }
}

const parser = new Parser()
parser.registerTag('br', BrTag)
parser.registerTag('size', SizeTag)
parser.registerTag('line', LineTag)
parser.registerTag('heading', HeadingTag)
parser.registerTag('font', FontTag)
parser.registerTag('youtube', YoutubeTag)
parser.registerTag('spoiler', SpoilerTag)
parser.registerTag('url', LinkTag)
parser.registerTag('link', LinkTag)
parser.registerTag('email', LinkTag)
parser.registerTag('img', ImageTag)

// A br immediately next to a block element's boundary is dead space, since the block
// already starts its own line. Confirmed against a real mod description where this
// doubled the visible spacing between every section.
const BLOCK_TYPES = new Set([
    'div',
    'blockquote',
    'details',
    'figure',
    'ul',
    'ol',
    'li',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'pre',
    'table',
])

function isBr(node: ReactNode): boolean {
    return isValidElement(node) && node.type === 'br'
}

function isBlock(node: ReactNode): boolean {
    return isValidElement(node) && typeof node.type === 'string' && BLOCK_TYPES.has(node.type)
}

function stripRedundantBreaks(nodes: ReactNode[]): ReactNode[] {
    return nodes.filter(
        (node, i) => !isBr(node) || (!isBlock(nodes[i - 1]) && !isBlock(nodes[i + 1]))
    )
}

function stripTrailingBreaks(nodes: ReactNode[]): ReactNode[] {
    const result = [...nodes]
    while (isBr(result.at(-1))) result.pop()
    return result
}

function normalizeNode(node: ReactNode): ReactNode {
    if (!isValidElement<{ children?: ReactNode }>(node)) return node
    if (node.props.children === undefined) return node

    let children = normalizeNodes(Children.toArray(node.props.children))
    if (node.type === 'li') children = stripTrailingBreaks(children)
    return cloneElement(node, undefined, children)
}

function normalizeNodes(nodes: ReactNode[]): ReactNode[] {
    return stripRedundantBreaks(nodes.map(normalizeNode))
}

export function NexusDescription({ text }: { text: string }) {
    const nodes = Children.toArray(parser.toReact(preprocess(text)))
    return <div className="nexus-description">{normalizeNodes(nodes)}</div>
}
