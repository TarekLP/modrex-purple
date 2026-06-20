import { useState } from 'react'
import appIcon from '../../../../assets/icon.png'
import type { GameId } from '../../../shared/types'
import { GAMES } from '../../../shared/types'

const CDN_URLS: Record<GameId, string> = {
    pd3: 'https://cdn.akamai.steamstatic.com/steam/apps/1272080/library_600x900.jpg',
    pd2: 'https://cdn.akamai.steamstatic.com/steam/apps/218620/library_600x900.jpg',
    pdth: 'https://cdn.akamai.steamstatic.com/steam/apps/24240/library_600x900.jpg',
    cb: 'https://cdn.akamai.steamstatic.com/steam/apps/2933080/library_600x900.jpg',
}

const FALLBACK_STYLES: Record<GameId, { background: string; nameColor: string }> = {
    pd3: { background: 'linear-gradient(135deg, #1c0808 0%, #3d1212 100%)', nameColor: '#e05555' },
    pd2: { background: 'linear-gradient(135deg, #1a1306 0%, #3d2d0f 100%)', nameColor: '#e09020' },
    pdth: { background: 'linear-gradient(135deg, #060d1a 0%, #0f1f3d 100%)', nameColor: '#5588cc' },
    cb: { background: 'linear-gradient(135deg, #1a062b 0%, #3d0f3a 100%)', nameColor: '#e055c9' },
}

interface Props {
    onSelectGame: (g: GameId) => void
}

export function WelcomeScreen({ onSelectGame }: Props) {
    const [failed, setFailed] = useState<Partial<Record<GameId, boolean>>>({})

    return (
        <div className="h-full flex flex-col items-center justify-center gap-10 p-8 bg-surface">
            <div className="flex flex-col items-center gap-3">
                <img src={appIcon} alt="Modrex" className="w-14 h-14 opacity-90" />
                <h1
                    style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: '2.5rem',
                        letterSpacing: '0.05em',
                        lineHeight: 1,
                    }}
                >
                    <span style={{ color: 'var(--color-text)' }}>MOD</span>
                    <span style={{ color: 'var(--color-accent)' }}>REX</span>
                </h1>
                <p className="text-sm text-text-muted">Choose your game</p>
            </div>

            <div className="flex gap-6">
                {(Object.keys(GAMES) as GameId[]).map((g) => {
                    const fallback = FALLBACK_STYLES[g]
                    const showFallback = failed[g]
                    return (
                        <button
                            key={g}
                            onClick={() => onSelectGame(g)}
                            className="group relative rounded-2xl border border-border overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:border-accent/50 focus:outline-none focus:border-accent/50 shadow-lg"
                            style={{ width: 200, height: 300 }}
                        >
                            {showFallback ? (
                                <div
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{ background: fallback.background }}
                                >
                                    <span
                                        style={{
                                            fontFamily: "'Bebas Neue', sans-serif",
                                            fontSize: '2.2rem',
                                            letterSpacing: '0.08em',
                                            color: fallback.nameColor,
                                            lineHeight: 1,
                                        }}
                                    >
                                        {GAMES[g].name}
                                    </span>
                                </div>
                            ) : (
                                <img
                                    src={CDN_URLS[g]}
                                    alt={GAMES[g].name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    draggable={false}
                                    onError={() => setFailed((prev) => ({ ...prev, [g]: true }))}
                                />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
