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
  inject: ['injects-shim.js'],
  bundle: true,
  // Keep esbuild external so its lib/main.js stays a separate file in the
  // dist. Bundling esbuild inlines its code, which makes __filename inside
  // the Worker it spawns for transformSync point at the bundle — that causes
  // the Worker to re-execute the entire CLI. esbuild's docs and upstream
  // guard explicitly warn that "the esbuild JavaScript API cannot be
  // bundled". See issue #13574.
  external: ['esbuild'],
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
