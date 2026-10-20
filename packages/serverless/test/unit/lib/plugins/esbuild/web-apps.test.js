/**
 * Web apps (`webApps.<name>.entry`) are a second entry source for the esbuild
 * plugin. They are selected with the function rules, except that the runtime
 * is the web app's own, else `provider.runtime` when it is nodejs24.x or newer,
 * else `nodejs24.x`, and the service-level `package.artifact` / `package.individually` rules do not
 * apply: every web app is zipped on its own, to `.serverless/webapps/<name>.zip`,
 * with the built entry and the generated `__sls_web_bootstrap.mjs`.
 *
 * Nothing function-shaped may see them: no pseudo-function objects, no
 * `builtFunctions` entries, no `NODE_OPTIONS`, no writes into the web app
 * config. The function artifacts must come out exactly as they do without
 * web apps.
 *
 * The builds run the real esbuild; only the dependency install is stubbed.
 */

import { jest } from '@jest/globals'
import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import JsZip from 'jszip'
import { log } from '@serverless/util'

const Esbuild = (await import('../../../../../lib/plugins/esbuild/index.js'))
  .default

const BOOTSTRAP = '__sls_web_bootstrap.mjs'
const PACKAGE_HOOK = 'before:package:createDeploymentArtifacts'

const createdDirs = []

afterAll(() => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// realpath: macOS resolves the temp dir through a symlink, and esbuild reports
// real paths.
function makeTempDir() {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-esbuild-webapps-')),
  )
  createdDirs.push(dir)
  return dir
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, ...relativePath.split('/'))
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
}

const SERVICE_FILES = {
  'package.json': '{"name":"svc"}\n',
  'src/handler.ts':
    'export const hello = async (): Promise<object> => ({ statusCode: 200 })\n',
  'src/greeting.ts': 'export const greeting = (): string => "hi"\n',
  'src/server.ts': [
    'import { greeting } from "./greeting"',
    'const port: string | undefined = process.env.PORT',
    'console.log(JSON.stringify({ port, host: process.env.HOSTNAME, greeting: greeting() }))',
    '',
  ].join('\n'),
}

function makeService({
  files = SERVICE_FILES,
  functions = { hello: { handler: 'src/handler.hello' } },
  webApps = { api: { entry: 'src/server.ts' } },
  provider = { runtime: 'nodejs20.x' },
  build,
  servicePackage = {},
  serviceDir = makeTempDir(),
} = {}) {
  writeFiles(serviceDir, files)
  const serverless = {
    serviceDir,
    config: { serviceDir },
    configurationInput: webApps ? { webApps } : {},
    service: {
      service: 'my-service',
      provider,
      package: servicePackage,
      ...(build !== undefined ? { build } : {}),
      functions,
      getFunction: (name) => functions[name],
      getAllFunctions: () => Object.keys(functions),
    },
    pluginManager: { spawn: async () => {} },
  }
  const plugin = new Esbuild(serverless, {})
  // The install runs the package manager; the build directory's package.json
  // is still written.
  plugin._installArtifactDependencies = async () => {}
  return { plugin, serverless, serviceDir, functions, webApps }
}

async function packageService(options) {
  const service = makeService(options)
  await service.plugin.hooks[PACKAGE_HOOK]()
  return service
}

const webAppZipPath = (serviceDir, name) =>
  path.join(serviceDir, '.serverless', 'webapps', `${name}.zip`)

async function zipEntries(zipPath) {
  const zip = await JsZip.loadAsync(fs.readFileSync(zipPath))
  return Object.keys(zip.files).sort()
}

async function zipFile(zipPath, name) {
  const zip = await JsZip.loadAsync(fs.readFileSync(zipPath))
  return zip.file(name)?.async('string')
}

const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

