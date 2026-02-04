import baseConfig from './packages/standards/src/eslint.js'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.serverless/**',
      '**/coverage/**',
      'packages/serverless/lib/plugins/aws/dev/shim.min.js',
    ],
  },
  ...baseConfig.map((config) => ({
    ...config,
    files: [
      'packages/sf-core/{src,tests,bin,scripts}/**/*.{js,cjs,mjs}',
      'packages/sf-core/*.cjs',
      'packages/engine/{src,integration,test}/**/*.{js,mjs}',
      'packages/serverless/{lib,test}/**/*.{js,cjs,mjs}',
      'packages/mcp/{src,tests}/**/*.js',
      'packages/util/{src,index.js}/**/*.js',
      'packages/util/index.js',
      'packages/standards/{src,index.js}/**/*.js',
      'packages/standards/index.js',
      'packages/sf-core-installer/{binary,postInstall,run}.js',
      'release-scripts/scripts/**/*.js',
      '*.{js,mjs,cjs}',
    ],
  })),
]
