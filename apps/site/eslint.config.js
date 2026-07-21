import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import astroPlugin from 'eslint-plugin-astro'

export default tseslint.config(
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    ...astroPlugin.configs['flat/recommended'],
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        ignores: ['dist/', '.astro/', 'node_modules/', 'claude-design/'],
    }
)
