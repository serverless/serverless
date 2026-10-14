/**
 * The esbuild plugin builds for Dev Mode from the dev build request alone: the functions it names,
 * from their handler, reporting what it covered and built; without a request the dev hook does
 * nothing; the deploy and package path never sees a request.
 */
import { afterAll, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeDevBuildRequest,
  openDevBuildRequest,
} from '../../../../../lib/utils/dev-build-request.js'

const {
  default: Esbuild,
  devOutputsToRemove,
  promoteDevGroup,
  promoteDevOutput,
} = await import('../../../../../lib/plugins/esbuild/index.js')

jest.setTimeout(60_000)
const dirs = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

const GOOD_API = 'export const handler = async (): Promise<number> => 1\n'

const twoFunctionService = (esbuild) => {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-dev-request-')),
  )
  dirs.push(serviceDir)
  fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(serviceDir, 'src', 'api.ts'), GOOD_API)
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'other.ts'),
    'export const handler = async (): Promise<number> => 2\n',
  )
  fs.writeFileSync(
    path.join(serviceDir, 'package.json'),
    '{"name":"svc","private":true}\n',
  )
  const fns = {
    api: { handler: 'src/api.handler' },
    other: { handler: 'src/other.handler' },
  }
  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs20.x' },
      package: {},
      build: { esbuild },
      functions: fns,
      getFunction: (name) => fns[name],
      getAllFunctions: () => Object.keys(fns),
    },
    pluginManager: { spawn: async () => {} },
  }
  const plugin = new Esbuild(serverless, {})
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  /**
   * Runs the dev hook under a fresh request for `functions`, closed afterwards. Returns the request
   * and, when the build failed, its error.
   */
  const devBuild = async (functions) => {
    const request = openDevBuildRequest(serverless, { functions })
    try {
      await plugin.hooks['before:dev-build:build']()
      return { request }
    } catch (error) {
      return { request, error }
    } finally {
      closeDevBuildRequest(serverless, request)
    }
  }
  return { plugin, serverless, serviceDir, buildDir, devBuild }
}

describe.each([
  // Not bundling compiles every TypeScript file the project ships, as packaging would.
  ['bundling', { bundle: true }, false],
  ['not bundling', { bundle: false }, true],
])('a dev build, %s', (name, esbuild, otherEmitted) => {
  test('builds only the requested functions, from their handler, and reports them', async () => {
    const { serverless, buildDir, devBuild } = twoFunctionService(esbuild)
    const { request, error } = await devBuild(['api'])
    expect(error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'src', 'api.js'))).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'src', 'other.js'))).toBe(
      otherEmitted,
    )
    expect(request.result()).toEqual({ covered: ['api'], built: ['api'] })
    // The dev build adds nothing to the function's configuration beyond the
    // NODE_OPTIONS setting every build adds.
    expect(
      Object.keys(serverless.service.getFunction('api')).filter(
        (key) => key !== 'environment',
      ),
    ).toEqual(['handler'])
    expect('devBuildRequest' in serverless).toBe(false)
  })

  test('does nothing without a request', async () => {
    const { plugin, buildDir } = twoFunctionService(esbuild)
    await plugin.hooks['before:dev-build:build']()
    expect(fs.existsSync(buildDir)).toBe(false)
  })

  test('a failed build reports what it covered and keeps the last good output', async () => {
    const { serverless, serviceDir, buildDir, devBuild } =
      twoFunctionService(esbuild)
    expect((await devBuild(['api'])).error).toBeUndefined()
    const good = fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'api.ts'),
      'export const handler = (\n',
    )
    const { request, error } = await devBuild(['api'])
    expect(error).toMatchObject({ code: 'ESBULD_BUILD_ERROR' })
    expect(fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')).toBe(
      good,
    )
    expect(request.result()).toEqual({ covered: ['api'], built: [] })
    expect('devBuildRequest' in serverless).toBe(false)
  })
})

