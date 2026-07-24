/**
 * The decision to inject NODE_OPTIONS=--enable-source-maps must follow the
 * EFFECTIVE sourcemap setting — the merge of serverless.yml over an esbuild
 * config file over the defaults — not just the raw serverless.yml value.
 *
 * Before the fix (#12997), the env-var decision read only
 * `service.build.esbuild.sourcemap`: with `sourcemap: false` set solely inside
 * a `configFile`, the build correctly emitted no source maps, yet every
 * function still received NODE_OPTIONS=--enable-source-maps.
 *
 * These tests run the real esbuild binary over a tiny handler so the emitted
 * artifacts (presence/absence of .map files) are asserted alongside the env
 * var, pinning both halves of the behavior to the same effective setting.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const HANDLER_SOURCE =
  'export const hello = async () => ({ statusCode: 200 })\n'

function makeConfigFile(esbuildOptions) {
  return `module.exports = () => (${JSON.stringify(esbuildOptions)})\n`
}

async function buildService({ esbuildConfig, configFileContents }) {
  const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-sourcemap-'))
  createdServiceDirs.push(serviceDir)
  fs.writeFileSync(path.join(serviceDir, 'handler.js'), HANDLER_SOURCE)
  fs.writeFileSync(path.join(serviceDir, 'package.json'), '{}')
  if (configFileContents) {
    fs.writeFileSync(
      path.join(serviceDir, 'esbuild.config.js'),
      configFileContents,
    )
  }

  const functions = {
    hello: { handler: 'handler.hello', runtime: 'nodejs20.x' },
  }

  const serverless = {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'my-service',
      provider: { runtime: 'nodejs20.x' },
      build: { esbuild: esbuildConfig },
      functions,
      getFunction: (alias) => functions[alias],
    },
  }

  const plugin = new Esbuild(serverless, {})
  plugin.functions = async () => functions

  await plugin._build()

  const buildDir = path.join(serviceDir, '.serverless', 'build')
  const emittedFiles = fs.existsSync(buildDir) ? fs.readdirSync(buildDir) : []
  return {
    nodeOptions: functions.hello.environment?.NODE_OPTIONS,
    mapFiles: emittedFiles.filter((file) => file.endsWith('.map')),
  }
}

describe('esbuild sourcemap NODE_OPTIONS decision', () => {
  it('does not set NODE_OPTIONS when the config file sets sourcemap: false', async () => {
    const { nodeOptions, mapFiles } = await buildService({
      esbuildConfig: { configFile: './esbuild.config.js' },
      configFileContents: makeConfigFile({
        bundle: true,
        minify: false,
        sourcemap: false,
      }),
    })

    expect(mapFiles).toEqual([])
    expect(nodeOptions).toBeUndefined()
  })

  it('sets NODE_OPTIONS when the config file enables sourcemaps', async () => {
    const { nodeOptions, mapFiles } = await buildService({
      esbuildConfig: { configFile: './esbuild.config.js' },
      configFileContents: makeConfigFile({ bundle: true, sourcemap: true }),
    })

    expect(mapFiles).toEqual(['handler.js.map'])
    expect(nodeOptions).toBe('--enable-source-maps')
  })

  it('sets NODE_OPTIONS by default when neither yml nor config file set sourcemap', async () => {
    const { nodeOptions, mapFiles } = await buildService({
      esbuildConfig: { configFile: './esbuild.config.js' },
      configFileContents: makeConfigFile({ bundle: true }),
    })

    expect(mapFiles).toEqual(['handler.js.map'])
    expect(nodeOptions).toBe('--enable-source-maps')
  })

  it('lets yml sourcemap: false win over the config file enabling sourcemaps', async () => {
    const { nodeOptions, mapFiles } = await buildService({
      esbuildConfig: { configFile: './esbuild.config.js', sourcemap: false },
      configFileContents: makeConfigFile({ bundle: true, sourcemap: true }),
    })

    expect(mapFiles).toEqual([])
    expect(nodeOptions).toBeUndefined()
  })

  it('does not set NODE_OPTIONS for yml sourcemap object without setNodeOptions', async () => {
    const { nodeOptions, mapFiles } = await buildService({
      esbuildConfig: { sourcemap: { type: 'linked' } },
    })

    expect(mapFiles).toEqual(['handler.js.map'])
    expect(nodeOptions).toBeUndefined()
  })

  it('sets NODE_OPTIONS for yml sourcemap object with setNodeOptions: true', async () => {
    const { nodeOptions, mapFiles } = await buildService({
      esbuildConfig: { sourcemap: { type: 'linked', setNodeOptions: true } },
    })

    expect(mapFiles).toEqual(['handler.js.map'])
    expect(nodeOptions).toBe('--enable-source-maps')
  })
})
