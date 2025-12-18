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

const { default: Package } = await import(
  '../../../../../../lib/plugins/package/package.js'
)
const { default: Serverless } = await import(
  '../../../../../../lib/serverless.js'
)

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
