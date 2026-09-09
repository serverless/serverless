/**
 * A `package.patterns` entry that names a directory's contents is packaged
 * with CLASSIC PACKAGING semantics, because that is what the rest of the
 * esbuild packaging path is built to match: the include is resolved with
 * symlinks followed and directories excluded (classic's `follow: true` +
 * `nodir: true`), copied into the build directory, and shipped from there.
 *
 * Three consequences follow, and all three are the point of this file:
 *
 *   - A symlink inside the included directory ships DEREFERENCED — its target's
 *     bytes under the symlink's own name, recorded as a regular file. The
 *     deployed function reads a real file, not a link into a path that does not
 *     exist inside a Lambda artifact.
 *   - A symlinked DIRECTORY is walked through, and the files behind it ship as
 *     regular files at their paths under the link.
 *   - Empty directories produce nothing, and no directory entries are recorded
 *     for the include at all. The artifact carries files; the runtime creates
 *     the directories that hold them on extraction.
 *
 * A broken symlink resolves to nothing and is silently absent, which is also
 * classic behavior — there is no target to package.
 *
 * This replaces the zip.directory()-based expansion, which recorded directory
 * entries (empty ones included) and stored symlinks as symlink entries without
 * following them. Nothing here is mocked: the walk, the copy and the archive
 * all run against the real filesystem.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import JsZip from 'jszip'
import { log } from '@serverless/util'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

// The file-type bits of a zip entry's unix mode. S_IFREG (0o100000) is a
// regular file; S_IFLNK (0o120000) is a stored symlink, which this path must
// never produce.
const S_IFMT = 0o170000
const S_IFREG = 0o100000

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
  // symlink behavior only when they could be created.
  let symlinksCreated = false
  try {
    fs.symlinkSync(
      path.join(assetsDir, 'file.txt'),
      path.join(assetsDir, 'link-to-file'),
    )
    fs.symlinkSync(
      path.join(assetsDir, 'sub'),
      path.join(assetsDir, 'link-to-sub'),
    )
    fs.symlinkSync('/nonexistent-target', path.join(assetsDir, 'broken-link'))
    symlinksCreated = true
  } catch {
    // proceed without symlink coverage
  }
  return { serviceDir, symlinksCreated }
}

function makePlugin(serviceDir, patterns) {
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      package: { patterns },
    },
    pluginManager: { spawn: async () => {} },
  }
  return new Esbuild(serverless, {})
}

const functions = { hello: { handler: 'handler.hello' } }

async function packagedEntries(serviceDir, plugin) {
  await plugin._packageAll(functions)
  const zip = await JsZip.loadAsync(
    fs.readFileSync(path.join(serviceDir, '.serverless', 'my-service.zip')),
  )
  return zip
}

describe('esbuild packaging with a directory include', () => {
  jest.setTimeout(30_000)

  test('_packageAll ships an included directory with classic packaging semantics', async () => {
    const { serviceDir, symlinksCreated } = makeServiceDir()
    const plugin = makePlugin(serviceDir, ['assets/**'])

    const zip = await packagedEntries(serviceDir, plugin)
    const names = Object.values(zip.files).map((entry) => entry.name)

    // Files land at their paths under the included directory.
    expect(names).toContain('assets/file.txt')
    expect(names).toContain('assets/sub/a.txt')

    // No directory entries for the include, empty directories included.
    expect(names).not.toContain('assets/empty-dir/')
    expect(
      names.filter((name) => name.startsWith('assets/') && name.endsWith('/')),
    ).toEqual([])

    if (symlinksCreated) {
      // A symlink to a file ships dereferenced: the target's bytes, stored
      // under the link's own name, as a regular file.
      expect(names).toContain('assets/link-to-file')
      await expect(
        zip.files['assets/link-to-file'].async('string'),
      ).resolves.toBe('f\n')
      expect(zip.files['assets/link-to-file'].unixPermissions & S_IFMT).toBe(
        S_IFREG,
      )

      // A symlinked directory is walked through; what ships is the files
      // behind it, as regular files, not the link.
      expect(names).toContain('assets/link-to-sub/a.txt')
      await expect(
        zip.files['assets/link-to-sub/a.txt'].async('string'),
      ).resolves.toBe('a\n')
      expect(names).not.toContain('assets/link-to-sub')

      // A broken symlink resolves to nothing, so there is nothing to package.
      expect(names).not.toContain('assets/broken-link')
    }
  })

  test('a bare directory name ships the whole tree it names', async () => {
    // globby expands a pattern that resolves to a directory into the files
    // beneath it, and those files are what the include selected — the ordered
    // pattern pass only ever retracts from that set. Re-testing them against
    // the literal pattern `assets` would match none of them and silently drop
    // the entire tree the user asked to ship (and report every file as an
    // exclusion while doing it).
    const { serviceDir, symlinksCreated } = makeServiceDir()
    const plugin = makePlugin(serviceDir, ['assets'])

    const zip = await packagedEntries(serviceDir, plugin)
    const names = Object.values(zip.files).map((entry) => entry.name)

    expect(names).toContain('assets/file.txt')
    expect(names).toContain('assets/sub/a.txt')
    if (symlinksCreated) {
      // Same dereferencing contract as the explicit-glob form.
      expect(names).toContain('assets/link-to-file')
      await expect(
        zip.files['assets/link-to-file'].async('string'),
      ).resolves.toBe('f\n')
      expect(zip.files['assets/link-to-file'].unixPermissions & S_IFMT).toBe(
        S_IFREG,
      )
    }
    expect(names).toContain('handler.js')
  })

  test('a bare directory name reports no exclusions', async () => {
    // The counter feeds the "Excluded N entries ... via package.patterns" line.
    // Files the glob expanded rather than literally matched were being counted
    // as exclusions, so a plain directory include announced that it had removed
    // the very tree it shipped.
    const { serviceDir } = makeServiceDir()
    const plugin = makePlugin(serviceDir, ['assets'])
    const infoSpy = jest
      .spyOn(log.get('esbuild'), 'info')
      .mockImplementation(() => {})

    try {
      await packagedEntries(serviceDir, plugin)
      expect(
        infoSpy.mock.calls
          .map((call) => call[0])
          .filter((message) => message.includes('package.patterns')),
      ).toEqual([])
    } finally {
      infoSpy.mockRestore()
    }
  })
})
