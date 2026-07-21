import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from './package.json'

const startupIconPath = fileURLToPath(new URL('./assets/icon.png', import.meta.url)).replaceAll(
    '\\',
    '/'
)

export default defineConfig({
    root: 'src/renderer',
    clearScreen: false,
    server: {
        port: 5173,
        strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
    plugins: [
        {
            name: 'startup-icon-dev-path',
            transformIndexHtml: {
                order: 'pre',
                handler(html, context) {
                    if (!context.server) return html
                    return html.replace('../../assets/icon.png', `/@fs/${startupIconPath}`)
                },
            },
        },
        svgr(),
        react(),
        tailwindcss(),
    ],
    build: {
        outDir: '../../out/renderer',
        emptyOutDir: true,
        target: 'chrome105',
        minify: true,
        sourcemap: false,
        rolldownOptions: {
            input: {
                main: resolve(import.meta.dirname, 'src/renderer/index.html'),
                splash: resolve(import.meta.dirname, 'src/renderer/splash.html'),
            },
        },
    },
})
