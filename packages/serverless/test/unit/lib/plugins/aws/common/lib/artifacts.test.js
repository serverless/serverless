import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import os from 'os'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import artifacts from '../../../../../../../lib/plugins/aws/common/lib/artifacts.js'
import Utils from '../../../../../../../lib/classes/utils.js'

/**
 * `moveArtifactsToPackage` replaces the target package directory with the
 * contents of `<serviceDir>/.serverless`, and `moveArtifactsToTemp` does the
 * reverse. Both assume the package directory is disjoint from the service
 * directory: when the package path resolves to the service directory itself
 * (`--package .`) or to one of its ancestors (`--package ..`), "replace the
 * package directory" means deleting the user's project. These tests pin the
 * guard that refuses such paths before any file is touched, and that ordinary
 * sibling/child package paths keep working.
 *
 * SAFETY: relative package paths are resolved against the process cwd by the
 * filesystem calls, so every test runs with cwd inside the throwaway temp
 * tree. Never remove that chdir — a regression in the guard would otherwise
 * delete the repository the test runs from.
 */
describe('aws common artifacts', () => {
  let rootDir
  let serviceDir
  let originalCwd

  const createPlugin = (packageOption) => {
    const serverless = {
      serviceDir,
      service: { package: {} },
    }
    serverless.utils = new Utils(serverless)
    const plugin = { serverless, options: { package: packageOption } }
    Object.assign(plugin, artifacts)
    return plugin
  }

  const seedServiceWithArtifacts = async () => {
    await fsp.mkdir(path.join(serviceDir, '.serverless'), { recursive: true })
    await fsp.writeFile(path.join(serviceDir, 'handler.js'), 'export {}\n')
    await fsp.writeFile(path.join(serviceDir, 'serverless.yml'), 'service: s\n')
    await fsp.writeFile(
      path.join(serviceDir, '.serverless', 'service.zip'),
      'zip',
    )
    await fsp.writeFile(path.join(rootDir, 'sibling-marker.txt'), 'keep')
  }

  const expectServiceIntact = ({ artifactsMoved = false } = {}) => {
    expect(fs.existsSync(path.join(serviceDir, 'handler.js'))).toBe(true)
    expect(fs.existsSync(path.join(serviceDir, 'serverless.yml'))).toBe(true)
    expect(
      fs.existsSync(path.join(serviceDir, '.serverless', 'service.zip')),
    ).toBe(!artifactsMoved)
    expect(fs.existsSync(path.join(rootDir, 'sibling-marker.txt'))).toBe(true)
  }

  beforeEach(async () => {
    originalCwd = process.cwd()
    rootDir = fs.realpathSync(
      await fsp.mkdtemp(path.join(os.tmpdir(), 'sls-artifacts-')),
    )
    serviceDir = path.join(rootDir, 'service')
    await seedServiceWithArtifacts()
    process.chdir(serviceDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await fsp.rm(rootDir, { recursive: true, force: true })
  })

  describe('moveArtifactsToPackage', () => {
    it('refuses "." and leaves the service directory untouched', async () => {
      const plugin = createPlugin('.')
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        name: 'ServerlessError',
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('refuses ".." and leaves the parent directory untouched', async () => {
      const plugin = createPlugin('..')
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('refuses an absolute path to an ancestor of the service directory', async () => {
      const plugin = createPlugin(rootDir)
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('refuses the service directory given as an absolute path', async () => {
      const plugin = createPlugin(serviceDir)
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('names the offending path in the error message', async () => {
      const plugin = createPlugin('..')
      await expect(plugin.moveArtifactsToPackage()).rejects.toThrow(/"\.\."/)
    })

    it('moves artifacts to a sibling directory', async () => {
      const packageDir = path.join(rootDir, 'out')
      const plugin = createPlugin(packageDir)
      await plugin.moveArtifactsToPackage()
      expect(fs.existsSync(path.join(packageDir, 'service.zip'))).toBe(true)
      expect(fs.existsSync(path.join(serviceDir, '.serverless'))).toBe(false)
      expect(fs.existsSync(path.join(serviceDir, 'handler.js'))).toBe(true)
    })

    it('moves artifacts to a relative child directory of the service', async () => {
      const plugin = createPlugin('build')
      await plugin.moveArtifactsToPackage()
      expect(fs.existsSync(path.join(serviceDir, 'build', 'service.zip'))).toBe(
        true,
      )
      expect(fs.existsSync(path.join(serviceDir, '.serverless'))).toBe(false)
      expect(fs.existsSync(path.join(serviceDir, 'handler.js'))).toBe(true)
    })

    it('resolves a relative package path from the cwd, like the filesystem operations do', async () => {
      // With `--config sub/serverless.yml` (or Compose) the cwd is not the
      // service directory. Relative paths keep their long-standing meaning
      // (relative to the cwd) so existing output locations do not move.
      process.chdir(rootDir)
      const plugin = createPlugin('out')
      await plugin.moveArtifactsToPackage()
      expectServiceIntact({ artifactsMoved: true })
      expect(fs.existsSync(path.join(rootDir, 'out', 'service.zip'))).toBe(true)
      expect(fs.existsSync(path.join(serviceDir, 'out'))).toBe(false)
    })

    it('refuses a relative path that names the service directory from another cwd', async () => {
      process.chdir(rootDir)
      const plugin = createPlugin('service')
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('refuses an ancestor even when an intermediate directory name starts with ".."', async () => {
      // path.relative(<root>, <root>/..cache/svc) is "..cache/svc": a
      // string-prefix check on ".." would wrongly treat <root> as outside.
      const nestedService = path.join(rootDir, '..cache', 'svc')
      await fsp.mkdir(path.join(nestedService, '.serverless'), {
        recursive: true,
      })
      await fsp.writeFile(path.join(nestedService, 'handler.js'), '')
      const plugin = createPlugin(rootDir)
      plugin.serverless.serviceDir = nestedService
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expect(fs.existsSync(path.join(nestedService, 'handler.js'))).toBe(true)
    })

    it('refuses the service directory spelled with different casing on a case-insensitive filesystem', async () => {
      const caseVariant = path.join(rootDir, 'SERVICE')
      if (!fs.existsSync(caseVariant)) return // case-sensitive filesystem
      const plugin = createPlugin(caseVariant)
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('refuses an ancestor directory that is itself named ".serverless"', async () => {
      // A path ending in ".serverless" is treated as the default location and
      // skips the move. That shortcut must not skip the safety check.
      const ancestor = path.join(rootDir, '.serverless')
      const nestedService = path.join(ancestor, 'service')
      await fsp.mkdir(path.join(nestedService, '.serverless'), {
        recursive: true,
      })
      await fsp.writeFile(path.join(nestedService, 'handler.js'), '')
      const plugin = createPlugin(ancestor)
      plugin.serverless.serviceDir = nestedService
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expect(fs.existsSync(path.join(nestedService, 'handler.js'))).toBe(true)
    })

    it('refuses the service directory reached through a symlink', async () => {
      const link = path.join(rootDir, 'service-link')
      await fsp.symlink(serviceDir, link, 'dir')
      const plugin = createPlugin(link)
      await expect(plugin.moveArtifactsToPackage()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('does not reject a sibling whose name merely starts with the service name', async () => {
      // `path.relative(<root>/service-out, <root>/service)` is "../service":
      // a string-prefix check would wrongly treat this as an ancestor.
      const packageDir = `${serviceDir}-out`
      const plugin = createPlugin(packageDir)
      await plugin.moveArtifactsToPackage()
      expect(fs.existsSync(path.join(packageDir, 'service.zip'))).toBe(true)
    })
  })

  describe('paths ending in ".serverless" (the default location)', () => {
    it('does nothing for the service\'s own ".serverless" directory', async () => {
      const plugin = createPlugin('.serverless')
      await expect(plugin.moveArtifactsToPackage()).resolves.toBeUndefined()
      await expect(plugin.moveArtifactsToTemp()).resolves.toBeUndefined()
      expectServiceIntact()
    })

    it('does nothing for a sibling directory named ".serverless"', async () => {
      const packageDir = path.join(rootDir, 'other', '.serverless')
      await fsp.mkdir(packageDir, { recursive: true })
      await fsp.writeFile(path.join(packageDir, 'prebuilt.zip'), 'zip')
      const plugin = createPlugin(packageDir)
      await expect(plugin.moveArtifactsToPackage()).resolves.toBeUndefined()
      await expect(plugin.moveArtifactsToTemp()).resolves.toBeUndefined()
      expectServiceIntact()
      expect(fs.existsSync(path.join(packageDir, 'prebuilt.zip'))).toBe(true)
    })

    it('does nothing when no package path is configured', async () => {
      const plugin = createPlugin(undefined)
      await expect(plugin.moveArtifactsToPackage()).resolves.toBeUndefined()
      await expect(plugin.moveArtifactsToTemp()).resolves.toBeUndefined()
      expectServiceIntact()
    })
  })

  describe('moveArtifactsToTemp', () => {
    it('refuses "." and leaves the service directory untouched', async () => {
      const plugin = createPlugin('.')
      await expect(plugin.moveArtifactsToTemp()).rejects.toMatchObject({
        name: 'ServerlessError',
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('refuses ".."', async () => {
      const plugin = createPlugin('..')
      await expect(plugin.moveArtifactsToTemp()).rejects.toMatchObject({
        code: 'PACKAGE_PATH_CONTAINS_SERVICE',
      })
      expectServiceIntact()
    })

    it('copies a sibling package directory into .serverless', async () => {
      const packageDir = path.join(rootDir, 'out')
      await fsp.mkdir(packageDir)
      await fsp.writeFile(path.join(packageDir, 'prebuilt.zip'), 'zip')
      const plugin = createPlugin(packageDir)
      await plugin.moveArtifactsToTemp()
      expect(
        fs.existsSync(path.join(serviceDir, '.serverless', 'prebuilt.zip')),
      ).toBe(true)
      expect(fs.existsSync(path.join(packageDir, 'prebuilt.zip'))).toBe(true)
    })
  })
})
