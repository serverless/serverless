import jest from 'eslint-plugin-jest'
import baseConfig from './packages/standards/src/eslint.js'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.serverless/**',
      '**/coverage/**',
    ],
  },
  ...baseConfig.map((config) => ({
    ...config,
    files: [
      'packages/sf-core/{src,tests,bin,scripts}/**/*.{js,cjs,mjs}',
      'packages/sf-core/*.cjs',
      'packages/engine/{src,integration,test}/**/*.{js,mjs}',
      'packages/serverless/{lib,scripts,test}/**/*.{js,cjs,mjs}',
      'packages/mcp/{src,tests}/**/*.js',
      'packages/util/{src,index.js}/**/*.js',
      'packages/util/index.js',
      'packages/standards/{src,index.js}/**/*.js',
      'packages/standards/index.js',
      'packages/sf-core-installer/{binary,download,proxy,postInstall,run}.js',
      'release-scripts/scripts/**/*.js',
      '*.{js,mjs,cjs}',
    ],
  })),
  // An un-awaited `expect(...).rejects` settles after its test has finished,
  // and Jest reports the failure against whichever suite is running then.
  {
    files: [
      'packages/sf-core/tests/**/*.{js,cjs,mjs}',
      'packages/engine/test/**/*.{js,mjs}',
      'packages/serverless/test/**/*.{js,cjs,mjs}',
      'packages/mcp/tests/**/*.js',
    ],
    plugins: { jest },
    rules: {
      'jest/valid-expect': 'error',
    },
  },
]
