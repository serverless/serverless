import esbuild from 'esbuild'

await esbuild.build({
  platform: 'node',
  format: 'esm',
  entryPoints: ['./bin/sf-core.js'],
  outfile: '../framework-dist/dist/sf-core.js',
  external: [
    'esbuild',
    'ajv',
    'ajv-formats',
    '@aws-sdk/signature-v4-crt',
    '@aws-sdk/signature-v4a',
    '@aws-sdk/client-cloudfront-keyvaluestore',
  ],
  inject: ['injects-shim.js'],
  bundle: true,
  minify: false,
  minifyIdentifiers: false,
  minifySyntax: true,
  minifyWhitespace: true,
  sourcemap: true,
  loader: {
    '.node': 'file',
  },
})
