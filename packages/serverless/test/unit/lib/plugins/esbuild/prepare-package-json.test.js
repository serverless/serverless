/**
 * `_preparePackageJson` writes the trimmed package.json into `.serverless/build`
 * and installs the external dependencies there. Inside a Compose project the
 * service may have no package.json of its own, with all dependencies declared
 * in the compose-root package.json instead.
 *
 * Before the fix, combining that layout with `build.esbuild.packages:
 * 'external'` crashed: the outer dependency branch was entered via the
 * compose-root dependencies, the `packages !== 'external'` branch that
 * initializes `packageJsonNoDevDeps.dependencies` was skipped, and the
 * exclude-deletion loop (exclude always contains the `@aws-sdk/*` default)
 * dereferenced `undefined` — `TypeError: Cannot convert undefined or null to
 * object`.
 *
 * With the fix, `packages: 'external'` uses the service's own dependencies
 * when it declares any (exactly as before), and falls back to the compose-root
 * package.json only when the service declares none — the previously crashing
 * configuration. Configurations that worked before produce identical output.
 *
 * The packager install step is stubbed (spawn mock) — these tests assert on
 * the package.json written to the build directory, not on a real install.
 */

import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const spawnMock = jest.fn(() => {
  const child = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdout = new EventEmitter()
  const promise = Promise.resolve()
  promise.child = child
  process.nextTick(() => child.emit('close', 0))
  return promise
})

jest.unstable_mockModule('child-process-ext/spawn.js', () => ({
  default: spawnMock,
}))

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const createdDirs = []

function makeDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-pkg-'))
  createdDirs.push(dir)
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(dir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
  return dir
}

function makePlugin(serviceDir, { esbuild = {}, isWithinCompose = false }) {
  // _preparePackageJson writes into the build dir the build step normally creates
  fs.mkdirSync(path.join(serviceDir, '.serverless', 'build'), {
    recursive: true,
  })
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      build: { esbuild },
    },
    compose: { isWithinCompose },
  }
  return new Esbuild(serverless, {})
}

function readBuildPackageJson(serviceDir) {
  return JSON.parse(
    fs.readFileSync(
      path.join(serviceDir, '.serverless', 'build', 'package.json'),
      'utf-8',
    ),
  )
}

describe('esbuild _preparePackageJson', () => {
  beforeEach(() => {
    spawnMock.mockClear()
  })

  afterEach(() => {
    while (createdDirs.length > 0) {
      fs.rmSync(createdDirs.pop(), { recursive: true, force: true })
    }
  })

  test('compose service without its own package.json and packages: "external" resolves dependencies from the compose root', async () => {
    // Compose root holds the only package.json; the service dir has none.
    const composeRoot = makeDir({
      'serverless-compose.yml': 'services:\n  my-service:\n    path: service\n',
      'package.json': JSON.stringify({
        dependencies: { zod: '^3.24.1' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      'service/handler.mjs': 'export const hello = async () => ({})\n',
    })
    const serviceDir = path.join(composeRoot, 'service')
    const plugin = makePlugin(serviceDir, {
      esbuild: { packages: 'external', external: ['zod'] },
      isWithinCompose: true,
    })

    // Pre-fix: TypeError: Cannot convert undefined or null to object
    await expect(plugin._preparePackageJson()).resolves.toBeUndefined()

    const buildPackageJson = readBuildPackageJson(serviceDir)
    expect(buildPackageJson.dependencies).toEqual({ zod: '^3.24.1' })
    expect(buildPackageJson.devDependencies).toBeUndefined()
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  test('compose service with its own dependencies keeps exactly those with packages: "external" — the compose root is not merged in', async () => {
    const composeRoot = makeDir({
      'serverless-compose.yml': 'services:\n  my-service:\n    path: service\n',
      'package.json': JSON.stringify({
        dependencies: { zod: '^3.0.0', lodash: '^4.17.21' },
      }),
      'service/package.json': JSON.stringify({
        dependencies: { zod: '^3.24.1' },
      }),
    })
    const serviceDir = path.join(composeRoot, 'service')
    const plugin = makePlugin(serviceDir, {
      esbuild: { packages: 'external' },
      isWithinCompose: true,
    })

    await plugin._preparePackageJson()

    // Same output this configuration produced before the fix: the compose
    // root must not change artifacts of services that declare their own
    // dependencies.
    const buildPackageJson = readBuildPackageJson(serviceDir)
    expect(buildPackageJson.dependencies).toEqual({ zod: '^3.24.1' })
  })

  test('outside compose, packages: "external" keeps the service dependencies unchanged', async () => {
    const serviceDir = makeDir({
      'package.json': JSON.stringify({
        dependencies: { zod: '^3.24.1' },
        devDependencies: { typescript: '^5.0.0' },
      }),
    })
    const plugin = makePlugin(serviceDir, {
      esbuild: { packages: 'external' },
    })

    await plugin._preparePackageJson()

    const buildPackageJson = readBuildPackageJson(serviceDir)
    expect(buildPackageJson.dependencies).toEqual({ zod: '^3.24.1' })
    expect(buildPackageJson.devDependencies).toBeUndefined()
  })

  test('compose service without its own package.json bundling (no packages: "external") still resolves externals from the compose root', async () => {
    const composeRoot = makeDir({
      'serverless-compose.yml': 'services:\n  my-service:\n    path: service\n',
      'package.json': JSON.stringify({
        dependencies: { zod: '^3.24.1', lodash: '^4.17.21' },
      }),
    })
    const serviceDir = path.join(composeRoot, 'service')
    const plugin = makePlugin(serviceDir, {
      esbuild: { external: ['zod'] },
      isWithinCompose: true,
    })

    await plugin._preparePackageJson()

    // Only the externals land in the build package.json, resolved from the compose root.
    const buildPackageJson = readBuildPackageJson(serviceDir)
    expect(buildPackageJson.dependencies).toEqual({ zod: '^3.24.1' })
  })
})
