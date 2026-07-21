import { api, type StartupPhase } from './api'

const phases: Exclude<StartupPhase, 'error'>[] = ['prepare', 'interface', 'game', 'mods', 'ready']

const labels: Record<StartupPhase, string> = {
    prepare: 'Preparing application data',
    interface: 'Loading interface',
    game: 'Detecting game installation',
    mods: 'Reading installed mods',
    ready: 'Opening Modrex',
    error: 'Startup could not finish',
}

const splash = document.querySelector<HTMLElement>('.splash')!
const status = document.getElementById('status')!
const percentage = document.getElementById('percentage')!
const progress = document.getElementById('progress-bar')!
const recovery = document.getElementById('recovery') as HTMLButtonElement
const version = document.getElementById('version')!
let opening = false

version.textContent = 'VERSION ' + import.meta.env.VITE_APP_VERSION

async function openModrex() {
    if (opening) return
    opening = true
    recovery.disabled = true
    try {
        await api.finishStartup()
    } catch {
        opening = false
        recovery.disabled = false
        renderPhase('error')
    }
}

function renderPhase(phase: StartupPhase) {
    status.textContent = labels[phase]
    splash.dataset.status = phase

    if (phase === 'error') return

    const currentIndex = phases.indexOf(phase)
    const percent = ((currentIndex + 1) / phases.length) * 100
    progress.style.transform = 'scaleX(' + percent / 100 + ')'
    percentage.textContent = percent + '%'

    if (phase === 'ready') {
        void openModrex()
    }
}

const stopListening = api.onStartupProgress(renderPhase)
api.getStartupPhase()
    .then(renderPhase)
    .catch(() => renderPhase('error'))
recovery.addEventListener('click', () => void openModrex())
window.addEventListener('beforeunload', stopListening)