test('a dev build without bundling moves nothing in when one of its partitions fails', async () => {
  // A .ts and an .mts handler build as two esbuild partitions, at the same time.
  const { serverless, serviceDir, buildDir, devBuild } = twoFunctionService({
    bundle: false,
  })
  fs.renameSync(
    path.join(serviceDir, 'src', 'other.ts'),
    path.join(serviceDir, 'src', 'other.mts'),
  )
  serverless.service.functions.other.handler = 'src/other.handler'
  expect((await devBuild(['api', 'other'])).error).toBeUndefined()
  const good = fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')
  expect(fs.existsSync(path.join(buildDir, 'src', 'other.mjs'))).toBe(true)
  // `api` changes and builds; the .mts partition fails.
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'api.ts'),
    'export const handler = async (): Promise<number> => 3\n',
  )
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'other.mts'),
    'export const handler = (\n',
  )
  const { request, error } = await devBuild(['api', 'other'])
  expect(error).toMatchObject({ code: 'ESBULD_BUILD_ERROR' })
  expect(request.result().built).toEqual([])
  expect(fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')).toBe(
    good,
  )
  expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
    'build',
  ])
  // Once both partitions build, both outputs move in.
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'other.mts'),
    'export const handler = async (): Promise<number> => 4\n',
  )
  const fixed = await devBuild(['api', 'other'])
  expect(fixed.error).toBeUndefined()
  expect(fixed.request.result().built.sort()).toEqual(['api', 'other'])
  expect(
    fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8'),
  ).not.toBe(good)
  expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
    'build',
  ])
})

test('a failed dev build names the functions it covered and none as built', async () => {
  const { plugin, serverless, serviceDir } = twoFunctionService({
    bundle: true,
  })
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'api.ts'),
    'export const handler = (\n',
  )
  const request = openDevBuildRequest(serverless, {
    functions: ['api', 'other'],
  })
  try {
    await expect(
      plugin.hooks['before:dev-build:build'](),
    ).rejects.toMatchObject({ code: 'ESBULD_BUILD_ERROR' })
  } finally {
    closeDevBuildRequest(serverless, request)
  }
  const { covered, built } = request.result()
  expect(covered.sort()).toEqual(['api', 'other'])
  // Nothing is written until every group built: no function is reported as built.
  expect(built).toEqual([])
})

test('a dev build where one group fails keeps every function on its last good output', async () => {
  // One group at a time, in order: `api` has built and written before `other` fails.
  const { serviceDir, buildDir, devBuild } = twoFunctionService({
    bundle: true,
    buildConcurrency: 1,
  })
  expect((await devBuild(['api', 'other'])).error).toBeUndefined()
  const before = {
    api: fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8'),
    other: fs.readFileSync(path.join(buildDir, 'src', 'other.js'), 'utf8'),
  }
  // `api` changes and builds; `other` breaks.
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'api.ts'),
    'export const handler = async (): Promise<number> => 3\n',
  )
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'other.ts'),
    'export const handler = (\n',
  )
  const { request, error } = await devBuild(['api', 'other'])
  expect(error).toMatchObject({ code: 'ESBULD_BUILD_ERROR' })
  expect(request.result().built).toEqual([])
  expect(fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')).toBe(
    before.api,
  )
  expect(fs.readFileSync(path.join(buildDir, 'src', 'other.js'), 'utf8')).toBe(
    before.other,
  )
  // Nothing of the failed build stays behind next to the build directory.
  expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
    'build',
  ])
  // Once every group builds, both outputs move in together.
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'other.ts'),
    'export const handler = async (): Promise<number> => 4\n',
  )
  expect((await devBuild(['api', 'other'])).error).toBeUndefined()
  expect(
    fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8'),
  ).not.toBe(before.api)
  expect(
    fs.readFileSync(path.join(buildDir, 'src', 'other.js'), 'utf8'),
  ).not.toBe(before.other)
})

test('a dev build keeps every file esbuild writes, such as a file-loader asset', async () => {
  const { serviceDir, buildDir, devBuild } = twoFunctionService({
    bundle: true,
    loader: { '.bin': 'file' },
  })
  fs.writeFileSync(path.join(serviceDir, 'src', 'data.bin'), 'payload')
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'api.ts'),
    "import data from './data.bin'\nexport const handler = async (): Promise<string> => data\n",
  )
  expect((await devBuild(['api'])).error).toBeUndefined()
  const assets = fs
    .readdirSync(path.join(buildDir, 'src'))
    .filter((name) => name.endsWith('.bin'))
  expect(assets).toHaveLength(1)
  // The handler refers to the asset that is next to it.
  expect(
    fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8'),
  ).toContain(assets[0])
  expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
    'build',
  ])
})

