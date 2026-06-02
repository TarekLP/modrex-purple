import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
    { ignores: ['node_modules/**', 'out/**', 'src-tauri/**'] },
    {
        files: ['src/renderer/src/**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-hooks/set-state-in-effect': 'off',
        },
        languageOptions: {
            globals: globals.browser,
        },
    }
)
