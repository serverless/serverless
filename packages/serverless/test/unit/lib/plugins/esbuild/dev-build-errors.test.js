/**
 * Dev mode builds (the dev hook under a dev build request) keep the last good output, as before, and tell
 * their caller whenever a build fails: esbuild's own (already printed) errors as
 * ESBULD_BUILD_ERROR, every other error as it was thrown. `serverless dev` shows why instead of
 * serving the old build in silence.
 */
import { afterAll, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  closeDevBuildRequest,
  openDevBuildRequest,
} from '../../../../../lib/utils/dev-build-request.js'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

jest.setTimeout(60_000)
const dirs = []
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

const serviceWith = (sources, esbuild, fns) => {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-dev-')),
  )
  dirs.push(serviceDir)
  fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true })
  for (const [name, source] of Object.entries(sources)) {
    fs.writeFileSync(path.join(serviceDir, 'src', name), source)
  }
  fs.writeFileSync(
    path.join(serviceDir, 'package.json'),
    '{"name":"svc","private":true}\n',
  )
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  const serverless = {
    serviceDir,
    config: { serviceDir },
    devmodeEnabled: true,
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
  /** The dev hook, under a dev build request for `functions` that is closed however it ends. */
  const devBuild = async (functions) => {
    const request = openDevBuildRequest(serverless, { functions })
    try {
      return await plugin.hooks['before:dev-build:build']()
    } finally {
      closeDevBuildRequest(serverless, request)
    }
  }
  return { plugin, serverless, serviceDir, buildDir, devBuild }
}

const devService = (source, esbuild) => {
  const fns = {
    hello: { handler: 'src/handler.hello' },
  }
  const service = serviceWith({ 'handler.ts': source }, esbuild, fns)
  fs.mkdirSync(path.join(service.buildDir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(service.buildDir, 'src', 'handler.js'),
    'last good build',
  )
  // An earlier dev build of this session wrote it (the first one starts from an empty build
  // directory).
  service.plugin.devOutputs = new Set([path.join('src', 'handler.js')])
  service.plugin.functions = async () => fns
  return service
}

describe.each([
  ['bundling', { bundle: true }],
  ['not bundling', { bundle: false }],
])('a dev build, %s', (name, esbuild) => {
  test('rejects with the esbuild error and keeps the last good output', async () => {
    const { devBuild, buildDir } = devService(
      'export const hello = async ( => 1\n',
      esbuild,
    )
    await expect(devBuild(['hello'])).rejects.toMatchObject({
      code: 'ESBULD_BUILD_ERROR',
      message: expect.stringMatching(/failed with \d+ error/),
    })
    expect(
      fs.readFileSync(path.join(buildDir, 'src', 'handler.js'), 'utf8'),
    ).toBe('last good build')
  })

  test('builds a valid handler as before', async () => {
    const { devBuild, buildDir } = devService(
      'export const hello = async (): Promise<number> => 1\n',
      esbuild,
    )
    await expect(devBuild(['hello'])).resolves.toBeUndefined()
    expect(
      fs.readFileSync(path.join(buildDir, 'src', 'handler.js'), 'utf8'),
    ).not.toBe('last good build')
  })

  test('after a deploy build in the same process, builds only the functions the dev build request names', async () => {
    const fns = {
      hello: { handler: 'src/handler.hello' },
      other: { handler: 'src/other.hello' },
    }
    const { plugin, serverless, serviceDir, buildDir, devBuild } = serviceWith(
      {
        'handler.ts': 'export const hello = async (): Promise<number> => 1\n',
        'other.ts': 'export const hello = async (): Promise<number> => 2\n',
      },
      esbuild,
      fns,
    )
    serverless.devmodeEnabled = undefined
    await plugin._build()
    expect([...plugin.builtArtifacts.keys()].sort()).toEqual(['hello', 'other'])

    serverless.devmodeEnabled = true
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'handler.ts'),
      'export const hello = async (): Promise<string> => "saved"\n',
    )
    await expect(devBuild(['hello'])).resolves.toBeUndefined()
    expect(
      fs.readFileSync(path.join(buildDir, 'src', 'handler.js'), 'utf8'),
    ).toContain('saved')
    expect([...plugin.builtArtifacts.keys()]).toEqual(['hello'])
  })
})

test('a dev build that fails outside esbuild rejects with that error and keeps the last good output', async () => {
  const { devBuild, buildDir } = devService(
    'export const hello = async (): Promise<number> => 1\n',
    // A CommonJS build cannot emit `.mjs` files: the plugin refuses before esbuild runs.
    { bundle: false, outExtension: { '.js': '.mjs' } },
  )
  await expect(devBuild(['hello'])).rejects.toMatchObject({
    code: 'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH',
  })
  expect(
    fs.readFileSync(path.join(buildDir, 'src', 'handler.js'), 'utf8'),
  ).toBe('last good build')
})

test('a bundling dev build that fails after esbuild ran rejects with that error', async () => {
  const { devBuild, buildDir } = devService(
    'export const hello = async (): Promise<number> => 1\n',
    { bundle: true, metafile: true },
  )
  // The metafile cannot be written where a directory stands.
  fs.mkdirSync(path.join(buildDir, 'meta.json'))
  await expect(devBuild(['hello'])).rejects.toMatchObject({
    code: 'EISDIR',
  })
})

/**
 * A service in `<root>/svc` whose `package.patterns` select files beside its handler, above the
 * service directory and in its installed dependency tree, as the deployed artifact would.
 */