// A directory without write permission refuses renames, except to root.
const onPosix =
  process.platform === 'win32' || process.getuid?.() === 0 ? test.skip : test

onPosix(
  'a group whose output cannot be moved in keeps its old output; the groups moved before it are built',
  async () => {
    const { serverless, serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: true,
      buildConcurrency: 1,
    })
    // `other` lives in its own directory, so only its move can be refused.
    fs.mkdirSync(path.join(serviceDir, 'lib'))
    fs.renameSync(
      path.join(serviceDir, 'src', 'other.ts'),
      path.join(serviceDir, 'lib', 'other.ts'),
    )
    serverless.service.functions.other.handler = 'lib/other.handler'
    expect((await devBuild(['api', 'other'])).error).toBeUndefined()
    const before = {
      api: fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8'),
      other: fs.readFileSync(path.join(buildDir, 'lib', 'other.js'), 'utf8'),
    }
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'api.ts'),
      'export const handler = async (): Promise<number> => 3\n',
    )
    fs.writeFileSync(
      path.join(serviceDir, 'lib', 'other.ts'),
      'export const handler = async (): Promise<number> => 4\n',
    )
    // Nothing can be renamed into or out of lib/.
    fs.chmodSync(path.join(buildDir, 'lib'), 0o555)
    let result
    try {
      result = await devBuild(['api', 'other'])
    } finally {
      fs.chmodSync(path.join(buildDir, 'lib'), 0o755)
    }
    expect(result.error).toBeDefined()
    expect(result.request.result().built).toEqual(['api'])
    expect(
      fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8'),
    ).not.toBe(before.api)
    expect(
      fs.readFileSync(path.join(buildDir, 'lib', 'other.js'), 'utf8'),
    ).toBe(before.other)
    expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
      'build',
    ])
  },
)

onPosix(
  'a group whose handler cannot be moved in puts back every file of it that moved',
  async () => {
    const { serverless, serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: true,
      buildConcurrency: 1,
      loader: { '.bin': 'file' },
      // The asset lands outside the handler's directory, so it moves while the handler cannot.
      assetNames: '../assets/[name]',
    })
    fs.mkdirSync(path.join(serviceDir, 'lib'))
    fs.rmSync(path.join(serviceDir, 'src', 'other.ts'))
    fs.writeFileSync(path.join(serviceDir, 'lib', 'data.bin'), 'old payload')
    fs.writeFileSync(
      path.join(serviceDir, 'lib', 'other.ts'),
      "import data from './data.bin'\nexport const handler = async (): Promise<string> => data\n",
    )
    serverless.service.functions.other.handler = 'lib/other.handler'
    expect((await devBuild(['other'])).error).toBeUndefined()
    const asset = path.join(buildDir, 'assets', 'data.bin')
    const before = fs.readFileSync(
      path.join(buildDir, 'lib', 'other.js'),
      'utf8',
    )
    expect(fs.readFileSync(asset, 'utf8')).toBe('old payload')
    fs.writeFileSync(path.join(serviceDir, 'lib', 'data.bin'), 'new payload')
    fs.appendFileSync(
      path.join(serviceDir, 'lib', 'other.ts'),
      'export const changed = true\n',
    )
    // Nothing can be renamed into or out of lib/.
    fs.chmodSync(path.join(buildDir, 'lib'), 0o555)
    let result
    try {
      result = await devBuild(['other'])
    } finally {
      fs.chmodSync(path.join(buildDir, 'lib'), 0o755)
    }
    expect(result.error).toBeDefined()
    expect(result.request.result().built).toEqual([])
    expect(
      fs.readFileSync(path.join(buildDir, 'lib', 'other.js'), 'utf8'),
    ).toBe(before)
    expect(fs.readFileSync(asset, 'utf8')).toBe('old payload')
    expect(fs.readdirSync(path.join(buildDir, 'assets'))).toEqual(['data.bin'])
    expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
      'build',
    ])
  },
)

