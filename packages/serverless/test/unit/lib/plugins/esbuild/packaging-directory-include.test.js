/**
 * Package-pattern resolution (globby with its onlyFiles default) only ever
 * yields files, so the directory branch of the includes loop is defensive —
 * but if it fires it must reproduce the walk semantics that zip.directory()
 * historically gave that branch: directory entries recorded (including empty
 * directories), symlinks stored as symlinks (broken ones included), symlinked
 * directories not followed — while appending in sorted order so the archive
 * stays deterministic.
 *
 * The patterns lookup is mocked to return a directory; the expansion walk
 * itself runs against the real filesystem.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'

const actualGlobbyModule = await import('globby')

jest.unstable_mockModule('globby', () => ({
  ...actualGlobbyModule,
  globby: async (patterns, options) => {
    if (Array.isArray(patterns) && patterns.includes('__DIR_INCLUDE__')) {
      return ['assets']
    }
    return actualGlobbyModule.globby(patterns, options)
  },
}))

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

  const assetsDir = path.join(serviceDir, 'assets')
  fs.mkdirSync(path.join(assetsDir, 'sub'), { recursive: true })
  fs.mkdirSync(path.join(assetsDir, 'empty-dir'))
  fs.writeFileSync(path.join(assetsDir, 'file.txt'), 'f\n')
  fs.writeFileSync(path.join(assetsDir, 'sub', 'a.txt'), 'a\n')

  // Symlink creation needs privileges on some Windows setups; assert on
  // symlink entries only when they could be created.
  let symlinksCreated = false
  try {
    fs.symlinkSync(
      path.join(assetsDir, 'file.txt'),
      path.join(assetsDir, 'link-to-file'),
    )
    fs.symlinkSync('/nonexistent-target', path.join(assetsDir, 'broken-link'))
    symlinksCreated = true
  } catch {
    // proceed without symlink coverage
  }
  return { serviceDir, symlinksCreated }
}

function makePlugin(serviceDir) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      package: { patterns: ['__DIR_INCLUDE__'] },
    },
    pluginManager: { spawn: async () => {} },
  }
  return new Esbuild(serverless, {})
}

const functions = { hello: { handler: 'handler.hello' } }

describe('esbuild packaging with a directory include', () => {
  jest.setTimeout(30_000)

  test('_packageAll walks the directory like zip.directory did', async () => {
    const { serviceDir, symlinksCreated } = makeServiceDir()
    const plugin = makePlugin(serviceDir)

    await plugin._packageAll(functions)

    const zip = await JsZip.loadAsync(
      fs.readFileSync(path.join(serviceDir, '.serverless', 'my-service.zip')),
    )
    const names = Object.values(zip.files).map((entry) => entry.name)

    expect(names).toContain('assets/file.txt')
    expect(names).toContain('assets/sub/')
    expect(names).toContain('assets/sub/a.txt')
    // Directory entries are preserved, including empty directories.
    expect(names).toContain('assets/empty-dir/')
    if (symlinksCreated) {
      // Symlinks are stored as entries (broken ones too), not followed.
      expect(names).toContain('assets/link-to-file')
      expect(names).toContain('assets/broken-link')
    }
  })
})