const patternService = (esbuild, handler) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-dev-patterns-')),
  )
  dirs.push(root)
  const serviceDir = path.join(root, 'svc')
  const files = {
    'svc/src/handler.ts':
      'export const hello = async (): Promise<number> => 1\n',
    'svc/src/templates/mail.html': '<p>mail</p>\n',
    'svc/node_modules/dep/index.js': 'module.exports = "installed"\n',
    'svc/package.json': '{"name":"svc","private":true}\n',
    'shared/config.json': '{"shared":true}\n',
    ...handler,
  }
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), content)
  }
  const fns = { hello: { handler: 'src/handler.hello' } }
  const serverless = {
    serviceDir,
    config: { serviceDir },
    devmodeEnabled: true,
    service: {
      service: 'svc',
      provider: { runtime: 'nodejs20.x' },
      package: {
        patterns: [
          'src/templates/**',
          '../shared/**',
          'node_modules/dep/**',
          ...(handler ? ['src/handler.js'] : []),
        ],
      },
      build: { esbuild },
      functions: fns,
      getFunction: (name) => fns[name],
      getAllFunctions: () => Object.keys(fns),
    },
    pluginManager: { spawn: async () => {} },
  }
  const plugin = new Esbuild(serverless, {})
  plugin.functions = async () => fns
  const devBuild = async () => {
    const request = openDevBuildRequest(serverless, { functions: ['hello'] })
    try {
      return await plugin.hooks['before:dev-build:build']()
    } finally {
      closeDevBuildRequest(serverless, request)
    }
  }
  const buildDir = path.join(serviceDir, '.serverless', 'build')
  const built = (file) => {
    try {
      return fs.readFileSync(path.join(buildDir, file), 'utf8')
    } catch {
      return null
    }
  }
  return { plugin, serviceDir, buildDir, devBuild, built }
}

describe.each([
  ['bundling', { bundle: true }],
  ['not bundling', { bundle: false }],
])('the files package.patterns select, in a dev build %s', (name, esbuild) => {
  test('are in the build beside the handler, those above the service directory at the path that remains, an installed dependency tree never', async () => {
    const { devBuild, built } = patternService(esbuild)
    await expect(devBuild()).resolves.toBeUndefined()
    expect(built('src/handler.js')).toContain('hello')
    expect(built('src/templates/mail.html')).toBe('<p>mail</p>\n')
    expect(built('shared/config.json')).toBe('{"shared":true}\n')
    // Dev Mode resolves dependencies from the service directory.
    expect(built('node_modules/dep/index.js')).toBeNull()
  })

  test('move in only with a build that succeeded', async () => {
    const { plugin, serviceDir, buildDir, devBuild, built } =
      patternService(esbuild)
    fs.mkdirSync(path.join(buildDir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(buildDir, 'src', 'handler.js'),
      'last good build',
    )
    // An earlier dev build of this session wrote it.
    plugin.devOutputs = new Set([path.join('src', 'handler.js')])
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'handler.ts'),
      'export const hello = async ( => 1\n',
    )
    await expect(devBuild()).rejects.toMatchObject({
      code: 'ESBULD_BUILD_ERROR',
    })
    expect(built('src/handler.js')).toBe('last good build')
    expect(built('src/templates/mail.html')).toBeNull()
    expect(built('shared/config.json')).toBeNull()
  })

  test('win over the build output at the same path, as in the deployed artifact', async () => {
    const source = 'export const hello = async () => "as written"\n'
    const { devBuild, built } = patternService(esbuild, {
      'svc/src/handler.ts': null,
      'svc/src/handler.js': source,
    })
    await expect(devBuild()).resolves.toBeUndefined()
    expect(built('src/handler.js')).toBe(source)
  })
})

/**
 * The pattern service, with a file only the function's own `package.patterns` select: above the
 * service directory, so a build without bundling does not sweep it in either.
 */
const functionPatternService = (esbuild, { individually }) => {
  const made = patternService(esbuild)
  const root = path.dirname(made.serviceDir)
  fs.mkdirSync(path.join(root, 'fn-shared'), { recursive: true })
  fs.writeFileSync(path.join(root, 'fn-shared', 'data.json'), '{"fn":true}\n')
  const { service } = made.plugin.serverless
  if (individually) service.package.individually = true
  service.functions.hello.package = { patterns: ['../fn-shared/**'] }
  return made
}

describe.each([
  ['bundling', { bundle: true }],
  ['not bundling', { bundle: false }],
])("a function's own package.patterns, in a dev build %s", (name, esbuild) => {
  test("are in the build under package.individually, as in that function's artifact", async () => {
    const { devBuild, built } = functionPatternService(esbuild, {
      individually: true,
    })
    await expect(devBuild()).resolves.toBeUndefined()
    expect(built('fn-shared/data.json')).toBe('{"fn":true}\n')
    // The service's own still are.
    expect(built('shared/config.json')).toBe('{"shared":true}\n')
  })

  test('are not without package.individually, as deploy does not ship them then', async () => {
    const { devBuild, built } = functionPatternService(esbuild, {
      individually: false,
    })
    await expect(devBuild()).resolves.toBeUndefined()
    expect(built('fn-shared/data.json')).toBeNull()
  })

  test('move in only with a build that succeeded', async () => {
    const { serviceDir, devBuild, built } = functionPatternService(esbuild, {
      individually: true,
    })
    fs.writeFileSync(
      path.join(serviceDir, 'src', 'handler.ts'),
      'export const hello = async ( => 1\n',
    )
    await expect(devBuild()).rejects.toMatchObject({
      code: 'ESBULD_BUILD_ERROR',
    })
    expect(built('fn-shared/data.json')).toBeNull()
  })
})