describe('putting a file back where a rename never replaces an existing file (Windows)', () => {
  const windowsRename = async (from, to) => {
    if (fs.existsSync(to)) {
      throw Object.assign(new Error(`EPERM: rename ${from} -> ${to}`), {
        code: 'EPERM',
      })
    }
    fs.renameSync(from, to)
  }
  const files = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-promote-'))
    dirs.push(dir)
    const from = path.join(dir, 'staged.js')
    const to = path.join(dir, 'api.js')
    fs.writeFileSync(from, 'new')
    fs.writeFileSync(to, 'old')
    return { dir, from, to }
  }

  test('the new file is removed first, and the last good one goes back', async () => {
    const { dir, from, to } = files()
    const move = await promoteDevOutput(from, to, { renameFile: windowsRename })
    expect(fs.readFileSync(to, 'utf8')).toBe('new')
    await move.restore()
    await move.discard()
    expect(fs.readFileSync(to, 'utf8')).toBe('old')
    expect(fs.readdirSync(dir)).toEqual(['api.js'])
  })

  test('a last good copy that cannot go back is kept beside it, never deleted', async () => {
    const { dir, from, to } = files()
    const move = await promoteDevOutput(from, to, {
      renameFile: windowsRename,
      // The new file is held open: it cannot be removed either.
      removeFile: async (file, options) => {
        if (file === to) {
          throw Object.assign(new Error(`EBUSY: ${file}`), { code: 'EBUSY' })
        }
        return fs.promises.rm(file, options)
      },
    })
    await move.restore()
    await move.discard()
    const aside = fs.readdirSync(dir).filter((name) => name.endsWith('.old'))
    expect(aside).toHaveLength(1)
    expect(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).toBe('old')
  })
})

test('an aside copy a promotion cannot delete yet is removed by the next dev build', async () => {
  const { plugin, buildDir } = twoFunctionService({ bundle: false })
  const stagingDir = `${buildDir}-dev-staging-0a1b2c3d-0`
  const handler = path.join('src', 'api.js')
  writeAll(buildDir, { 'src/api.js': 'old' })
  writeAll(stagingDir, { 'src/api.js': 'new' })
  // The replaced file is held open (as on Windows): its aside copy cannot be deleted now.
  const removeFile = async (file, options) => {
    if (file.endsWith('.old')) {
      throw Object.assign(new Error(`EBUSY: ${file}`), { code: 'EBUSY' })
    }
    return fs.promises.rm(file, options)
  }
  const promoted = await promoteDevGroup({
    stagingDir,
    buildDir,
    handlers: [handler],
    removeFile,
  })
  const aside = fs
    .readdirSync(path.join(buildDir, 'src'))
    .filter((name) => name.endsWith('.old'))
  expect(aside).toHaveLength(1)
  expect(promoted).toEqual([handler, path.join('src', aside[0])])
  plugin.devOutputs = new Set()
  await plugin._settleDevOutputs(promoted)
  // The next dev build moves in the handler only.
  await plugin._settleDevOutputs([handler])
  expect(fs.readdirSync(path.join(buildDir, 'src'))).toEqual(['api.js'])
  expect(fs.readFileSync(path.join(buildDir, handler), 'utf8')).toBe('new')
})

test('a file replaced where hard links are refused can still be put back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-promote-'))
  dirs.push(dir)
  const from = path.join(dir, 'staged.js')
  const to = path.join(dir, 'api.js')
  fs.writeFileSync(from, 'new')
  fs.writeFileSync(to, 'old')
  const refused = async () => {
    throw Object.assign(new Error('operation not permitted'), {
      code: 'EPERM',
    })
  }
  const move = await promoteDevOutput(from, to, { linkFile: refused })
  expect(fs.readFileSync(to, 'utf8')).toBe('new')
  await move.restore()
  await move.discard()
  expect(fs.readFileSync(to, 'utf8')).toBe('old')
  expect(fs.readdirSync(dir)).toEqual(['api.js'])
})

