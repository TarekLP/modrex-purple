import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
    },
    renderer: {
        define: {
            'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
        },
        plugins: [react(), tailwindcss()],
    },
})
