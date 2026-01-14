import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
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
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.test.js', '**/tests/**/*.js', '**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.jasmine,
        _: 'readonly',
      },
    },
  },
]