onPosix(
  "a staging directory that cannot be removed never replaces the build's own error",
  async () => {
    const { serverless, serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: false,
    })
    fs.renameSync(
      path.join(serviceDir, 'src', 'other.ts'),
      path.join(serviceDir, 'src', 'other.mts'),
    )
    serverless.service.functions.other.handler = 'src/other.handler'
    // A staging directory left behind that cannot be removed now (as Windows refuses to remove a
    // file another process holds): a directory without write permission, with a file in it.
    const stuck = path.join(`${buildDir}-dev-staging-7`, 'held')
    fs.mkdirSync(stuck, { recursive: true })
    fs.writeFileSync(path.join(stuck, 'a.js'), '')
    fs.chmodSync(stuck, 0o555)
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'other.mts'),
      'export const handler = (\n',
    )
    let result
    try {
      result = await devBuild(['api', 'other'])
    } finally {
      fs.chmodSync(stuck, 0o755)
    }
    expect(result.error).toMatchObject({ code: 'ESBULD_BUILD_ERROR' })
    expect(result.request.result().built).toEqual([])
  },
)

describe.each([
  ['bundling', { bundle: true }],
  ['not bundling', { bundle: false }],
])('a dev build, %s, and a staging directory left behind', (name, esbuild) => {
  onPosix('never promotes what an earlier build left there', async () => {
    const { serviceDir, buildDir, devBuild } = twoFunctionService(esbuild)
    // An earlier build's staging directories that could not be removed: each holds a file in a
    // directory without write permission.
    const held = [0, 7].map((index) =>
      path.join(`${buildDir}-dev-staging-${index}`, 'held'),
    )
    for (const dir of held) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'leftover.js'), 'old')
      fs.chmodSync(dir, 0o555)
    }
    let result
    try {
      result = await devBuild(['api'])
    } finally {
      for (const dir of held) fs.chmodSync(dir, 0o755)
    }
    expect(result.error).toBeUndefined()
    expect(result.request.result().built).toEqual(['api'])
    expect(fs.existsSync(path.join(buildDir, 'held'))).toBe(false)
    expect(fs.existsSync(path.join(buildDir, 'src', 'api.js'))).toBe(true)
    // The next build that can remove them does.
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
      'build',
    ])
  })
})

onPosix(
  'the package build removes staging directories dev builds left behind',
  async () => {
    const { plugin, buildDir, serviceDir } = twoFunctionService({
      bundle: true,
    })
    fs.mkdirSync(path.join(`${buildDir}-dev-staging-3`, 'src'), {
      recursive: true,
    })
    await plugin._build()
    expect(fs.readdirSync(path.join(serviceDir, '.serverless'))).toEqual([
      'build',
    ])
  },
)

test('the package build ignores a request and builds every function', async () => {
  const { plugin, serverless, buildDir } = twoFunctionService({ bundle: true })
  const request = openDevBuildRequest(serverless, { functions: ['api'] })
  try {
    await plugin._build()
  } finally {
    closeDevBuildRequest(serverless, request)
  }
  expect(fs.existsSync(path.join(buildDir, 'src', 'api.js'))).toBe(true)
  expect(fs.existsSync(path.join(buildDir, 'src', 'other.js'))).toBe(true)
  expect([...serverless.builtFunctions].sort()).toEqual(['api', 'other'])
  expect(request.result()).toEqual({ covered: [], built: [] })
})

describe('the handler file a dev build names for each function it built', () => {
  test('not bundling: an .mts handler is emitted as .mjs and a .cts one as .cjs', async () => {
    const { serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: false,
    })
    fs.renameSync(
      path.join(serviceDir, 'src', 'api.ts'),
      path.join(serviceDir, 'src', 'api.mts'),
    )
    fs.renameSync(
      path.join(serviceDir, 'src', 'other.ts'),
      path.join(serviceDir, 'src', 'other.cts'),
    )
    const { request, error } = await devBuild(['api', 'other'])
    expect(error).toBeUndefined()
    expect(request.files()).toEqual({
      api: 'src/api.mjs',
      other: 'src/other.cjs',
    })
    for (const file of Object.values(request.files())) {
      expect(fs.existsSync(path.join(buildDir, file))).toBe(true)
    }
  })

  test.each([
    ['not bundling', { bundle: false }, 'src/api.js'],
    ['bundling', { bundle: true }, 'src/api.js'],
    [
      'bundling with outExtension',
      { bundle: true, format: 'esm', outExtension: { '.js': '.mjs' } },
      'src/api.mjs',
    ],
  ])('%s: the file the build wrote', async (name, esbuild, file) => {
    const { buildDir, devBuild } = twoFunctionService(esbuild)
    const { request, error } = await devBuild(['api'])
    expect(error).toBeUndefined()
    expect(request.files()).toEqual({ api: file })
    expect(fs.existsSync(path.join(buildDir, file))).toBe(true)
  })
})

