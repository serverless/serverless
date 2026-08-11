/**
 * The esbuild packaging path must produce byte-for-byte identical zip
 * artifacts when the source content is unchanged, even though esbuild rewrites
 * its output on every build (giving the built files a fresh mtime).
 *
 * archiver stamps each entry with the source file's mtime unless a `date` is
 * pinned. Un-pinned dates make the zip bytes — and therefore the sha256 used by
 * check-for-changes — differ on every deploy, forcing a needless redeploy of
 * every function. The legacy (non-esbuild) packaging path pins every entry to
 * `new Date(0)`; the esbuild path must do the same.
 *
 * We assert this by reading the produced archive and checking that every
 * entry's stored timestamp is pinned to the epoch (DOS-clamped to 1980) rather
 * than the file's mtime. This is robust regardless of the test runner's clock,
 * unlike comparing artifact hashes across simulated rebuilds.
 *
 * Pinned dates alone are not enough: archiver resolves `zip.file()` calls
 * through an internal stat queue with concurrency 4, so the order in which
 * entries land in the archive follows lstat completion order, not call order.
 * That makes the whole-zip bytes race between identical runs. The suite below
 * also packages the same unchanged service several times and asserts the
 * entry order and whole-zip sha256 are identical on every run.
 */

import { jest } from '@jest/globals'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const PINNED_EPOCH_YEAR = 1980 // new Date(0) clamped to the DOS date minimum

async function entryYears(artifactPath) {
  const zip = await JsZip.loadAsync(fs.readFileSync(artifactPath))
  return Object.values(zip.files).map((entry) => ({
    name: entry.name,
    year: entry.date.getFullYear(),
  }))
}

function makeServiceDir() {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-'))
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep'), { recursive: true })
  // A real file inside node_modules so the zip.directory() path is exercised.
  fs.writeFileSync(
    path.join(buildDir, 'node_modules', 'dep', 'index.js'),
    'module.exports = 1\n',
  )
  fs.writeFileSync(
    path.join(buildDir, 'handler.js'),
    'export const hello = async () => ({ statusCode: 200 })\n',
  )
  return serviceDir
}

function makePlugin(serviceDir) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      package: { patterns: [] },
    },
    pluginManager: { spawn: async () => {} },
  }
  return new Esbuild(serverless, {})
}

const functions = { hello: { handler: 'handler.hello' } }

describe('esbuild packaging determinism', () => {
  jest.setTimeout(30_000)

  test('_packageAll pins every zip entry date to the epoch', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)

    await plugin._packageAll(functions)

    const entries = await entryYears(
      path.join(serviceDir, '.serverless', 'my-service.zip'),
    )
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.year).toBe(PINNED_EPOCH_YEAR)
    }
  })

  // Many small files racing through archiver's stat queue make ordering
  // nondeterminism show up reliably when present.
  function makeRacyServiceDir() {
    const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-'))
    const buildDir = path.join(serviceDir, '.serverless', 'build')
    fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(buildDir, 'node_modules', 'dep', 'index.js'),
      'module.exports = 1\n',
    )
    fs.writeFileSync(path.join(buildDir, 'package.json'), '{"name":"svc"}\n')
    fs.writeFileSync(path.join(buildDir, 'package-lock.json'), '{}\n')
    fs.writeFileSync(path.join(buildDir, 'yarn.lock'), '# lock\n')
    fs.writeFileSync(
      path.join(buildDir, 'pnpm-lock.yaml'),
      'lockfileVersion: 9\n',
    )
    fs.mkdirSync(path.join(buildDir, 'src'), { recursive: true })
    const racyFunctions = {}
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(
        path.join(buildDir, 'src', `fn${i}.js`),
        `export const handler = async () => ({ statusCode: 20${i} })\n`,
      )
      fs.writeFileSync(
        path.join(buildDir, 'src', `fn${i}.js.map`),
        `{"version":3,"file":"fn${i}.js"}\n`,
      )
      racyFunctions[`fn${i}`] = { handler: `src/fn${i}.handler` }
    }
    fs.writeFileSync(path.join(serviceDir, 'static-a.txt'), 'a\n')
    fs.writeFileSync(path.join(serviceDir, 'static-b.txt'), 'b\n')
    return { serviceDir, racyFunctions }
  }

  async function zipFingerprint(artifactPath) {
    const bytes = fs.readFileSync(artifactPath)
    const zip = await JsZip.loadAsync(bytes)
    return {
      hash: crypto.createHash('sha256').update(bytes).digest('hex'),
      order: Object.values(zip.files).map((entry) => entry.name),
    }
  }

  test('_packageAll produces byte-identical zips across repeated runs', async () => {
    const { serviceDir, racyFunctions } = makeRacyServiceDir()
    const plugin = makePlugin(serviceDir)
    plugin.serverless.service.package.patterns = ['static-*.txt']

    const fingerprints = []
    for (let run = 0; run < 6; run++) {
      await plugin._packageAll(racyFunctions)
      fingerprints.push(
        await zipFingerprint(
          path.join(serviceDir, '.serverless', 'my-service.zip'),
        ),
      )
    }

    for (const fingerprint of fingerprints.slice(1)) {
      expect(fingerprint.order).toEqual(fingerprints[0].order)
      expect(fingerprint.hash).toBe(fingerprints[0].hash)
    }
  })

  test('individual packaging produces byte-identical zips across repeated runs', async () => {
    const { serviceDir, racyFunctions } = makeRacyServiceDir()
    const plugin = makePlugin(serviceDir)
    plugin.serverless.service.package.individually = true
    plugin.serverless.service.package.patterns = ['static-*.txt']
    plugin.functions = async () => racyFunctions
    plugin._buildProperties = async () => ({})

    const fingerprints = []
    for (let run = 0; run < 6; run++) {
      await plugin._package()
      fingerprints.push(
        await zipFingerprint(
          path.join(serviceDir, '.serverless', 'my-service-fn0.zip'),
        ),
      )
    }

    for (const fingerprint of fingerprints.slice(1)) {
      expect(fingerprint.order).toEqual(fingerprints[0].order)
      expect(fingerprint.hash).toBe(fingerprints[0].hash)
    }
  })

  test('individual packaging pins every zip entry date to the epoch', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)
    plugin.serverless.service.package.individually = true
    // Bypass build/introspection so the test targets the zipping logic only.
    plugin.functions = async () => functions
    plugin._buildProperties = async () => ({})

    await plugin._package()

    const entries = await entryYears(
      path.join(serviceDir, '.serverless', 'my-service-hello.zip'),
    )
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.year).toBe(PINNED_EPOCH_YEAR)
    }
  })
})
