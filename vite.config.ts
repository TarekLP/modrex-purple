import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

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
    plugins: [react(), tailwindcss()],
    build: {
        outDir: '../../out/renderer',
        emptyOutDir: true,
        target: 'chrome105',
        minify: true,
        sourcemap: false,
    },
})
