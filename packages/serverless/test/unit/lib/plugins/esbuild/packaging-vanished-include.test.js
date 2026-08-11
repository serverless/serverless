/**
 * A file can vanish between glob expansion (or the build step) and packaging.
 * The lookups for it reject inside the archive's stream-open listener, where
 * an escaped rejection would bypass the archive promise: embedders hang on a
 * never-settling promise and the CLI aborts through the global
 * unhandledRejection handler. Worse, archiver's own stat queue silently drops
 * entries it cannot stat, which can ship an incomplete artifact (e.g. a zip
 * without its handler) that only fails at runtime.
 *
 * Packaging must instead fail fast with a clean CANNOT_READ_FILE error routed
 * through the archive promise — the same contract as the classic (non-esbuild)
 * packaging path.
 *
 * fs/promises is mocked so stat deterministically rejects for the marked
 * include while everything else uses the real filesystem.
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

function makeServiceDir({ withHandler = true } = {}) {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-'))
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  fs.mkdirSync(path.join(buildDir, 'node_modules', 'dep'), { recursive: true })
  fs.writeFileSync(
    path.join(buildDir, 'node_modules', 'dep', 'index.js'),
    'module.exports = 1\n',
  )
  if (withHandler) {
    fs.writeFileSync(
      path.join(buildDir, 'handler.js'),
      'export const hello = async () => ({ statusCode: 200 })\n',
    )
  }
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

  test('_packageAll rejects with CANNOT_READ_FILE when the handler bundle is missing', async () => {
    const serviceDir = makeServiceDir({ withHandler: false })
    const plugin = makePlugin(serviceDir)
    plugin.serverless.service.package.patterns = []

    await expect(plugin._packageAll(functions)).rejects.toMatchObject({
      code: 'CANNOT_READ_FILE',
      message: expect.stringMatching(/handler\.js/),
    })
  })
})
