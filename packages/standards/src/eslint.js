import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import globals from 'globals'

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'no-async-promise-executor': 'off',
    },
  },
  {
    files: ['**/*.test.js', '**/tests/**/*.js', '**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        _: 'readonly',
      },
    },
  },
]