/** Writes `files` (relative path to contents) under `dir`. */
const writeAll = (dir, files) => {
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), contents)
  }
}

describe.each([
  ['bundling', { bundle: true }],
  ['not bundling', { bundle: false }],
])("a dev session's build directory, %s", (name, esbuild) => {
  test('the first dev build of a session starts from the build directory deploy starts from, without its installed dependencies', async () => {
    const { buildDir, devBuild } = twoFunctionService(esbuild)
    // Left by an earlier deploy build or session.
    writeAll(buildDir, {
      'src/removed.js': 'old',
      'assets/old.txt': 'old',
      'package.json': '{}',
      'node_modules/dep/index.js': 'module.exports = "deployed copy"',
      'package-lock.json': '{}',
    })
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'src', 'api.js'))).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'src', 'removed.js'))).toBe(false)
    expect(fs.existsSync(path.join(buildDir, 'assets'))).toBe(false)
    // Gone, or the service's own copy (an unbundled build ships it).
    const manifest = path.join(buildDir, 'package.json')
    expect(
      fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null,
    ).not.toBe('{}')
    // The dependencies a deploy installed there would shadow the service's own.
    expect(fs.existsSync(path.join(buildDir, 'node_modules'))).toBe(false)
    expect(fs.existsSync(path.join(buildDir, 'package-lock.json'))).toBe(true)
  })

  test('later dev builds keep what they did not move in themselves', async () => {
    const { buildDir, devBuild } = twoFunctionService(esbuild)
    expect((await devBuild(['api'])).error).toBeUndefined()
    writeAll(buildDir, { 'written-by-someone-else.txt': 'kept' })
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(
      fs.readFileSync(
        path.join(buildDir, 'written-by-someone-else.txt'),
        'utf8',
      ),
    ).toBe('kept')
  })

  test('a file package.patterns selected that is deleted during the session leaves with the next build', async () => {
    const { serverless, serviceDir, buildDir, devBuild } =
      twoFunctionService(esbuild)
    serverless.service.package.patterns = ['assets/**']
    writeAll(serviceDir, { 'assets/a.txt': 'a', 'assets/b.txt': 'b' })
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'assets', 'b.txt'))).toBe(true)
    fs.rmSync(path.join(serviceDir, 'assets', 'b.txt'))
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'assets', 'a.txt'))).toBe(true)
    expect(fs.existsSync(path.join(buildDir, 'assets', 'b.txt'))).toBe(false)
  })

  test('a failed build after a deletion changes nothing; the next good one removes the file', async () => {
    const { serverless, serviceDir, buildDir, devBuild } =
      twoFunctionService(esbuild)
    serverless.service.package.patterns = ['assets/**']
    writeAll(serviceDir, { 'assets/a.txt': 'a', 'assets/b.txt': 'b' })
    expect((await devBuild(['api'])).error).toBeUndefined()
    const good = fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')
    fs.rmSync(path.join(serviceDir, 'assets', 'b.txt'))
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'api.ts'),
      'export const handler = (\n',
    )
    const failed = await devBuild(['api'])
    expect(failed.error).toMatchObject({ code: 'ESBULD_BUILD_ERROR' })
    expect(
      fs.readFileSync(path.join(buildDir, 'assets', 'b.txt'), 'utf8'),
    ).toBe('b')
    expect(fs.readFileSync(path.join(buildDir, 'src', 'api.js'), 'utf8')).toBe(
      good,
    )
    fs.writeFileSync(path.join(serviceDir, 'src', 'api.ts'), GOOD_API)
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'assets', 'b.txt'))).toBe(false)
    expect(fs.existsSync(path.join(buildDir, 'assets', 'a.txt'))).toBe(true)
  })
})

