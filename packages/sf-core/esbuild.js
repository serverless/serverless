import esbuild from 'esbuild'
import fs from 'fs'

import { execSync } from 'child_process'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
let version = pkg.version

if (process.env.IS_CANARY === 'true') {
  version = execSync('git rev-parse --short HEAD').toString().trim()
}

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
  define: {
    __SF_CORE_VERSION__: JSON.stringify(version),
  },
})
