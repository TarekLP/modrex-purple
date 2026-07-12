import { useState, useEffect } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { Button } from './ui/Button'
import { Tooltip } from './Tooltip'
import { api } from '../api'
import { t } from '../i18n'

export function WindowControls() {
    const [maximized, setMaximized] = useState(false)

    useEffect(() => {
        let disposed = false
        const sync = () =>
            api.windowIsMaximized().then((m) => {
                if (!disposed) setMaximized(m)
            })
        sync()
        const off = api.onWindowResized(sync)
        return () => {
            disposed = true
            off()
        }
    }, [])

    return (
        <div className="flex items-stretch self-stretch">
            <Tooltip content={t('topBar.minimize')}>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('topBar.minimize')}
                    onClick={() => api.windowMinimize()}
                    className="w-11 rounded-none"
                >
                    <Minus className="w-3.5 h-3.5" />
                </Button>
            </Tooltip>
            <Tooltip content={maximized ? t('topBar.restore') : t('topBar.maximize')}>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={maximized ? t('topBar.restore') : t('topBar.maximize')}
                    onClick={() => api.windowToggleMaximize()}
                    className="w-11 rounded-none"
                >
                    {maximized ? (
                        <Copy className="w-3 h-3 -scale-x-100" />
                    ) : (
                        <Square className="w-3 h-3" />
                    )}
                </Button>
            </Tooltip>
            <Tooltip content={t('topBar.close')}>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('topBar.close')}
                    onClick={() => api.windowClose()}
                    className="w-11 rounded-none hover:bg-danger hover:text-text"
                >
                    <X className="w-4 h-4" />
                </Button>
            </Tooltip>
        </div>
    )
}
