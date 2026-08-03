import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    warning: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn() })),
  },
}))

const checkForChangesMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/check-for-changes.js')
).default
const normalizeFiles = (
  await import('../../../../../../../lib/plugins/aws/lib/normalize-files.js')
).default

const sha256 = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('base64')

describe('checkIfDeploymentIsNecessary with per-function artifacts', () => {
  let tempDir
  let serverlessDir
  let template
  let stateObject
  let functionZipPath

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'check-for-changes-per-function-'),
    )
    serverlessDir = path.join(tempDir, '.serverless')
    fs.mkdirSync(serverlessDir)

    // Per-function artifact points outside .serverless/ (e.g. a pre-built zip
    // referenced via `package.artifact` on the function).
    functionZipPath = path.join(tempDir, 'artifacts', 'lambda', 'fn.zip')
    fs.mkdirSync(path.dirname(functionZipPath), { recursive: true })
    fs.writeFileSync(functionZipPath, 'function artifact bytes')

    template = { Resources: { Foo: { Type: 'AWS::Lambda::Function' } } }
    stateObject = {
      service: { service: 'my-service', provider: {} },
      package: {},
    }
    fs.writeFileSync(
      path.join(serverlessDir, 'serverless-state.json'),
      JSON.stringify(stateObject),
    )
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const buildCtx = ({ functionArtifact, hasImageFunction = false }) => ({
    ...checkForChangesMixin,
    provider: {
      naming: { getServiceStateFileName: () => 'serverless-state.json' },
    },
    serverless: {
      serviceDir: tempDir,
      service: {
        package: {},
        provider: { compiledCloudFormationTemplate: template },
        getAllFunctions: () => ['fn'],
        getAllLayers: () => [],
        getFunction: (name) =>
          name === 'fn'
            ? {
                package: functionArtifact ? { artifact: functionArtifact } : {},
                ...(hasImageFunction ? { image: 'image:tag' } : {}),
              }
            : {},
      },
    },
  })

  it('deploys when a per-function artifact outside .serverless changed', async () => {
    const ctx = buildCtx({ functionArtifact: 'artifacts/lambda/fn.zip' })
    ctx.serverless.service.provider.shouldNotDeploy = false

    // Remote matches the template/state but carries a *different* function zip
    // hash, so the per-function artifact must be included to force a deploy.
    const templateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeCloudFormationTemplate(template)),
    )
    const stateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeState(stateObject)),
    )
    const remoteObjects = [
      {
        Key: 'prefix/compiled-cloudformation-template.json',
        Metadata: { filesha256: templateHash },
      },
      {
        Key: 'prefix/serverless-state.json',
        Metadata: { filesha256: stateHash },
      },
      {
        Key: 'prefix/fn.zip',
        Metadata: { filesha256: sha256(Buffer.from('stale function bytes')) },
      },
    ]

    await ctx.checkIfDeploymentIsNecessary(remoteObjects, new Date())

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })

  it('skips when the per-function artifact is unchanged', async () => {
    const ctx = buildCtx({ functionArtifact: 'artifacts/lambda/fn.zip' })
    ctx.serverless.service.provider.shouldNotDeploy = false

    const templateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeCloudFormationTemplate(template)),
    )
    const stateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeState(stateObject)),
    )
    const functionZipHash = sha256(fs.readFileSync(functionZipPath))
    const remoteObjects = [
      {
        Key: 'prefix/compiled-cloudformation-template.json',
        Metadata: { filesha256: templateHash },
      },
      {
        Key: 'prefix/serverless-state.json',
        Metadata: { filesha256: stateHash },
      },
      {
        Key: 'prefix/fn.zip',
        Metadata: { filesha256: functionZipHash },
      },
    ]

    await ctx.checkIfDeploymentIsNecessary(remoteObjects, new Date())

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it('ignores image-based functions (no zip to hash)', async () => {
    const ctx = buildCtx({
      functionArtifact: null,
      hasImageFunction: true,
    })
    ctx.serverless.service.provider.shouldNotDeploy = false

    const templateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeCloudFormationTemplate(template)),
    )
    const stateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeState(stateObject)),
    )
    const remoteObjects = [
      {
        Key: 'prefix/compiled-cloudformation-template.json',
        Metadata: { filesha256: templateHash },
      },
      {
        Key: 'prefix/serverless-state.json',
        Metadata: { filesha256: stateHash },
      },
    ]

    await ctx.checkIfDeploymentIsNecessary(remoteObjects, new Date())

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })
})
