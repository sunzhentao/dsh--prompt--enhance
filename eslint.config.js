import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        __ModuleLoader__: 'readonly',
      },
    },
    rules: {
      indent: ['error', 2],
      quotes: ['error', 'single'],
      semi: ['error', 'never'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
]
