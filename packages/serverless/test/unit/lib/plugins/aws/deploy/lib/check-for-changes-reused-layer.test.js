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

describe('checkIfDeploymentIsNecessary reused-layer zip exclusion', () => {
  let tempDir
  let serverlessDir
  let template
  let stateObject
  let serviceZipPath
  let commonZipPath
  // remoteReuseDir: newest remote dir is a reuse-only deploy (lacks the layer zip)
  // remoteFreshDir: newest remote dir is the fresh-layer deploy (has the layer zip)
  let remoteReuseDir
  let remoteFreshDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'check-for-changes-reused-layer-'),
    )
    serverlessDir = path.join(tempDir, '.serverless')
    fs.mkdirSync(serverlessDir)

    serviceZipPath = path.join(serverlessDir, 'service.zip')
    commonZipPath = path.join(serverlessDir, 'common.zip')
    fs.writeFileSync(serviceZipPath, 'service artifact bytes')
    fs.writeFileSync(commonZipPath, 'layer artifact bytes')

    template = { Resources: { Foo: { Type: 'AWS::Lambda::Function' } } }
    stateObject = {
      service: { service: 'my-service', provider: {} },
      package: {},
    }
    fs.writeFileSync(
      path.join(serverlessDir, 'serverless-state.json'),
      JSON.stringify(stateObject),
    )

    const templateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeCloudFormationTemplate(template)),
    )
    const stateHash = sha256(
      JSON.stringify(normalizeFiles.normalizeState(stateObject)),
    )
    const serviceZipHash = sha256(fs.readFileSync(serviceZipPath))
    const commonZipHash = sha256(fs.readFileSync(commonZipPath))

    // A reuse-only deployment dir does NOT contain the layer zip.
    remoteReuseDir = [
      {
        Key: 'prefix/compiled-cloudformation-template.json',
        Metadata: { filesha256: templateHash },
      },
      {
        Key: 'prefix/serverless-state.json',
        Metadata: { filesha256: stateHash },
      },
      {
        Key: 'prefix/service.zip',
        Metadata: { filesha256: serviceZipHash },
      },
    ]
    // A fresh-layer deployment dir DOES contain the layer zip.
    remoteFreshDir = [
      ...remoteReuseDir,
      {
        Key: 'prefix/common.zip',
        Metadata: { filesha256: commonZipHash },
      },
    ]
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const buildCtx = ({ artifactAlreadyUploaded }) => ({
    ...checkForChangesMixin,
    provider: {
      naming: { getServiceStateFileName: () => 'serverless-state.json' },
      resolveLayerArtifactName: () => commonZipPath,
    },
    serverless: {
      serviceDir: tempDir,
      service: {
        package: {},
        provider: { compiledCloudFormationTemplate: template },
        getAllLayers: () => ['common'],
        getLayer: () => ({
          package: { artifact: commonZipPath },
          artifactAlreadyUploaded,
        }),
      },
    },
  })

  it('skips when the newest remote dir is a reuse-only deploy lacking the layer zip (artifactAlreadyUploaded: true)', async () => {
    const ctx = buildCtx({ artifactAlreadyUploaded: true })
    ctx.serverless.service.provider.shouldNotDeploy = false

    await ctx.checkIfDeploymentIsNecessary(remoteReuseDir, new Date())

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it('still skips when the newest remote dir is the fresh-layer deploy that carries the layer zip', async () => {
    const ctx = buildCtx({ artifactAlreadyUploaded: true })
    ctx.serverless.service.provider.shouldNotDeploy = false

    await ctx.checkIfDeploymentIsNecessary(remoteFreshDir, new Date())

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it('does not skip when the layer is genuinely new (artifactAlreadyUploaded falsy) and the layer zip is absent remotely', async () => {
    const ctx = buildCtx({ artifactAlreadyUploaded: false })
    ctx.serverless.service.provider.shouldNotDeploy = false

    await ctx.checkIfDeploymentIsNecessary(remoteReuseDir, new Date())

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })
})
