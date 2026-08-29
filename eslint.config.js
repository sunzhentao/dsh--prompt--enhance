import js from '@eslint/js'
import globals from 'globals'

const styleRules = {
  indent: ['error', 2],
  quotes: ['error', 'single'],
  semi: ['error', 'never'],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
}

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['lib/index.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: styleRules,
  },
  {
    files: ['lib/client.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __ModuleLoader__: 'readonly',
      },
    },
    rules: styleRules,
  },
]
