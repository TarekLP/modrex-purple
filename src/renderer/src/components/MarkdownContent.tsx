import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { t } from '../i18n'
import { detectEmbed, EMBEDS, type EmbedDef, type Embed } from '../embeds'

type Part =
    | { type: 'text'; text: string }
    | { type: 'embed'; embed: Embed }
    | { type: 'collapsible'; title: string; body: string }

function splitEmbeds(text: string, defs: EmbedDef[]): Part[] {
    const parts: Part[] = []
    const re = /!\[[^\]]*\]\(([^)]+)\)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = re.exec(text)) !== null) {
        const embed = detectEmbed(match[1], defs)
        if (!embed) continue

        if (match.index > lastIndex) {
            parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
        }
        parts.push({ type: 'embed', embed })
        lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
        parts.push({ type: 'text', text: text.slice(lastIndex) })
    }

    return parts.length > 0 ? parts : [{ type: 'text', text }]
}

// Modworkshop uses !!! Title ... !!! as a collapsible section syntax not in standard markdown.
// Collapsibles are split at the React level so their body is still parsed as markdown.
function splitParts(text: string, defs: EmbedDef[]): Part[] {
    const result: Part[] = []
    const re = /^!!! (.+)\n([\s\S]*?)^!!!$/gm
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            result.push(...splitEmbeds(text.slice(lastIndex, match.index), defs))
        }
        result.push({ type: 'collapsible', title: match[1].trim(), body: match[2] })
        lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
        result.push(...splitEmbeds(text.slice(lastIndex), defs))
    }

    return result.length > 0 ? result : splitEmbeds(text, defs)
}

function EmbedPlayer({ embed }: { embed: Embed }) {
    const [playing, setPlaying] = useState(false)
    const { def, id } = embed

    return (
        <div className="my-3 overflow-hidden border border-border bg-surface max-w-xl">
            <div className="relative" style={{ aspectRatio: '16 / 9' }}>
                {playing ? (
                    <iframe
                        src={def.embedUrl(id)}
                        className="absolute inset-0 w-full h-full"
                        style={{ border: 'none' }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                ) : (
                    <>
                        <img
                            src={def.thumbnailUrl(id)}
                            alt={t('embed.videoThumbnail')}
                            draggable={false}
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        />
                        <button
                            className="absolute inset-0 flex items-center justify-center group"
                            onClick={() => setPlaying(true)}
                            aria-label={t('embed.play')}
                        >
                            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors duration-150" />
                            <div className="relative flex items-center justify-center w-14 h-14 bg-black/50 rounded-full shadow-2xl group-hover:scale-105 group-hover:bg-black/70 transition-all duration-150">
                                <svg
                                    className="w-6 h-6 text-white"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

function makeMdComponents(defs: EmbedDef[]): Components {
    return {
        p: ({ children }) => (
            <div className="text-sm text-text-muted leading-relaxed mb-2">{children}</div>
        ),
        h1: ({ children }) => (
            <h1 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h1>
        ),
        h2: ({ children }) => (
            <h2 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h2>
        ),
        h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h3>
        ),
        h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-text mt-4 mb-1">{children}</h4>
        ),
        ul: ({ children }) => (
            <ul className="list-disc ml-5 mb-2 text-sm text-text-muted">{children}</ul>
        ),
        ol: ({ children }) => (
            <ol className="list-decimal ml-5 mb-2 text-sm text-text-muted">{children}</ol>
        ),
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        a: ({ href, children }) => {
            if (!href || href.startsWith('javascript:')) return <>{children}</>
            return (
                <a
                    onClick={(e) => {
                        e.preventDefault()
                        window.api.openExternal(href)
                    }}
                    className="text-accent-bright underline cursor-pointer"
                >
                    {children}
                </a>
            )
        },
        strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
            <code className="font-mono text-[0.85em] bg-surface-hover px-1 py-0.5 rounded">
                {children}
            </code>
        ),
        pre: ({ children }) => (
            <pre className="bg-surface-hover rounded p-3 my-2 overflow-x-auto text-sm font-mono text-text-muted">
                {children}
            </pre>
        ),
        img: ({ src, alt }) => {
            if (!src) return null
            return <img src={src} alt={alt} loading="lazy" className="max-w-full rounded my-2" />
        },
        hr: () => <hr className="border-none border-t border-border my-3" />,
        blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-text-muted italic my-2">
                {children}
            </blockquote>
        ),
        table: ({ children }) => (
            <table className="w-full text-sm text-left border-collapse my-2">{children}</table>
        ),
        th: ({ children }) => (
            <th className="border border-border px-3 py-1.5 text-text font-semibold bg-surface-raised">
                {children}
            </th>
        ),
        td: ({ children }) => (
            <td className="border border-border px-3 py-1.5 text-text-muted">{children}</td>
        ),
        div: ({ children, className }) => <div className={className}>{children}</div>,
        span: ({ children }) => <span>{children}</span>,
        section: ({ children }) => <section>{children}</section>,
        figure: ({ children }) => <figure className="my-2">{children}</figure>,
        figcaption: ({ children }) => (
            <figcaption className="text-xs text-text-subtle mt-1">{children}</figcaption>
        ),
        br: () => <br />,
        iframe: ({ src }) => {
            if (!src) return null
            const embed = detectEmbed(src, defs)
            return embed ? <EmbedPlayer embed={embed} /> : null
        },
        script: () => null,
        style: () => null,
        object: () => null,
        embed: () => null,
    }
}

export function MarkdownContent({ text, embeds = EMBEDS }: { text: string; embeds?: EmbedDef[] }) {
    const components = useMemo(() => makeMdComponents(embeds), [embeds])
    const parts = splitParts(text, embeds)

    return (
        <div>
            {parts.map((part, i) => {
                if (part.type === 'embed') return <EmbedPlayer key={i} embed={part.embed} />
                if (part.type === 'collapsible') {
                    return (
                        <details
                            key={i}
                            className="my-2 border border-border rounded-lg overflow-hidden"
                        >
                            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text bg-surface-raised hover:bg-surface-hover transition-colors select-none">
                                {part.title}
                            </summary>
                            <div className="px-3">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={components}
                                >
                                    {part.body}
                                </ReactMarkdown>
                            </div>
                        </details>
                    )
                }
                return (
                    <ReactMarkdown
                        key={i}
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={components}
                    >
                        {part.text}
                    </ReactMarkdown>
                )
            })}
        </div>
    )
}
