import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
const version = pkg.version

console.log(`Building SEA bundle for Serverless Framework v${version}`)

const seaEntryBanner = fs.readFileSync(
  path.resolve(__dirname, 'sea/sea-entry.js'),
  'utf8',
)

await esbuild.build({
  platform: 'node',
  format: 'esm',

  entryPoints: ['./sea/bundle-entry.js'],
  outfile: './dist/sf-core.bundle.js',

  external: [],

  banner: {
    js: seaEntryBanner,
  },

  // Reuse the original injects-shim.js — import.meta.url works natively in
  // ESM SEA and resolves to the binary's location. Support files are extracted
  // next to the binary, so all existing __dirname-based paths resolve correctly.
  inject: ['injects-shim.js'],

  nodePaths: [
    path.resolve(__dirname, '../serverless/node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],

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

console.log('SEA bundle created: dist/sf-core.bundle.js')
