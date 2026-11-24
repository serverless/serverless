/**
 * Functions on a customer-managed runtime: the Framework cannot tell the
 * runtime's language, so esbuild builds them only when the configuration asks
 * for it (function `build: esbuild`, or `build.esbuild` on the service).
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const aliasArn =
  'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod'

const createdServiceDirs = []

afterAll(() => {
  for (const dir of createdServiceDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// A service whose only source file is `src/handler.ts`
function makeTsServiceDir() {
  const serviceDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-cmr-')),
  )
  createdServiceDirs.push(serviceDir)
  fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(serviceDir, 'src', 'handler.ts'),
    'export const hello = async () => ({ statusCode: 200 })\n',
  )
  return serviceDir
}

// After Service.convertCustomerManagedRuntimes(), `runtime` reads `custom`
function makeServerless(
  serviceDir,
  { providerRuntime = 'custom', build } = {},
) {
  return {
    serviceDir,
    config: { serviceDir },
    service: {
      service: 'svc',
      provider: { runtime: providerRuntime },
      package: {},
      ...(build !== undefined && { build }),
      functions: {},
      getFunction: () => undefined,
      getAllFunctions: () => [],
    },
    pluginManager: { spawn: async () => {} },
  }
}

describe('esbuild and customer-managed runtimes', () => {
  describe('_shouldBuildFunction', () => {
    it('does not build a TypeScript handler without an explicit opt-in', async () => {
      const plugin = new Esbuild(makeServerless(makeTsServiceDir()), {})
      expect(
        await plugin._shouldBuildFunction({ handler: 'src/handler.hello' }),
      ).toBe(false)
    })

    it('builds with function-level build: esbuild', async () => {
      const plugin = new Esbuild(makeServerless(makeTsServiceDir()), {})
      expect(
        await plugin._shouldBuildFunction({
          handler: 'src/handler.hello',
          build: 'esbuild',
        }),
      ).toBe(true)
    })

    it('builds with build.esbuild on the service', async () => {
      const plugin = new Esbuild(
        makeServerless(makeTsServiceDir(), {
          build: { esbuild: { bundle: true } },
        }),
        {},
      )
      expect(
        await plugin._shouldBuildFunction({ handler: 'src/handler.hello' }),
      ).toBe(true)
    })

    it('respects function-level build: false', async () => {
      const plugin = new Esbuild(
        makeServerless(makeTsServiceDir(), { build: { esbuild: {} } }),
        {},
      )
      expect(
        await plugin._shouldBuildFunction({
          handler: 'src/handler.hello',
          build: false,
        }),
      ).toBe(false)
    })
  })

  describe('WillEsBuildRun (raw configuration)', () => {
    const willRun = (configFile) =>
      Esbuild.WillEsBuildRun(configFile, makeTsServiceDir())

    it.each([
      ['an alias ARN', aliasArn],
      ['an intrinsic', { Ref: 'RuntimeStable' }],
    ])(
      'is false for %s without an opt-in, and does not throw',
      (_, runtime) => {
        expect(
          willRun({
            provider: { runtime },
            functions: { hello: { handler: 'src/handler.hello' } },
          }),
        ).toBe(false)
      },
    )

    it('is true with function-level build: esbuild', () => {
      expect(
        willRun({
          provider: { runtime: { Ref: 'RuntimeStable' } },
          functions: {
            hello: { handler: 'src/handler.hello', build: 'esbuild' },
          },
        }),
      ).toBe(true)
    })

    it('is true with build.esbuild on the service', () => {
      expect(
        willRun({
          provider: { runtime: aliasArn },
          build: { esbuild: {} },
          functions: { hello: { handler: 'src/handler.hello' } },
        }),
      ).toBe(true)
    })
  })
})
