import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import readConfiguration from '@serverless/framework/lib/configuration/read.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const tmpDir = path.join(__dirname, 'tmp-read-config')

describe('Configuration Read', () => {
  let configurationPath

  beforeAll(async () => {
    await fs.ensureDir(tmpDir)
    await fs.writeJson(path.join(tmpDir, 'package.json'), { type: 'commonjs' })
  })

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  afterEach(async () => {
    if (configurationPath && (await fs.pathExists(configurationPath))) {
      await fs.unlink(configurationPath)
    }
    configurationPath = null
  })

  it('should read "serverless.yml"', async () => {
    configurationPath = path.join(tmpDir, 'serverless.yml')
    await fs.writeFile(
      configurationPath,
      'service: test-yml\nprovider:\n  name: aws\n',
    )
    expect(await readConfiguration(configurationPath)).toEqual({
      service: 'test-yml',
      provider: { name: 'aws' },
    })
  })

  it('should read "serverless.yaml"', async () => {
    configurationPath = path.join(tmpDir, 'serverless.yaml')
    await fs.writeFile(
      configurationPath,
      'service: test-yaml\nprovider:\n  name: aws\n',
    )
    expect(await readConfiguration(configurationPath)).toEqual({
      service: 'test-yaml',
      provider: { name: 'aws' },
    })
  })

  it('should support AWS CloudFormation shortcut syntax', async () => {
    configurationPath = path.join(tmpDir, 'serverless.yml')
    await fs.writeFile(
      configurationPath,
      'service: test-cf-shortcut\nprovider:\n  name: aws\n  cfProperty: !GetAtt MyResource.Arn',
    )
    expect(await readConfiguration(configurationPath)).toEqual({
      service: 'test-cf-shortcut',
      provider: {
        name: 'aws',
        cfProperty: { 'Fn::GetAtt': ['MyResource', 'Arn'] },
      },
    })
  })

  it('should read "serverless.json"', async () => {
    configurationPath = path.join(tmpDir, 'serverless.json')
    const configuration = {
      service: 'test-json',
      provider: { name: 'aws' },
    }
    await fs.writeFile(configurationPath, JSON.stringify(configuration))
    expect(await readConfiguration(configurationPath)).toEqual(configuration)
  })

  it('should read "serverless.js"', async () => {
    configurationPath = path.join(tmpDir, 'serverless.js')
    const configuration = {
      service: 'test-js',
      provider: { name: 'aws' },
    }
    await fs.writeFile(
      configurationPath,
      `module.exports = ${JSON.stringify(configuration)}`,
    )
    expect(await readConfiguration(configurationPath)).toEqual(configuration)
  })

  it('should read "serverless.cjs"', async () => {
    configurationPath = path.join(tmpDir, 'serverless.cjs')
    const configuration = {
      service: 'test-js',
      provider: { name: 'aws' },
    }
    await fs.writeFile(
      configurationPath,
      `module.exports = ${JSON.stringify(configuration)}`,
    )
    expect(await readConfiguration(configurationPath)).toEqual(configuration)
  })

  // .mjs support heavily depends on environment, skipping strict check for now or try basics
  it('should read "serverless.mjs"', async () => {
    configurationPath = path.join(tmpDir, 'serverless.mjs')
    const configuration = {
      service: 'test-js',
      provider: { name: 'aws' },
    }
    await fs.writeFile(
      configurationPath,
      `export default ${JSON.stringify(configuration)}`,
    )
    expect(await readConfiguration(configurationPath)).toEqual(configuration)
  })

  // Note: TypeScript (.ts) configuration file support
  // The sf-core/serverless package uses tsx instead of ts-node for TypeScript support.
  // Testing .ts config loading in unit tests is complex because tsx's require function
  // uses module resolution that doesn't work well with dynamically created temp files.
  // TypeScript configuration loading is implicitly tested through integration tests
  // that use actual .ts config files in fixture directories.
  // The v3 ts-node tests (register only if not registered, reject if ts-node not found)
  // are not applicable here as the implementation uses tsx which handles this differently.

  it('should support deferred configuration result', async () => {
    configurationPath = path.join(tmpDir, 'serverless-deferred.js')
    const configuration = {
      service: 'test-deferred',
      provider: { name: 'aws' },
    }
    await fs.writeFile(
      configurationPath,
      `module.exports = Promise.resolve(${JSON.stringify(configuration)})`,
    )
    expect(await readConfiguration(configurationPath)).toEqual(configuration)
  })

  it('should reject not existing file', async () => {
    await expect(
      readConfiguration(path.join(tmpDir, 'not-existing.yml')),
    ).rejects.toHaveProperty('code', 'CONFIGURATION_NOT_FOUND')
  })

  it('should reject unknown type', async () => {
    configurationPath = path.join(tmpDir, 'serverless.foo')
    await fs.ensureFile(configurationPath)
    await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
      'code',
      'UNSUPPORTED_CONFIGURATION_TYPE',
    )
  })

  it('should reject YAML syntax error', async () => {
    configurationPath = path.join(tmpDir, 'serverless.yaml')
    await fs.writeFile(
      configurationPath,
      'service: test-yaml\np [\nr\novider:\n  name: aws\n',
    )
    await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
      'code',
      'CONFIGURATION_PARSE_ERROR',
    )
  })

  it('should reject JSON syntax error', async () => {
    configurationPath = path.join(tmpDir, 'serverless.json')
    await fs.writeFile(configurationPath, '{foom,sdfs}')
    await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
      'code',
      'CONFIGURATION_PARSE_ERROR',
    )
  })

  it('should reject JS initialization error', async () => {
    configurationPath = path.join(tmpDir, 'serverless-errored.js')
    await fs.writeFile(configurationPath, 'throw new Error("Stop!")')
    await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
      'code',
      'CONFIGURATION_INITIALIZATION_ERROR',
    )
  })

  it('should reject non object configuration', async () => {
    configurationPath = path.join(tmpDir, 'serverless.json')
    await fs.writeFile(configurationPath, JSON.stringify([]))
    await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
      'code',
      'INVALID_CONFIGURATION_EXPORT',
    )
  })

  it('should reject non JSON like structures', async () => {
    configurationPath = path.join(tmpDir, 'serverless-custom.js')
    await fs.writeFile(configurationPath, 'exports.foo = exports')
    await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
      'code',
      'INVALID_CONFIGURATION_STRUCTURE',
    )
  })

  describe('TOML', () => {
    it('should read "serverless.toml"', async () => {
      configurationPath = path.join(tmpDir, 'serverless.toml')
      await fs.writeFile(
        configurationPath,
        [
          'service = "test-toml"',
          'frameworkVersion = "4"',
          '',
          '[provider]',
          'name = "aws"',
          'runtime = "nodejs22.x"',
          'memorySize = 512',
          '',
          '[functions.hello]',
          'handler = "handler.hello"',
          'events = [{ httpApi = "GET /hello" }]',
          '',
          '[functions.hello.environment]',
          'STAGE = "dev"',
          '',
          '[[functions.hello.layers]]',
          'Ref = "MyLayer"',
        ].join('\n'),
      )
      expect(await readConfiguration(configurationPath)).toEqual({
        service: 'test-toml',
        frameworkVersion: '4',
        provider: { name: 'aws', runtime: 'nodejs22.x', memorySize: 512 },
        functions: {
          hello: {
            handler: 'handler.hello',
            events: [{ httpApi: 'GET /hello' }],
            environment: { STAGE: 'dev' },
            layers: [{ Ref: 'MyLayer' }],
          },
        },
      })
    })

    it('should map every TOML value type the way the rest of the reader expects', async () => {
      // Contract for the TOML -> JSON normalization users' configurations rely on.
      configurationPath = path.join(tmpDir, 'serverless.toml')
      await fs.writeFile(
        configurationPath,
        [
          'service = "test-toml-types"',
          'basic = "tab\\there \\u00e9"',
          "literal = 'C:\\path\\raw'",
          'multiline = """',
          'first',
          'second"""',
          'integer = 42',
          'negative = -7',
          'underscored = 1_000',
          'hex = 0xff',
          'float = 3.5',
          'exponent = 1e3',
          'boolean = true',
          'offsetDateTime = 1979-05-27T07:32:00Z',
          'offsetDateTimeWithZone = 1979-05-27T00:32:00-07:00',
          'localDateTime = 1979-05-27T07:32:00',
          'localDate = 1979-05-27',
          'localTime = 07:32:00',
          'array = [1, 2, 3]',
          'mixedArray = ["a", 1, true]',
          'nestedArray = [[1, 2], ["x"]]',
          'inline = { a = 1, b = "two" }',
          'dotted.key.path = "dotted"',
          '"quoted key" = 1',
          '',
          '[table]',
          'x = 1',
          '',
          '[[arrayOfTables]]',
          'n = 1',
          '',
          '[[arrayOfTables]]',
          'n = 2',
        ].join('\n'),
      )
      expect(await readConfiguration(configurationPath)).toEqual({
        service: 'test-toml-types',
        basic: 'tab\there é',
        literal: 'C:\\path\\raw',
        multiline: 'first\nsecond',
        integer: 42,
        negative: -7,
        underscored: 1000,
        hex: 255,
        float: 3.5,
        exponent: 1000,
        boolean: true,
        offsetDateTime: '1979-05-27T07:32:00.000Z',
        offsetDateTimeWithZone: '1979-05-27T07:32:00.000Z',
        localDateTime: '1979-05-27T07:32:00',
        localDate: '1979-05-27',
        localTime: '07:32:00',
        array: [1, 2, 3],
        mixedArray: ['a', 1, true],
        nestedArray: [[1, 2], ['x']],
        inline: { a: 1, b: 'two' },
        dotted: { key: { path: 'dotted' } },
        'quoted key': 1,
        table: { x: 1 },
        arrayOfTables: [{ n: 1 }, { n: 2 }],
      })
    })

    it('should reject TOML syntax error', async () => {
      configurationPath = path.join(tmpDir, 'serverless.toml')
      await fs.writeFile(
        configurationPath,
        'service = "x"\n[provider\nname = "aws"\n',
      )
      await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
        'code',
        'CONFIGURATION_PARSE_ERROR',
      )
    })

    it('should not pollute Object.prototype through a table path routed via a scalar', async () => {
      // Regression guard for GHSA-v5mp-jgw5-2x6j
      configurationPath = path.join(tmpDir, 'serverless.toml')
      await fs.writeFile(
        configurationPath,
        [
          'service = "test-toml"',
          '[a.b]',
          'y = 1',
          '[a.b.y.__proto__.__proto__]',
          'polluted = "yes"',
        ].join('\n'),
      )
      try {
        await expect(
          readConfiguration(configurationPath),
        ).rejects.toHaveProperty('code', 'CONFIGURATION_PARSE_ERROR')
        expect({}).not.toHaveProperty('polluted')
        expect(Object.prototype).not.toHaveProperty('polluted')
      } finally {
        delete Object.prototype.polluted
      }
    })

    it('should reject deeply nested TOML values with a parse error instead of overflowing the stack', async () => {
      // Regression guard for GHSA-82x6-q7mm-w9cf
      configurationPath = path.join(tmpDir, 'serverless.toml')
      const depth = 20000
      await fs.writeFile(
        configurationPath,
        `service = "test-toml"\nnested = ${'['.repeat(depth)}${']'.repeat(depth)}\n`,
      )
      const error = await readConfiguration(configurationPath).catch((e) => e)
      expect(error).toHaveProperty('code', 'CONFIGURATION_PARSE_ERROR')
      expect(error.message).not.toMatch(/call stack/i)
    })

    it('should keep safe integers and reject integers beyond Number.MAX_SAFE_INTEGER', async () => {
      // Values between 2^53 and 2^63 are valid TOML but cannot be represented losslessly
      // as a JavaScript number; the reader surfaces them as a parse error rather than rounding.
      configurationPath = path.join(tmpDir, 'serverless.toml')
      await fs.writeFile(
        configurationPath,
        'service = "test-toml"\nsafe = 9007199254740991\n',
      )
      expect(await readConfiguration(configurationPath)).toEqual({
        service: 'test-toml',
        safe: 9007199254740991,
      })

      await fs.writeFile(
        configurationPath,
        'service = "test-toml"\nunsafe = 9007199254740992\n',
      )
      await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
        'code',
        'CONFIGURATION_PARSE_ERROR',
      )
    })

    it('should reject integers outside the 64-bit range instead of silently rounding them', async () => {
      configurationPath = path.join(tmpDir, 'serverless.toml')
      await fs.writeFile(
        configurationPath,
        'service = "test-toml"\nbig = 99999999999999999999\n',
      )
      await expect(readConfiguration(configurationPath)).rejects.toHaveProperty(
        'code',
        'CONFIGURATION_PARSE_ERROR',
      )
    })
  })
})
