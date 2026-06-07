import appIcon from '../../../../assets/icon.png'
import type { GameId } from '../../../shared/types'
import { GAMES } from '../../../shared/types'

const GAME_STYLES: Record<GameId, { background: string; nameColor: string }> = {
    pd3: {
        background: 'linear-gradient(135deg, #1c0808 0%, #3d1212 100%)',
        nameColor: '#e05555',
    },
    pd2: {
        background: 'linear-gradient(135deg, #1a1306 0%, #3d2d0f 100%)',
        nameColor: '#e09020',
    },
}

interface Props {
    onSelectGame: (g: GameId) => void
}

export function WelcomeScreen({ onSelectGame }: Props) {
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
                    const s = GAME_STYLES[g]
                    return (
                        <button
                            key={g}
                            onClick={() => onSelectGame(g)}
                            className="group relative w-64 h-44 rounded-2xl border border-border overflow-hidden transition-all duration-200 hover:scale-[1.03] focus:outline-none"
                            style={{ background: s.background }}
                        >
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                    style={{
                                        fontFamily: "'Bebas Neue', sans-serif",
                                        fontSize: '2.8rem',
                                        letterSpacing: '0.08em',
                                        color: s.nameColor,
                                        lineHeight: 1,
                                    }}
                                >
                                    {GAMES[g].name}
                                </span>
                            </div>
                            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-200" />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
