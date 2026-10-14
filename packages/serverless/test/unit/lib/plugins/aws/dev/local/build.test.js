import { afterEach, describe, expect, jest, test } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { createDevBuild } from '../../../../../../../lib/plugins/aws/dev/local/build.js'
import { nodeAdapter } from '../../../../../../../lib/plugins/aws/dev/local/adapters/node.js'
import { currentDevBuildRequest } from '../../../../../../../lib/utils/dev-build-request.js'
import { cleanTempDirs, tempDir, waitFor, write } from './helpers.js'

const Esbuild = (
  await import('../../../../../../../lib/plugins/esbuild/index.js')
).default

jest.setTimeout(60_000)
afterEach(() => cleanTempDirs())

const serverlessWith = (functions, spawn) => ({
  service: { getFunction: (key) => functions[key] },
  pluginManager: { spawn },
})

describe('the dev build', () => {
  test('gives the build plugins a dev build request for its functions, only while the build runs', async () => {
    const functions = {
      api: { handler: 'src/api.main' },
      py: { handler: 'app.handler' },
    }
    const seen = []
    const serverless = serverlessWith(functions, async (name) =>
      seen.push({
        name,
        functions: currentDevBuildRequest(serverless)?.functions,
      }),
    )
    const build = createDevBuild({ serverless, functionKeys: ['api'] })
    expect(currentDevBuildRequest(serverless)).toBeNull()
    expect(await build.run()).toEqual({
      ok: true,
      ms: expect.any(Number),
      functions: [],
      built: [],
      files: {},
    })
    expect(seen).toEqual([{ name: 'dev-build', functions: ['api'] }])
    expect('devBuildRequest' in serverless).toBe(false)
    // Dev Mode never touches a function's configuration.
    expect(functions).toEqual({
      api: { handler: 'src/api.main' },
      py: { handler: 'app.handler' },
    })
  })

  test('a failed build is a result, not an exception, and closes the request', async () => {
    const error = new Error('Build failed with 1 error')
    const serverless = serverlessWith({ api: { handler: 'h.h' } }, async () => {
      throw error
    })
    const build = createDevBuild({
      serverless,
      functionKeys: ['api'],
      now: (() => {
        let t = 0
        return () => (t += 5)
      })(),
    })
    expect(await build.run()).toEqual({
      ok: false,
      ms: 5,
      error,
      functions: [],
      built: [],
      files: {},
    })
    expect('devBuildRequest' in serverless).toBe(false)
  })

  test('reports the functions a build plugin covers and builds, afresh for each build', async () => {
    const serverless = serverlessWith({ api: { handler: 'h.h' } }, null)
    let run = 0
    serverless.pluginManager.spawn = async () => {
      run += 1
      const request = currentDevBuildRequest(serverless)
      request.cover('api')
      // Names the request does not ask for are ignored.
      request.cover('elsewhere')
      if (run === 1) request.markBuilt('api')
      if (run === 2) throw new Error('boom')
    }
    const build = createDevBuild({ serverless, functionKeys: ['api', 'js'] })
    expect(await build.run()).toMatchObject({
      ok: true,
      functions: ['api'],
      built: ['api'],
    })
    expect(await build.run()).toMatchObject({
      ok: false,
      functions: ['api'],
      built: [],
    })
    expect(await build.run()).toMatchObject({
      ok: true,
      functions: ['api'],
      built: [],
    })
    expect('devBuildRequest' in serverless).toBe(false)
  })

  test('the build plugins do not see the dev selectors, and they are back afterwards', async () => {
    const options = {
      function: ['a', 'b'],
      f: ['a', 'b'],
      'skip-function': ['c'],
      stage: 'dev',
    }
    const seen = []
    const build = createDevBuild({
      serverless: serverlessWith(
        { a: { handler: 'a.h' }, b: { handler: 'b.h' } },
        async () => seen.push({ ...options }),
      ),
      functionKeys: ['a', 'b'],
      options,
    })
    expect(await build.run()).toMatchObject({ ok: true })
    expect(seen).toEqual([{ stage: 'dev' }])
    expect(options).toEqual({
      function: ['a', 'b'],
      f: ['a', 'b'],
      'skip-function': ['c'],
      stage: 'dev',
    })
  })

  test('the dev selectors are back after a failed build too, and absent ones stay absent', async () => {
    const options = { function: ['a', 'b'], stage: 'dev' }
    const seen = []
    const build = createDevBuild({
      serverless: serverlessWith({ a: { handler: 'a.h' } }, async () => {
        seen.push({ ...options })
        throw new Error('Build failed')
      }),
      functionKeys: ['a'],
      options,
    })
    expect(await build.run()).toMatchObject({ ok: false })
    expect(seen).toEqual([{ stage: 'dev' }])
    expect(options).toEqual({ function: ['a', 'b'], stage: 'dev' })
    expect('f' in options).toBe(false)
    expect('skip-function' in options).toBe(false)
  })

  test('uses the options every plugin shares when none are passed', async () => {
    const cliOptions = { function: 'a' }
    const seen = []
    const serverless = serverlessWith({ a: { handler: 'a.h' } }, async () =>
      seen.push({ ...cliOptions }),
    )
    serverless.pluginManager.cliOptions = cliOptions
    await createDevBuild({ serverless, functionKeys: ['a'] }).run()
    expect(seen).toEqual([{}])
    expect(cliOptions).toEqual({ function: 'a' })
  })

  test('runs one build at a time', async () => {
    const options = { function: ['a'] }
    let release
    const seen = []
    const spawn = jest.fn(async () => {
      seen.push({ ...options })
      if (spawn.mock.calls.length === 1) {
        await new Promise((resolve) => {
          release = resolve
        })
      }
    })
    const build = createDevBuild({
      serverless: serverlessWith({ a: { handler: 'a.h' } }, spawn),
      functionKeys: ['a'],
      options,
    })
    const first = build.run()
    const second = build.run()
    expect(await waitFor(() => spawn.mock.calls.length > 0)).toBe(true)
    // The second run waits for the first instead of building alongside it.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(spawn).toHaveBeenCalledTimes(1)
    release()
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(seen).toEqual([{}, {}])
    expect(options).toEqual({ function: ['a'] })
  })
})