describe("the package.json of a dev session's build directory", () => {
  test('bundling: the first dev build writes the package.json the deployed artifact has', async () => {
    const { serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: true,
    })
    fs.writeFileSync(
      path.join(serviceDir, 'package.json'),
      JSON.stringify({
        name: 'svc',
        private: true,
        imports: { '#lib/*': './src/lib/*.js' },
        devDependencies: { typescript: '5.0.0' },
      }),
    )
    // The one a deploy wrote is replaced, not kept.
    writeAll(buildDir, { 'package.json': '{"type":"module"}' })
    expect((await devBuild(['api'])).error).toBeUndefined()
    // It decides how Node.js loads the build's `.js` files, as in the deployed artifact, instead
    // of a package.json above the service directory.
    expect(
      JSON.parse(fs.readFileSync(path.join(buildDir, 'package.json'), 'utf8')),
    ).toEqual({
      name: 'svc',
      private: true,
      imports: { '#lib/*': './src/lib/*.js' },
    })
    expect(fs.existsSync(path.join(buildDir, 'node_modules'))).toBe(false)
  })

  test('bundling, a service without a package.json: an empty one, as in the deployed artifact', async () => {
    const { serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: true,
    })
    fs.rmSync(path.join(serviceDir, 'package.json'))
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(
      JSON.parse(fs.readFileSync(path.join(buildDir, 'package.json'), 'utf8')),
    ).toEqual({})
  })
})

describe('not bundling, a source file removed during the session', () => {
  test('a deleted or renamed module leaves the build directory with the next build', async () => {
    const { serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: false,
    })
    writeAll(serviceDir, { 'src/util.ts': 'export const util = 1\n' })
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'src', 'util.js'))).toBe(true)
    fs.renameSync(
      path.join(serviceDir, 'src', 'util.ts'),
      path.join(serviceDir, 'src', 'helpers.ts'),
    )
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'src', 'helpers.js'))).toBe(true)
    expect(
      fs
        .readdirSync(path.join(buildDir, 'src'))
        .filter((name) => name.startsWith('util')),
    ).toEqual([])
  })

  test('a module and a pattern file renamed by case only keep their output, under the new name', async () => {
    // On a case-insensitive file system (the macOS and Windows default, and this test's temporary
    // directory on macOS) the new output replaces the old file, which keeps its name; on a
    // case-sensitive one both names exist until the old one is removed. Either way the build
    // directory ends with the new name only.
    const { serverless, serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: false,
    })
    serverless.service.package.patterns = ['assets/**']
    writeAll(serviceDir, {
      'src/Util.ts': 'export const util = 1\n',
      'assets/Notes.txt': 'one',
    })
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.readdirSync(path.join(buildDir, 'src'))).toContain('Util.js')
    fs.renameSync(
      path.join(serviceDir, 'src', 'Util.ts'),
      path.join(serviceDir, 'src', 'util.ts'),
    )
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'util.ts'),
      'export const util = 2\n',
    )
    fs.renameSync(
      path.join(serviceDir, 'assets', 'Notes.txt'),
      path.join(serviceDir, 'assets', 'notes.txt'),
    )
    fs.writeFileSync(path.join(serviceDir, 'assets', 'notes.txt'), 'two')
    expect((await devBuild(['api'])).error).toBeUndefined()
    const named = (dir, name) =>
      fs
        .readdirSync(path.join(buildDir, dir))
        .filter((entry) => entry.toLowerCase() === name)
    expect(named('src', 'util.js')).toEqual(['util.js'])
    expect(
      fs.readFileSync(path.join(buildDir, 'src', 'util.js'), 'utf8'),
    ).toContain('util = 2')
    expect(named('assets', 'notes.txt')).toEqual(['notes.txt'])
    expect(
      fs.readFileSync(path.join(buildDir, 'assets', 'notes.txt'), 'utf8'),
    ).toBe('two')
    // Nothing the promotion set aside is left either.
    expect(
      fs
        .readdirSync(path.join(buildDir, 'src'))
        .filter((entry) => entry.endsWith('.old')),
    ).toEqual([])
  })

  test('a failed build after a deletion keeps the module; the next good one removes it', async () => {
    const { serviceDir, buildDir, devBuild } = twoFunctionService({
      bundle: false,
    })
    writeAll(serviceDir, { 'src/util.ts': 'export const util = 1\n' })
    expect((await devBuild(['api'])).error).toBeUndefined()
    fs.rmSync(path.join(serviceDir, 'src', 'util.ts'))
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'api.ts'),
      'export const handler = (\n',
    )
    expect((await devBuild(['api'])).error).toMatchObject({
      code: 'ESBULD_BUILD_ERROR',
    })
    expect(fs.existsSync(path.join(buildDir, 'src', 'util.js'))).toBe(true)
    fs.writeFileSync(path.join(serviceDir, 'src', 'api.ts'), GOOD_API)
    expect((await devBuild(['api'])).error).toBeUndefined()
    expect(fs.existsSync(path.join(buildDir, 'src', 'util.js'))).toBe(false)
    expect(fs.existsSync(path.join(buildDir, 'src', 'api.js'))).toBe(true)
  })
})