describe('esbuild web apps', () => {
  jest.setTimeout(60_000)

  describe('WillEsBuildRun', () => {
    function willRun(configFile, files = { 'src/server.ts': 'export {}\n' }) {
      const serviceDir = makeTempDir()
      writeFiles(serviceDir, files)
      return Esbuild.WillEsBuildRun(
        { provider: { runtime: 'nodejs20.x' }, ...configFile },
        serviceDir,
      )
    }

    test('is true for a TypeScript entry that exists', () => {
      expect(willRun({ webApps: { a: { entry: 'src/server.ts' } } })).toBe(true)
    })

    test('is false when the entry file does not exist', () => {
      expect(willRun({ webApps: { a: { entry: 'src/server.ts' } } }, {})).toBe(
        false,
      )
    })

    test('is false with build: false on the web app', () => {
      expect(
        willRun({ webApps: { a: { entry: 'src/server.ts', build: false } } }),
      ).toBe(false)
    })

    test('is false with build.esbuild: false on the service', () => {
      expect(
        willRun({
          build: { esbuild: false },
          webApps: { a: { entry: 'src/server.ts' } },
        }),
      ).toBe(false)
    })

    test('is false for a .js entry unless build.esbuild is set', () => {
      const files = { 'src/server.js': 'module.exports = {}\n' }
      expect(
        willRun({ webApps: { a: { entry: 'src/server.js' } } }, files),
      ).toBe(false)
      expect(
        willRun(
          {
            build: { esbuild: { bundle: true } },
            webApps: { a: { entry: 'src/server.js' } },
          },
          files,
        ),
      ).toBe(true)
      expect(
        willRun(
          { webApps: { a: { entry: 'src/server.js', build: 'esbuild' } } },
          files,
        ),
      ).toBe(true)
    })

    test('is false when the web app sets package.artifact', () => {
      expect(
        willRun({
          webApps: {
            a: { entry: 'src/server.ts', package: { artifact: 'app.zip' } },
          },
        }),
      ).toBe(false)
    })

    test('ignores a service-level package.artifact, and a non-Node provider.runtime falls back to nodejs24.x', () => {
      expect(
        willRun({
          provider: { runtime: 'python3.12' },
          package: { artifact: 'service.zip' },
          webApps: { a: { entry: 'src/server.ts' } },
        }),
      ).toBe(true)
    })

    test('is true with an inherited provider.runtime', () => {
      expect(
        willRun({
          provider: { runtime: 'nodejs26.x' },
          webApps: { a: { entry: 'src/server.ts' } },
        }),
      ).toBe(true)
    })

    test('does not throw on a malformed web app', () => {
      expect(willRun({ webApps: { a: { entry: 42 } } })).toBe(false)
      expect(
        willRun({ webApps: { a: { entry: 'src/server.ts', runtime: 24 } } }),
      ).toBe(false)
      expect(willRun({ webApps: { a: null } })).toBe(false)
    })
  })

  describe('_shouldBuildFunction with isWebApp', () => {
    test('ignores the service-level package.artifact, and a non-Node provider.runtime falls back to nodejs24.x', async () => {
      const { plugin } = makeService({
        provider: { runtime: 'python3.12' },
        servicePackage: { artifact: 'service.zip' },
      })
      await expect(
        plugin._shouldBuildFunction({ entry: 'src/server.ts' }, 'entry', {
          isWebApp: true,
        }),
      ).resolves.toBe(true)
      // Functions keep their rules.
      await expect(
        plugin._shouldBuildFunction({
          handler: 'src/handler.hello',
          runtime: 'nodejs20.x',
        }),
      ).resolves.toBe(false)
    })

    test('resolves the entry by its own extension', async () => {
      // A sibling `.js` must not shadow the configured `.ts` entry.
      const { plugin } = makeService({
        files: { ...SERVICE_FILES, 'src/server.js': 'module.exports = {}\n' },
      })
      await expect(
        plugin._shouldBuildFunction({ entry: 'src/server.ts' }, 'entry', {
          isWebApp: true,
        }),
      ).resolves.toBe(true)
      await expect(
        plugin._shouldBuildFunction({ entry: 'src/server.js' }, 'entry', {
          isWebApp: true,
        }),
      ).resolves.toBe(false)
    })
  })

  describe('packaging', () => {
    test('zips the web app on its own with the built entry and the bootstrap', async () => {
      const { serverless, serviceDir, webApps } = await packageService()

      const zipPath = webAppZipPath(serviceDir, 'api')
      const entries = await zipEntries(zipPath)
      expect(entries).toEqual(
        expect.arrayContaining([BOOTSTRAP, 'package.json', 'src/server.js']),
      )
      // Neither the function's bundle nor its map ships with the web app.
      expect(entries).not.toContain('src/handler.js')
      expect(entries).not.toContain('src/handler.js.map')

      const bootstrap = await zipFile(zipPath, BOOTSTRAP)
      expect(bootstrap).toContain('"src/server.js"')

      expect(serverless.builtWebApps).toEqual(new Set(['api']))
      // Web apps are no functions, and their config is left as written.
      expect([...serverless.builtFunctions]).toEqual(['hello'])
      expect(webApps.api).toEqual({ entry: 'src/server.ts' })
    })

    test('the bootstrap starts the built entry with PORT and HOSTNAME set', async () => {
      const { serviceDir } = await packageService()
      const extracted = makeTempDir()
      const zip = await JsZip.loadAsync(
        fs.readFileSync(webAppZipPath(serviceDir, 'api')),
      )
      for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir) continue
        writeFiles(extracted, { [name]: await file.async('nodebuffer') })
      }

      const result = spawnSync(process.execPath, [BOOTSTRAP], {
        cwd: extracted,
        env: {
          PATH: process.env.PATH,
          AWS_LAMBDA_HTTP_ENDPOINT: '127.0.0.1:9000',
        },
        encoding: 'utf8',
      })

      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toEqual({
        port: '9000',
        host: '127.0.0.1',
        greeting: 'hi',
      })
    })

    test("names the built entry by outExtension { '.js': '.mjs' }", async () => {
      const { serviceDir } = await packageService({
        build: { esbuild: { format: 'esm', outExtension: { '.js': '.mjs' } } },
      })

      const zipPath = webAppZipPath(serviceDir, 'api')
      expect(await zipEntries(zipPath)).toContain('src/server.mjs')
      expect(await zipFile(zipPath, BOOTSTRAP)).toContain('"src/server.mjs"')
    })

    test('starts a bundled CommonJS entry as the main module', async () => {
      const { serviceDir } = await packageService({
        files: {
          ...SERVICE_FILES,
          'src/server.ts':
            "if (require.main === module) console.log('listening')\n",
        },
      })
      const zipPath = webAppZipPath(serviceDir, 'api')
      expect(await zipFile(zipPath, BOOTSTRAP)).toContain('Module.runMain()')

      // Loaded with import(), as the Web Functions runtime loads it
      const extracted = makeTempDir()
      const zip = await JsZip.loadAsync(fs.readFileSync(zipPath))
      for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir) continue
        writeFiles(extracted, { [name]: await file.async('nodebuffer') })
      }
      const runtimeDir = makeTempDir()
      const runtimePath = path.join(runtimeDir, 'index.mjs')
      fs.writeFileSync(
        runtimePath,
        `await import(${JSON.stringify(pathToFileURL(path.join(extracted, BOOTSTRAP)).href)})\n`,
      )
      const result = spawnSync(process.execPath, [runtimePath], {
        cwd: extracted,
        env: { PATH: process.env.PATH },
        encoding: 'utf8',
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe('listening')
    })

    test('imports an entry esbuild emits as an ES module', async () => {
      const { serviceDir } = await packageService({
        build: { esbuild: { format: 'esm', outExtension: { '.js': '.mjs' } } },
      })

      const bootstrap = await zipFile(
        webAppZipPath(serviceDir, 'api'),
        BOOTSTRAP,
      )
      expect(bootstrap).not.toContain('runMain')
      expect(bootstrap).toContain('await import(pathToFileURL(entry).href)')
    })

    test('two packages of the same service give byte-identical web app zips', async () => {
      const { serviceDir } = await packageService()
      const first = sha256(webAppZipPath(serviceDir, 'api'))

      await packageService({ serviceDir })

      expect(sha256(webAppZipPath(serviceDir, 'api'))).toBe(first)
    })

    test('sourcemap: true enables source maps in the bootstrap exactly as functions get them, never through NODE_OPTIONS', async () => {
      const { plugin, serviceDir, webApps, functions } = await packageService({
        build: { esbuild: { sourcemap: true } },
        webApps: { api: { entry: 'src/server.ts', environment: { A: 'b' } } },
      })

      const functionsGetSourceMaps = plugin._shouldSetNodeOptions(
        await plugin._buildProperties(),
      )
      expect(webApps.api.environment).toEqual({ A: 'b' })
      expect(functions.hello.environment?.NODE_OPTIONS).toBe(
        functionsGetSourceMaps ? '--enable-source-maps' : undefined,
      )
      const zipPath = webAppZipPath(serviceDir, 'api')
      expect(
        (await zipFile(zipPath, BOOTSTRAP)).includes(
          'process.setSourceMapsEnabled(true)',
        ),
      ).toBe(functionsGetSourceMaps)
      expect(await zipEntries(zipPath)).toContain('src/server.js.map')
    })

    test('sourcemap: false leaves source maps off in the bootstrap', async () => {
      const { serviceDir } = await packageService({
        build: { esbuild: { sourcemap: false } },
      })

      expect(
        await zipFile(webAppZipPath(serviceDir, 'api'), BOOTSTRAP),
      ).not.toContain('setSourceMapsEnabled')
    })

    test.each([
      [{ type: 'linked' }, false],
      [{ type: 'linked', setNodeOptions: true }, true],
      [{ type: 'linked', setNodeOptions: false }, false],
      [{ setNodeOptions: false }, false],
    ])(
      'sourcemap %j enables source maps in the bootstrap: %s, as for functions',
      async (sourcemap, enabled) => {
        const { serviceDir, functions } = await packageService({
          build: { esbuild: { sourcemap } },
        })

        expect(
          (await zipFile(webAppZipPath(serviceDir, 'api'), BOOTSTRAP)).includes(
            'process.setSourceMapsEnabled(true)',
          ),
        ).toBe(enabled)
        expect(functions.hello.environment?.NODE_OPTIONS).toBe(
          enabled ? '--enable-source-maps' : undefined,
        )
      },
    )

    test('names web apps as web apps when they share a file with a function', async () => {
      const warning = jest
        .spyOn(log.get('esbuild'), 'warning')
        .mockImplementation(() => {})
      try {
        // A nodejs16.x function keeps `aws-sdk` external, the web app's
        // nodejs24.x keeps `@aws-sdk/*`: one build, two external lists.
        await packageService({
          functions: {
            hello: { handler: 'src/server.handler', runtime: 'nodejs16.x' },
          },
        })
        const messages = warning.mock.calls.map(([message]) => message)
        expect(messages).toContainEqual(
          expect.stringMatching(
            /^Functions and web apps hello, webApps\.api share the handler file /,
          ),
        )
      } finally {
        warning.mockRestore()
      }
    })

    test('fails when package.patterns drop the built entry from its zip', async () => {
      const service = makeService({
        webApps: {
          api: {
            entry: 'src/server.ts',
            package: { patterns: ['!src/server.js'] },
          },
        },
      })

      const zipPath = webAppZipPath(service.serviceDir, 'api')
      await expect(service.plugin.hooks[PACKAGE_HOOK]()).rejects.toMatchObject({
        code: 'ESBUILD_WEB_APP_ENTRY_MISSING_FROM_ARTIFACT',
        stack: undefined,
        message: `The built entry for webApps.api ("src/server.js") is missing from ${zipPath}. Check package.patterns for this web app.`,
      })
    })

    test('leaves the function artifact exactly as without web apps', async () => {
      // One service directory for both runs: esbuild writes paths relative to
      // the working directory into the bundle, so only the same directory can
      // give the same bytes.
      const serviceDir = makeTempDir()
      const functionZip = path.join(serviceDir, '.serverless', 'my-service.zip')

      const without = await packageService({ webApps: null, serviceDir })
      const entriesWithout = await zipEntries(functionZip)
      const hashWithout = sha256(functionZip)
      expect(without.serverless.builtWebApps).toBeUndefined()

      const withWebApps = await packageService({ serviceDir })
      expect(await zipEntries(functionZip)).toEqual(entriesWithout)
      expect(sha256(functionZip)).toBe(hashWithout)
      expect(withWebApps.serverless.service.package.artifact).toBe(functionZip)
    })

    test('with package.individually, function zips carry no web app output', async () => {
      const { serviceDir, functions } = await packageService({
        servicePackage: { individually: true },
      })

      const functionZip = path.join(
        serviceDir,
        '.serverless',
        'my-service-hello.zip',
      )
      expect(functions.hello.package.artifact).toBe(functionZip)
      const functionEntries = await zipEntries(functionZip)
      expect(functionEntries).toContain('src/handler.js')
      expect(functionEntries).not.toContain('src/server.js')
      expect(await zipEntries(webAppZipPath(serviceDir, 'api'))).toContain(
        'src/server.js',
      )
    })

    test("applies the web app's package.patterns after the service's", async () => {
      const { serviceDir } = await packageService({
        files: { ...SERVICE_FILES, 'public/index.html': '<p>hi</p>\n' },
        webApps: {
          api: { entry: 'src/server.ts', package: { patterns: ['public/**'] } },
        },
      })

      expect(await zipEntries(webAppZipPath(serviceDir, 'api'))).toContain(
        'public/index.html',
      )
      expect(
        await zipEntries(
          path.join(serviceDir, '.serverless', 'my-service.zip'),
        ),
      ).not.toContain('public/index.html')
    })

    test('takes the externals of the runtime it inherits from provider.runtime', async () => {
      const service = makeService({
        functions: {},
        provider: { runtime: 'nodejs26.x' },
      })
      const externals = jest.spyOn(service.plugin, '_externals')
      await service.plugin.hooks[PACKAGE_HOOK]()

      expect(externals).toHaveBeenCalledWith('nodejs26.x')
      expect(externals).not.toHaveBeenCalledWith('nodejs24.x')
    })

    test("takes the externals of the web app's own runtime over provider.runtime", async () => {
      const service = makeService({
        functions: {},
        provider: { runtime: 'nodejs26.x' },
        webApps: { api: { entry: 'src/server.ts', runtime: 'nodejs24.x' } },
      })
      const externals = jest.spyOn(service.plugin, '_externals')
      await service.plugin.hooks[PACKAGE_HOOK]()

      expect(externals).toHaveBeenCalledWith('nodejs24.x')
    })

    test('builds a service whose only compute is a web app', async () => {
      const { serverless, serviceDir } = await packageService({
        functions: {},
        provider: { runtime: 'python3.12' },
      })

      expect(await zipEntries(webAppZipPath(serviceDir, 'api'))).toContain(
        'src/server.js',
      )
      expect(serverless.builtWebApps).toEqual(new Set(['api']))
      expect(serverless.service.package.artifact).toBeUndefined()
      expect(
        fs.existsSync(path.join(serviceDir, '.serverless', 'my-service.zip')),
      ).toBe(false)
    })

    test('leaves a web app with build: false to classic packaging', async () => {
      const { serverless, serviceDir } = await packageService({
        webApps: { api: { entry: 'src/server.ts', build: false } },
      })

      expect(fs.existsSync(webAppZipPath(serviceDir, 'api'))).toBe(false)
      expect(serverless.builtWebApps).toBeUndefined()
    })

    test('compiles the entry with bundle: false', async () => {
      const { serviceDir } = await packageService({
        build: { esbuild: { bundle: false } },
      })

      const zipPath = webAppZipPath(serviceDir, 'api')
      expect(await zipEntries(zipPath)).toEqual(
        expect.arrayContaining([BOOTSTRAP, 'src/greeting.js', 'src/server.js']),
      )
      expect(await zipFile(zipPath, BOOTSTRAP)).toContain('"src/server.js"')
    })

    test('with bundle: false, the entry format follows the nearest package.json type', async () => {
      const commonjs = await packageService({
        build: { esbuild: { bundle: false } },
      })
      expect(
        await zipFile(webAppZipPath(commonjs.serviceDir, 'api'), BOOTSTRAP),
      ).toContain('Module.runMain()')

      const esm = await packageService({
        build: { esbuild: { bundle: false } },
        files: {
          ...SERVICE_FILES,
          'src/package.json': '{"type":"module"}\n',
        },
      })
      expect(
        await zipFile(webAppZipPath(esm.serviceDir, 'api'), BOOTSTRAP),
      ).not.toContain('runMain')
    })

    test('fails when a selected entry cannot be built', async () => {
      const service = makeService({
        build: { esbuild: { bundle: true } },
        webApps: { api: { entry: 'src/missing.js' } },
      })

      await expect(service.plugin.hooks[PACKAGE_HOOK]()).rejects.toMatchObject({
        code: 'WEB_APPS_ENTRY_NOT_FOUND',
        stack: undefined,
        message:
          'webApps.api.entry "src/missing.js" is not among the files built for this web app. Check the path.',
      })
    })

    test('a deploy-function build leaves web apps out', async () => {
      const { plugin, serverless, serviceDir } = makeService()
      plugin.options.function = 'hello'

      await plugin.hooks['before:deploy:function:packageFunction']()

      expect(fs.existsSync(webAppZipPath(serviceDir, 'api'))).toBe(false)
      expect(serverless.builtWebApps).toBeUndefined()
      expect(
        fs.existsSync(
          path.join(serviceDir, '.serverless', 'build', 'src', 'server.js'),
        ),
      ).toBe(false)
    })
  })
})