describe('the dev build with the Framework esbuild plugin', () => {
  const service = (esbuildConfig) => {
    const serviceDir = write(tempDir(), {
      'package.json': '{"name":"svc","private":true}\n',
      'src/api.ts': 'export const main = async (): Promise<number> => 1\n',
      'src/other.ts': 'export const main = async (): Promise<number> => 2\n',
    })
    const functions = {
      api: { handler: 'src/api.main' },
      other: { handler: 'src/other.main' },
    }
    // `serverless dev --function api --function other`: the selectors are in the options every
    // plugin shares.
    const options = { function: ['api', 'other'] }
    const serverless = {
      serviceDir,
      config: { serviceDir },
      service: {
        service: 'svc',
        provider: { runtime: 'nodejs20.x' },
        package: {},
        ...(esbuildConfig && { build: { esbuild: esbuildConfig } }),
        functions,
        getFunction: (key) => functions[key],
        getAllFunctions: () => Object.keys(functions),
      },
      pluginManager: { plugins: [], cliOptions: options },
    }
    const esbuild = new Esbuild(serverless, options)
    const lifecycles = []
    serverless.pluginManager.plugins.push(esbuild)
    serverless.pluginManager.spawn = async (name) => {
      lifecycles.push(name)
      await esbuild.hooks['before:dev-build:build']()
    }
    return { serviceDir, functions, serverless, lifecycles }
  }

  test('builds a TypeScript handler to the file the Node.js adapter runs', async () => {
    const { serviceDir, functions, serverless, lifecycles } = service()
    const build = createDevBuild({ serverless, functionKeys: ['api'] })
    expect(await build.run()).toEqual({
      ok: true,
      ms: expect.any(Number),
      functions: ['api'],
      built: ['api'],
      files: { api: 'src/api.js' },
    })
    expect(lifecycles).toEqual(['dev-build'])
    // The build plugin adds only its own NODE_OPTIONS setting; Dev Mode adds nothing.
    expect(
      Object.keys(functions.api).filter((key) => key !== 'environment'),
    ).toEqual(['handler'])

    const prepared = await nodeAdapter.prepare({
      serverless,
      functionKey: 'api',
      functionConfig: functions.api,
      serviceDir,
      built: true,
    })
    const built = path.join(serviceDir, '.serverless', 'build', 'src', 'api.js')
    expect(prepared).toMatchObject({
      codeRoot: path.join(serviceDir, '.serverless', 'build'),
      handlerFile: built,
      exportPath: 'main',
      loader: null,
    })
    expect(fs.readFileSync(built, 'utf8')).toContain('main')
  })

  test('without bundling, builds .mts and .cts handlers to the .mjs and .cjs files the Node.js adapter runs', async () => {
    const { serviceDir, functions, serverless } = service({ bundle: false })
    for (const [name, extension] of [
      ['api', '.mts'],
      ['other', '.cts'],
    ]) {
      fs.renameSync(
        path.join(serviceDir, 'src', `${name}.ts`),
        path.join(serviceDir, 'src', `${name}${extension}`),
      )
    }
    const build = createDevBuild({
      serverless,
      functionKeys: ['api', 'other'],
    })
    const result = await build.run()
    expect(result).toMatchObject({
      ok: true,
      built: ['api', 'other'],
      files: { api: 'src/api.mjs', other: 'src/other.cjs' },
    })
    for (const key of ['api', 'other']) {
      const prepared = await nodeAdapter.prepare({
        serverless,
        functionKey: key,
        functionConfig: functions[key],
        serviceDir,
        built: true,
        builtFile: result.files[key],
      })
      expect(prepared.handlerFile).toBe(
        path.join(serviceDir, '.serverless', 'build', result.files[key]),
      )
      expect(fs.existsSync(prepared.handlerFile)).toBe(true)
      expect(prepared.loader).toBeNull()
    }
  })

  test('a syntax error is a failed build that keeps the last good output', async () => {
    const { serviceDir, serverless } = service()
    const build = createDevBuild({ serverless, functionKeys: ['api'] })
    expect(await build.run()).toMatchObject({ ok: true })
    const built = path.join(serviceDir, '.serverless', 'build', 'src', 'api.js')
    const good = fs.readFileSync(built, 'utf8')
    write(serviceDir, { 'src/api.ts': 'export const main = async ( => 1\n' })
    const result = await build.run()
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'ESBULD_BUILD_ERROR' },
      functions: ['api'],
      built: [],
    })
    expect(result.error.message).toMatch(/failed with \d+ error/)
    expect(fs.readFileSync(built, 'utf8')).toBe(good)
    expect('devBuildRequest' in serverless).toBe(false)
  })

  test('names only the functions esbuild builds, whether the build succeeds or fails', async () => {
    const { serviceDir, functions, serverless } = service()
    write(serviceDir, {
      'src/plain.mjs': 'export const main = async () => 3\n',
    })
    functions.plain = { handler: 'src/plain.main' }
    serverless.pluginManager.cliOptions.function.push('plain')
    const build = createDevBuild({
      serverless,
      functionKeys: ['api', 'plain'],
    })
    expect(await build.run()).toMatchObject({
      ok: true,
      functions: ['api'],
      built: ['api'],
    })
    write(serviceDir, { 'src/api.ts': 'export const main = async ( => 1\n' })
    expect(await build.run()).toMatchObject({
      ok: false,
      functions: ['api'],
    })
  })

  test('a failure outside esbuild is a failed build with that error', async () => {
    const { serverless } = service({
      bundle: false,
      outExtension: { '.js': '.mjs' },
    })
    const build = createDevBuild({ serverless, functionKeys: ['api'] })
    const result = await build.run()
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'ESBUILD_OUT_EXTENSION_FORMAT_MISMATCH' },
      // Configured, esbuild builds every Node.js function, and says so before it fails.
      functions: ['api'],
    })
    expect(result.error.message).toContain('Emitting ".mjs" files')
  })
})
