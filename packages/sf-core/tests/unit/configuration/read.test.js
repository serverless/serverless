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
})
