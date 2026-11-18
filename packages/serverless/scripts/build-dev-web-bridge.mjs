#!/usr/bin/env node
// Builds the Dev Mode web bridge: lib/plugins/aws/dev/web/bridge/index.mjs and everything it
// imports (the relay protocol, the AWS SDK's STS client, mqtt, ws) bundled by esbuild into one
// ES module for Node.js 24, zipped at the zip's root under the name a web app's dev revision
// starts (WEB_BRIDGE_ENTRY), next to the licences of the npm packages the bundle holds
// (WEB_BRIDGE_NOTICES), generated from esbuild's metafile and node_modules on every build. The
// bundle relies on nothing in the Lambda runtime but Node.js itself.
//
// Output: lib/plugins/aws/dev/web/bridge/dist/sls-dev-web-bridge.zip (gitignored). The zip's bytes
// depend on the source only (fixed entry date and mode), so the S3 key the CLI uploads it under,
// named after its SHA-256, changes only when the bridge does.
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZipArchive } from 'archiver'
import esbuild from 'esbuild'
import {
  WEB_BRIDGE_ENTRY,
  WEB_BRIDGE_NOTICES,
  webBridgeArtifactPath,
} from '../lib/plugins/aws/dev/attach/naming.js'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const entryPoint = path.join(
  packageRoot,
  'lib/plugins/aws/dev/web/bridge/index.mjs',
)

/**
 * Optional native helpers of `ws`, which it requires inside try/catch and does without: left
 * unresolved, so the bundle loads the same with or without them.
 */
export const OPTIONAL_MODULES = Object.freeze(['bufferutil', 'utf-8-validate'])

/** Bundles the bridge; resolves `{ code, metafile }`, `code` the bundle's bytes. */
export const bundleWebBridge = async ({ logLevel = 'silent' } = {}) => {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    // The metafile's paths are relative to it, whatever directory the build runs from.
    absWorkingDir: packageRoot,
    outfile: WEB_BRIDGE_ENTRY,
    write: false,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    minify: true,
    external: [...OPTIONAL_MODULES],
    metafile: true,
    // A CommonJS dependency bundled into an ES module keeps its `require` calls, and an ES module
    // has no `require` to answer them.
    banner: {
      js: [
        "import { createRequire as __slsCreateRequire } from 'node:module'",
        'const require = __slsCreateRequire(import.meta.url)',
      ].join('\n'),
    },
    logLevel,
  })
  return {
    code: Buffer.from(result.outputFiles[0].contents),
    metafile: result.metafile,
  }
}

const PACKAGE_DIR = /^(.*node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/
const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i

/**
 * The npm packages whose code the bundle holds (a package esbuild dropped entirely is not listed),
 * each `{ name, version, license, dir }`, sorted by name and version.
 */
export const bundledPackages = (metafile) => {
  const dirs = new Set()
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      const match = PACKAGE_DIR.exec(input)
      if (match && bytesInOutput > 0) {
        dirs.add(path.resolve(packageRoot, match[1]))
      }
    }
  }
  const packages = new Map()
  for (const dir of dirs) {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, 'package.json'), 'utf8'),
    )
    const key = `${manifest.name}@${manifest.version}`
    if (!packages.has(key)) {
      packages.set(key, {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license,
        dir,
      })
    }
  }
  return [...packages.values()].sort((a, b) =>
    `${a.name} ${a.version}` < `${b.name} ${b.version}` ? -1 : 1,
  )
}

const licenceFilesOf = async (dir) =>
  (await readdir(dir)).filter((name) => LICENCE_FILE.test(name)).sort()

const lf = (text) => {
  const normal = text.replace(/\r\n?/g, '\n')
  return normal.endsWith('\n') ? normal : `${normal}\n`
}

/**
 * The text of WEB_BRIDGE_NOTICES: each bundled package's licence and notice files. A package that
 * ships none gets the licence text of another bundled package under the licence its package.json
 * names; one for which there is none fails the build.
 */
export const thirdPartyNotices = async (metafile) => {
  const packages = bundledPackages(metafile)
  const texts = new Map()
  for (const pkg of packages) {
    pkg.files = await licenceFilesOf(pkg.dir)
    const licence = pkg.files.find((name) => !/^notice/i.test(name))
    if (licence && pkg.license && !texts.has(pkg.license)) {
      texts.set(
        pkg.license,
        await readFile(path.join(pkg.dir, licence), 'utf8'),
      )
    }
  }
  let out =
    `Third-party software in the Serverless Framework Dev Mode web bridge (${WEB_BRIDGE_ENTRY}).\n` +
    'Generated from the npm packages it bundles by scripts/build-dev-web-bridge.mjs when the bridge is built.\n'
  for (const pkg of packages) {
    out += `\n== ${pkg.name} ${pkg.version} ==\n`
    if (pkg.files.length) {
      for (const name of pkg.files) {
        out += `-- ${name} --\n${lf(await readFile(path.join(pkg.dir, name), 'utf8'))}`
      }
    } else if (texts.has(pkg.license)) {
      out += `-- ${pkg.license} (named in its package.json; the package ships no licence file) --\n${lf(texts.get(pkg.license))}`
    } else {
      throw new Error(
        `${pkg.name} ${pkg.version} has no licence file in ${pkg.dir}, and no other bundled package carries the text of its licence (${pkg.license ?? 'none named'})`,
      )
    }
  }
  return out
}

/** The zip of the bundle and its notices at its root: the same bytes for the same content. */
export const zipBundle = (code, notices) =>
  new Promise((resolve, reject) => {
    const chunks = []
    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.on('data', (chunk) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    const entry = { mode: 0o644, date: new Date(0) }
    archive.append(code, { ...entry, name: WEB_BRIDGE_ENTRY })
    archive.append(Buffer.from(notices), { ...entry, name: WEB_BRIDGE_NOTICES })
    archive.finalize()
  })

/** Builds the zip and writes it to `out`; resolves its path and size. */
export const buildWebBridge = async ({
  out = webBridgeArtifactPath(),
  logLevel = 'silent',
} = {}) => {
  const { code, metafile } = await bundleWebBridge({ logLevel })
  const zip = await zipBundle(code, await thirdPartyNotices(metafile))
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(out, zip)
  return { out, bytes: zip.length }
}

// Direct run (`npm run build:devmode:web-bridge`), versus being imported by its test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { out, bytes } = await buildWebBridge({ logLevel: 'warning' })
  console.log(
    `${path.relative(process.cwd(), out)} (${Math.round(bytes / 1024)} KiB)`,
  )
}