describe('a dev build after a case-only rename', () => {
  const dirWith = (files) => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-case-')),
    )
    dirs.push(dir)
    writeAll(dir, files)
    return dir
  }

  test('keeps a previous path that is the same file as a current one', async () => {
    // As a case-insensitive file system does: both names resolve to the one file on disk.
    const buildDir = dirWith({ 'src/util.js': 'new' })
    const resolvePath = async (file) =>
      path.join(path.dirname(file), path.basename(file).toLowerCase())
    expect(
      await devOutputsToRemove({
        buildDir,
        previous: new Set(['src/Util.js', 'src/gone.js', 'src/util.js']),
        current: new Set(['src/util.js']),
        resolvePath,
      }),
    ).toEqual(['src/gone.js'])
  })

  test('removes the old name on a case-sensitive file system, where it is another file', async () => {
    // Each name resolves to itself: two files.
    const buildDir = dirWith({ 'src/util.js': 'new' })
    expect(
      await devOutputsToRemove({
        buildDir,
        previous: new Set(['src/Util.js']),
        current: new Set(['src/util.js']),
        resolvePath: async (file) => file,
      }),
    ).toEqual(['src/Util.js'])
  })

  test('removes a previous path that cannot be resolved', async () => {
    const buildDir = dirWith({ 'src/util.js': 'new' })
    const resolvePath = async (file) => {
      if (path.basename(file) === 'Util.js') {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return file
    }
    expect(
      await devOutputsToRemove({
        buildDir,
        previous: new Set(['src/Util.js']),
        current: new Set(['src/util.js']),
        resolvePath,
      }),
    ).toEqual(['src/Util.js'])
  })

  test('gives a file moved onto a name that differs in case the new name', async () => {
    const dir = dirWith({ 'staged.js': 'new', 'Api.js': 'old' })
    const to = path.join(dir, 'api.js')
    // The file system kept the existing name, as a case-insensitive one does.
    const onDisk = new Map([[to, path.join(dir, 'Api.js')]])
    const renamed = []
    const move = await promoteDevOutput(path.join(dir, 'staged.js'), to, {
      resolvePath: async (file) => onDisk.get(file) ?? file,
      renameFile: async (source, target) => {
        renamed.push([path.basename(source), path.basename(target)])
        return fs.promises.rename(source, target)
      },
    })
    await move.discard()
    expect(renamed).toEqual([
      ['staged.js', 'api.js'],
      ['Api.js', 'api.js'],
    ])
  })

  test('renames nothing more on a case-sensitive file system', async () => {
    const dir = dirWith({ 'staged.js': 'new', 'Api.js': 'old' })
    const renamed = []
    const move = await promoteDevOutput(
      path.join(dir, 'staged.js'),
      path.join(dir, 'api.js'),
      {
        resolvePath: async (file) => file,
        renameFile: async (source, target) => {
          renamed.push([path.basename(source), path.basename(target)])
          return fs.promises.rename(source, target)
        },
      },
    )
    await move.discard()
    expect(renamed).toEqual([['staged.js', 'api.js']])
  })
})
