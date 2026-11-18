import {
  jest,
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals'
import os from 'os'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import JsZip from 'jszip'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
    notice: jest.fn(),
    info: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: {},
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
  getOrCreateGlobalDeploymentBucket: jest.fn(),
}))

const { default: Package } =
  await import('../../../../../../lib/plugins/package/package.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { getWebAppsToPackage } =
  await import('../../../../../../lib/plugins/package/lib/package-service.js')
const { generateBootstrap } =
  await import('../../../../../../lib/plugins/aws/web-apps/packaging/bootstrap.js')
const { BOOTSTRAP_FILE } =
  await import('../../../../../../lib/plugins/aws/web-apps/constants.js')

describe('packageService', () => {
  let tmpDirPath
  let serverless
  let packagePlugin

  function getTmpDirPath() {
    return path.join(
      os.tmpdir(),
      'serverless-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).slice(2),
    )
  }

  beforeEach(() => {
    tmpDirPath = getTmpDirPath()
    fs.mkdirSync(tmpDirPath, { recursive: true })
    serverless = new Serverless({ commands: [], options: {} })
    serverless.service.service = 'test-service'
    serverless.serviceDir = tmpDirPath
    serverless.config = { serviceDir: tmpDirPath }
    serverless.pluginManager = {
      parsePluginsObject: jest.fn(() => ({})),
    }
    serverless.utils = {
      writeFileSync: (filePath, content) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content)
      },
      writeFileDir: (filePath) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
      },
    }
    packagePlugin = new Package(serverless, {})
  })

  afterEach(async () => {
    try {
      await fsp.rm(tmpDirPath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('#getIncludes()', () => {
    it('should merge package.include with function includes', () => {
      serverless.service.package.include = ['src/**']
      const result = packagePlugin.getIncludes(['lib/**'])
      expect(result).toContain('src/**')
      expect(result).toContain('lib/**')
    })

    it('should merge package.patterns with function includes', () => {
      serverless.service.package.patterns = ['!node_modules/**', 'dist/**']
      const result = packagePlugin.getIncludes(['handler.js'])
      expect(result).toContain('!node_modules/**')
      expect(result).toContain('dist/**')
      expect(result).toContain('handler.js')
    })

    it('should return empty array if no includes defined', () => {
      const result = packagePlugin.getIncludes([])
      expect(result).toEqual([])
    })
  })

  describe('#getExcludes()', () => {
    it('should include default excludes', () => {
      const result = packagePlugin.getExcludes([], false)
      expect(result).toContain('.git/**')
      expect(result).toContain('.gitignore')
      expect(result).toContain('.DS_Store')
      expect(result).toContain('.serverless/**')
    })

    it('should merge package.exclude with function excludes', () => {
      serverless.service.package.exclude = ['tests/**']
      const result = packagePlugin.getExcludes(['coverage/**'], false)
      expect(result).toContain('tests/**')
      expect(result).toContain('coverage/**')
    })

    it('should exclude serverless config file', () => {
      serverless.configurationFilename = 'serverless.yml'
      const result = packagePlugin.getExcludes([], false)
      expect(result).toContain('serverless.yml')
    })

    it('should exclude .env files when useDotenv is true', () => {
      serverless.configurationInput = { useDotenv: true }
      const result = packagePlugin.getExcludes([], false)
      expect(result).toContain('.env*')
    })

    it('should not exclude .env files when useDotenv is false', () => {
      serverless.configurationInput = { useDotenv: false }
      const result = packagePlugin.getExcludes([], false)
      expect(result).not.toContain('.env*')
    })

    it('should exclude layer paths when excludeLayers is true', () => {
      serverless.service.layers = {
        myLayer: { path: 'layer' },
      }
      const result = packagePlugin.getExcludes([], true)
      expect(result).toContain('layer/**')
    })
  })

  describe('#getRuntime()', () => {
    it('should return the provided runtime', () => {
      const result = packagePlugin.getRuntime('python3.9')
      expect(result).toBe('python3.9')
    })

    it('should return provider runtime if no runtime provided', () => {
      serverless.service.provider.runtime = 'nodejs18.x'
      const result = packagePlugin.getRuntime(undefined)
      expect(result).toBe('nodejs18.x')
    })

    it('should return default runtime if no runtime defined', () => {
      const result = packagePlugin.getRuntime(undefined)
      expect(result).toBe('nodejs20.x')
    })
  })

  describe('#packageFunction()', () => {
    beforeEach(() => {
      // Create test files
      serverless.utils.writeFileSync(
        path.join(tmpDirPath, 'handler.js'),
        'module.exports.handler = () => {}',
      )
    })

    it('should return null for functions with image', async () => {
      serverless.service.functions = {
        myFunc: {
          image: 'my-image:latest',
        },
      }
      const result = await packagePlugin.packageFunction('myFunc')
      expect(result).toBeNull()
    })

    it('should use function artifact if provided', async () => {
      const artifactPath = path.join(tmpDirPath, 'my-artifact.zip')
      fs.writeFileSync(artifactPath, 'fake zip content')

      serverless.service.functions = {
        myFunc: {
          handler: 'handler.handler',
          package: {
            artifact: 'my-artifact.zip',
          },
        },
      }

      const result = await packagePlugin.packageFunction('myFunc')
      expect(result).toBe(artifactPath)
    })

    it('should use service artifact if function not individually packaged', async () => {
      const artifactPath = path.join(tmpDirPath, 'service-artifact.zip')
      fs.writeFileSync(artifactPath, 'fake zip content')

      serverless.service.package.artifact = 'service-artifact.zip'
      serverless.service.functions = {
        myFunc: {
          handler: 'handler.handler',
        },
      }

      const result = await packagePlugin.packageFunction('myFunc')
      expect(result).toBe(artifactPath)
    })
  })

  describe('#packageLayer()', () => {
    it('should package a layer', async () => {
      const layerPath = path.join(tmpDirPath, 'layer')
      fs.mkdirSync(layerPath, { recursive: true })
      fs.writeFileSync(path.join(layerPath, 'lib.js'), 'exports.foo = 1')

      serverless.service.layers = {
        myLayer: {
          path: 'layer',
          name: 'my-layer',
        },
      }

      const result = await packagePlugin.packageLayer('myLayer')
      expect(result).toContain('myLayer.zip')
    })
  })

  describe('#resolveFilePathsLayer() - service dev dependencies', () => {
    // Spawns real `npm ls` processes; on the standard Windows CI runner a
    // single test can take over a minute.
    jest.setTimeout(180_000)

    let serviceDir

    beforeEach(() => {
      // `npm ls` reports realpaths (macOS tmpdir is behind a symlink)
      serviceDir = fs.realpathSync(tmpDirPath)
      serverless.serviceDir = serviceDir
    })

    function writePackage(dir, contents) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(contents))
    }

    async function resolveLayerFiles(layerName) {
      return (await packagePlugin.resolveFilePathsLayer(layerName))
        .map((filePath) => filePath.replace(/\\/g, '/'))
        .sort()
    }

    it('does not exclude same-named packages from a layer directory', async () => {
      // The service lists "shared-pkg" as a devDependency, while the layer
      // ships its own copy as a production dependency
      writePackage(serviceDir, {
        name: 'service',
        version: '1.0.0',
        devDependencies: { 'shared-pkg': '1.0.0' },
      })
      writePackage(path.join(serviceDir, 'node_modules', 'shared-pkg'), {
        name: 'shared-pkg',
        version: '1.0.0',
      })
      const layerDir = path.join(serviceDir, 'layer')
      writePackage(layerDir, {
        name: 'layer',
        version: '1.0.0',
        dependencies: { 'shared-pkg': '1.0.0' },
        devDependencies: { 'layer-dev-pkg': '1.0.0' },
      })
      writePackage(path.join(layerDir, 'node_modules', 'shared-pkg'), {
        name: 'shared-pkg',
        version: '1.0.0',
      })
      writePackage(path.join(layerDir, 'node_modules', 'layer-dev-pkg'), {
        name: 'layer-dev-pkg',
        version: '1.0.0',
      })

      serverless.service.layers = {
        myLayer: { path: 'layer', package: { patterns: ['node_modules/**'] } },
      }

      const filePaths = await resolveLayerFiles('myLayer')

      expect(filePaths).toContain('node_modules/shared-pkg/package.json')
      // A layer is packaged as it is on disk, including its own dev dependencies
      expect(filePaths).toContain('node_modules/layer-dev-pkg/package.json')
    })

    it('excludes dev dependencies from a layer at the service directory', async () => {
      writePackage(serviceDir, {
        name: 'service',
        version: '1.0.0',
        devDependencies: { 'dev-pkg': '1.0.0' },
      })
      writePackage(path.join(serviceDir, 'node_modules', 'dev-pkg'), {
        name: 'dev-pkg',
        version: '1.0.0',
      })

      serverless.service.layers = { myLayer: { path: '.' } }

      const filePaths = await resolveLayerFiles('myLayer')

      expect(filePaths).toContain('package.json')
      expect(filePaths).not.toContain('node_modules/dev-pkg/package.json')
    })
  })

  describe('web apps', () => {
    // Spawns real `npm ls` processes for dev dependency exclusion
    jest.setTimeout(180_000)

    let serviceDir

    beforeEach(() => {
      // `npm ls` reports realpaths (macOS tmpdir is behind a symlink)
      serviceDir = fs.realpathSync(tmpDirPath)
      serverless.serviceDir = serviceDir
    })

    function writeFile(relativePath, content) {
      serverless.utils.writeFileSync(
        path.join(serviceDir, relativePath),
        content,
      )
    }

    function setWebApps(webApps) {
      serverless.configurationInput = {
        ...serverless.configurationInput,
        webApps,
      }
    }

    async function readZip(artifactPath) {
      const zip = await new JsZip().loadAsync(fs.readFileSync(artifactPath))
      return zip.files
    }

    describe('getWebAppsToPackage()', () => {
      it('returns nothing for a service without web apps', () => {
        expect(getWebAppsToPackage(serverless)).toEqual([])
      })

      it('skips web apps with package.artifact and web apps esbuild built', () => {
        setWebApps({
          api: { entry: 'src/server.js' },
          prebuilt: { entry: 'server.js', package: { artifact: 'site.zip' } },
          bundled: { entry: 'src/bundled.ts' },
        })
        serverless.builtWebApps = new Set(['bundled'])

        expect(getWebAppsToPackage(serverless)).toEqual(['api'])
      })
    })

    describe('#packageWebApp()', () => {
      it('zips the service without dev dependencies and adds the bootstrap', async () => {
        writeFile(
          'package.json',
          JSON.stringify({
            name: 'web-service',
            version: '1.0.0',
            devDependencies: { 'dev-only': '1.0.0' },
          }),
        )
        writeFile(
          'node_modules/dev-only/package.json',
          JSON.stringify({ name: 'dev-only', version: '1.0.0' }),
        )
        writeFile('src/server.js', 'require("http").createServer().listen()')
        setWebApps({ api: { entry: './src/server.js' } })

        const artifactPath = await packagePlugin.packageWebApp('api')

        expect(artifactPath).toBe(
          path.join(serviceDir, '.serverless', 'webapps', 'api.zip'),
        )
        const files = await readZip(artifactPath)
        expect(Object.keys(files).sort()).toEqual([
          BOOTSTRAP_FILE,
          'package.json',
          'src/server.js',
        ])
        expect(await files[BOOTSTRAP_FILE].async('string')).toBe(
          generateBootstrap({
            entryPath: 'src/server.js',
            entryFormat: 'cjs',
            enableSourceMaps: false,
          }),
        )
      })

      it.each([
        ['a .cjs entry', 'src/server.cjs', {}, 'cjs'],
        ['a .mjs entry', 'src/server.mjs', {}, 'esm'],
        [
          'a .cts entry under "type": "module"',
          'src/server.cts',
          { 'package.json': '{"type":"module"}' },
          'cjs',
        ],
        [
          'a .mts entry under "type": "commonjs"',
          'src/server.mts',
          { 'package.json': '{"type":"commonjs"}' },
          'esm',
          'const port: number = 3000\nconsole.log(port)\n',
        ],
        [
          'a .js entry written as CommonJS without a package.json type',
          'src/server.js',
          {},
          'cjs',
        ],
        [
          'a .js entry written as an ES module without a package.json type',
          'src/server.js',
          {},
          'esm',
          "import http from 'node:http'\nexport default http.createServer()\n",
        ],
        [
          'a .js entry using import.meta without a package.json type',
          'src/server.js',
          {},
          'esm',
          'console.log(import.meta.url)\n',
        ],
        [
          'a .js entry whose only ES module syntax is top-level await',
          'src/server.js',
          {},
          'esm',
          'const config = await Promise.resolve({ port: 3000 })\nconsole.log(config)\n',
        ],
        [
          'a .js entry written as an ES module under "type": "commonjs"',
          'src/server.js',
          { 'package.json': '{"type":"commonjs"}' },
          'cjs',
          "import http from 'node:http'\n",
        ],
        [
          'a .js entry under "type": "module"',
          'src/server.js',
          { 'package.json': '{"type":"module"}' },
          'esm',
        ],
        [
          'a .js entry whose nearest package.json is CommonJS',
          'src/server.js',
          {
            'package.json': '{"type":"module"}',
            'src/package.json': '{"type":"commonjs"}',
          },
          'cjs',
        ],
      ])(
        'starts %s in the format Node loads it with',
        async (
          _title,
          entry,
          files,
          entryFormat,
          source = "require('node:http').createServer()\n",
        ) => {
          for (const [file, content] of Object.entries(files)) {
            writeFile(file, content)
          }
          writeFile(entry, source)
          setWebApps({ api: { entry } })

          const zipFiles = await readZip(
            await packagePlugin.packageWebApp('api'),
          )

          expect(await zipFiles[BOOTSTRAP_FILE].async('string')).toBe(
            generateBootstrap({
              entryPath: entry,
              entryFormat,
              enableSourceMaps: false,
            }),
          )
        },
      )

      it('selects prebuilt output with entry package patterns', async () => {
        writeFile('.next/standalone/server.js', 'server')
        writeFile('.next/standalone/.next/static/app.js', 'static')
        writeFile('.next/cache/entry', 'cache')
        writeFile('src/page.tsx', 'page')
        serverless.service.package.patterns = ['src/**']
        setWebApps({
          site: {
            entry: '.next/standalone/server.js',
            build: false,
            package: { patterns: ['!**', '.next/standalone/**'] },
          },
        })

        const files = await readZip(await packagePlugin.packageWebApp('site'))

        expect(Object.keys(files).sort()).toEqual([
          '.next/standalone/.next/static/app.js',
          '.next/standalone/server.js',
          BOOTSTRAP_FILE,
        ])
      })

      it('rejects an entry that is not among the packaged files', async () => {
        writeFile('src/server.js', 'server')
        setWebApps({ api: { entry: 'src/server.handler' } })

        await expect(packagePlugin.packageWebApp('api')).rejects.toMatchObject({
          message:
            'webApps.api.entry "src/server.handler" is not among the files packaged for this web app. Check the path and package.patterns.',
          code: 'WEB_APPS_ENTRY_NOT_FOUND',
          stack: undefined,
        })
      })
    })

    describe('#packageService()', () => {
      it('packages only the web apps that need it', async () => {
        writeFile('src/server.js', 'server')
        setWebApps({
          api: { entry: 'src/server.js' },
          prebuilt: { entry: 'server.js', package: { artifact: 'site.zip' } },
          bundled: { entry: 'src/bundled.ts' },
        })
        serverless.builtWebApps = new Set(['bundled'])
        const packageWebApp = jest.spyOn(packagePlugin, 'packageWebApp')

        await packagePlugin.packageService()

        expect(packageWebApp.mock.calls).toEqual([['api']])
        expect(
          fs.existsSync(
            path.join(serviceDir, '.serverless', 'webapps', 'api.zip'),
          ),
        ).toBe(true)
      })

      it('packages no web app for a service without web apps', async () => {
        const packageWebApp = jest.spyOn(packagePlugin, 'packageWebApp')

        await packagePlugin.packageService()

        expect(packageWebApp).not.toHaveBeenCalled()
      })
    })
  })

  describe('defaultExcludes', () => {
    it('should have expected default excludes', () => {
      expect(packagePlugin.defaultExcludes).toContain('.git/**')
      expect(packagePlugin.defaultExcludes).toContain('.gitignore')
      expect(packagePlugin.defaultExcludes).toContain('.DS_Store')
      expect(packagePlugin.defaultExcludes).toContain('npm-debug.log')
      expect(packagePlugin.defaultExcludes).toContain('.serverless/**')
      expect(packagePlugin.defaultExcludes).toContain('.serverless_plugins/**')
    })
  })
})
