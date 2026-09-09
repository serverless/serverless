/**
 * A file can vanish between glob expansion (or the build step) and packaging.
 * The lookups for it reject inside the archive's stream-open listener, where
 * an escaped rejection would bypass the archive promise: embedders hang on a
 * never-settling promise and the CLI aborts through the global
 * unhandledRejection handler. Worse, archiver's own stat queue silently drops
 * entries it cannot stat, which can ship an incomplete artifact that only
 * fails at runtime.
 *
 * Packaging must instead fail fast, through the archive promise, with the same
 * contract as the classic (non-esbuild) packaging path. Two distinct
 * disappearances are pinned here, because packaging catches them in two
 * different places:
 *
 *   - A `package.patterns` include that vanished. It is looked up by name on
 *     the way into the build directory, so it fails with CANNOT_READ_FILE.
 *     fs/promises is mocked so `stat` deterministically rejects for the marked
 *     include while everything else uses the real filesystem.
 *
 *   - A handler bundle that vanished from the build directory after the build
 *     wrote it. Packaging ships the build directory as a whole, so a missing
 *     file is not a failed lookup — it is simply absent, and nothing about the
 *     append sequence notices. What catches it is the post-zip assertion,
 *     which reads the finished archive's central directory and compares it
 *     against the outfiles `_build` recorded, raising
 *     ESBUILD_HANDLER_MISSING_FROM_ARTIFACT. That check runs against real
 *     build bookkeeping here — an actual build, then the emitted file deleted
 *     — because seeding `builtArtifacts` by hand would prove nothing about
 *     whether the bookkeeping and the assertion agree.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

jest.unstable_mockModule('fs/promises', () => {
  const actual = jest.requireActual('fs/promises')
  const stat = async (target, ...args) => {
    if (String(target).endsWith('vanished.txt')) {
      const error = new Error(
        `ENOENT: no such file or directory, stat '${target}'`,
      )
      error.code = 'ENOENT'
      throw error
    }
    return actual.stat(target, ...args)
  }
  return { ...actual, stat, default: { ...actual, stat } }
})

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

function makeServiceDir() {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-'))
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep'), { recursive: true })
  fs.writeFileSync(
    path.join(buildDir, 'node_modules', 'dep', 'index.js'),
    'module.exports = 1\n',
  )
  fs.writeFileSync(
    path.join(buildDir, 'handler.js'),
    'export const hello = async () => ({ statusCode: 200 })\n',
  )
  // Both exist at glob time; stat is mocked to reject for vanished.txt,
  // simulating a file deleted between glob expansion and packaging.
  fs.writeFileSync(path.join(serviceDir, 'kept.txt'), 'kept\n')
  fs.writeFileSync(path.join(serviceDir, 'vanished.txt'), 'vanished\n')
  return serviceDir
}

function makePlugin(serviceDir) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      package: { patterns: ['*.txt'] },
    },
    pluginManager: { spawn: async () => {} },
  }
  return new Esbuild(serverless, {})
}

const functions = { hello: { handler: 'handler.hello' } }

/**
 * A service that really builds: one TypeScript handler and nothing else.
 * `realpathSync` because macOS resolves the temp dir through a symlink
 * (`/var` -> `/private/var`) and esbuild reports real paths -- an unresolved
 * prefix makes `outbase` fail to match the entry point, which collapses the
 * built layout into the build root.
 */
function makeBuildableServiceDir() {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-build-')),
  )
  fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'handler.ts'),
    'export const hello = async (): Promise<object> => ({ statusCode: 200 })\n',
  )
  return serviceDir
}

function makeBuildablePlugin(serviceDir, fns) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      build: { esbuild: { bundle: true } },
      functions: fns,
      getFunction: (name) => fns[name],
      getAllFunctions: () => Object.keys(fns),
    },
    pluginManager: { spawn: async () => {} },
  }
  return new Esbuild(serverless, {})
}

describe('esbuild packaging with a vanished file', () => {
  jest.setTimeout(30_000)

  test('_packageAll rejects cleanly when an include vanished', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)

    await expect(plugin._packageAll(functions)).rejects.toMatchObject({
      code: 'CANNOT_READ_FILE',
      message: expect.stringMatching(/vanished\.txt/),
    })
  })

  test('individual packaging rejects cleanly when an include vanished', async () => {
    const serviceDir = makeServiceDir()
    const plugin = makePlugin(serviceDir)
    plugin.serverless.service.package.individually = true
    plugin.functions = async () => functions
    plugin._buildProperties = async () => ({})

    await expect(plugin._package()).rejects.toMatchObject({
      code: 'CANNOT_READ_FILE',
      message: expect.stringMatching(/vanished\.txt/),
    })
  })

  test('_packageAll rejects with ESBUILD_HANDLER_MISSING_FROM_ARTIFACT when the built handler vanished from the build directory', async () => {
    const buildableFns = { hello: { handler: 'src/handler.hello' } }
    const serviceDir = makeBuildableServiceDir()
    const plugin = makeBuildablePlugin(serviceDir, buildableFns)

    await plugin._build()

    // Real bookkeeping from a real build, not a seeded map: this is the
    // recorded outfile the assertion will look for.
    const { outfile } = plugin.builtArtifacts.get('hello')
    expect(outfile).toBe('src/handler.js')

    const emitted = path.join(
      serviceDir,
      '.serverless',
      'build',
      ...outfile.split('/'),
    )
    expect(fs.existsSync(emitted)).toBe(true)
    fs.rmSync(emitted)

    await expect(plugin._packageAll(buildableFns)).rejects.toMatchObject({
      name: 'ServerlessError',
      code: 'ESBUILD_HANDLER_MISSING_FROM_ARTIFACT',
      // Naming the function and the file it lost is the whole point: the
      // deploy output has to say which handler is missing and from where.
      message: expect.stringContaining('"hello" (src/handler.js)'),
    })
  })
})
