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

// A service whose only compute lives outside `functions` (web apps,
// sandboxes): `getFunctionsEarliestLastModifiedDate` returns null, so the
// stack's status and last update time stand in for it.
describe('checkIfDeploymentIsNecessary for a service without functions', () => {
  let tempDir
  let serverlessDir
  let template
  let stateObject

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-for-changes-nofn-'))
    serverlessDir = path.join(tempDir, '.serverless')
    fs.mkdirSync(path.join(serverlessDir, 'webapps'), { recursive: true })
    fs.mkdirSync(path.join(serverlessDir, 'sandboxes'), { recursive: true })

    template = {
      Resources: {
        ApiWebFunctionRevision: {
          Type: 'AWS::Lambda::WebFunctionRevision',
          Properties: {
            BuildConfig: {
              CodeConfig: {
                S3Object: { Key: 'serverless/shop/dev/webapps/api-aaa.zip' },
              },
            },
          },
        },
      },
    }
    stateObject = { service: { service: 'shop', provider: {} }, package: {} }
    fs.writeFileSync(
      path.join(serverlessDir, 'serverless-state.json'),
      JSON.stringify(stateObject),
    )
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  // The newest deployment directory, as listed and read by checkForChanges:
  // the template and state of the previous deploy, uploaded after any
  // function's LastModified.
  const remoteObjects = (deployedTemplate = template) => [
    {
      Key: 'serverless/shop/dev/1-2026-10-15T00:00:00.000Z/compiled-cloudformation-template.json',
      LastModified: new Date('2026-10-15T00:00:01Z'),
      Metadata: {
        filesha256: sha256(
          JSON.stringify(
            normalizeFiles.normalizeCloudFormationTemplate(deployedTemplate),
          ),
        ),
      },
    },
    {
      Key: 'serverless/shop/dev/1-2026-10-15T00:00:00.000Z/serverless-state.json',
      LastModified: new Date('2026-10-15T00:00:01Z'),
      Metadata: {
        filesha256: sha256(
          JSON.stringify(normalizeFiles.normalizeState(stateObject)),
        ),
      },
    },
  ]

  // The previous deploy uploaded at 00:00:01 and then updated the stack.
  const buildCtx = ({
    stackStatus,
    stackLastUpdatedTime = new Date('2026-10-15T00:00:05Z'),
    functions = [],
  }) => ({
    ...checkForChangesMixin,
    stackStatus,
    stackLastUpdatedTime,
    provider: {
      naming: { getServiceStateFileName: () => 'serverless-state.json' },
    },
    serverless: {
      serviceDir: tempDir,
      service: {
        package: {},
        provider: {
          compiledCloudFormationTemplate: template,
          shouldNotDeploy: false,
        },
        getAllLayers: () => [],
        getAllFunctions: () => functions,
        getFunction: () => ({}),
      },
    },
  })

  it('skips an unchanged web-apps-only service', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
    const ctx = buildCtx({ stackStatus: 'UPDATE_COMPLETE' })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it('skips an unchanged service whose stack was imported', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
    const ctx = buildCtx({ stackStatus: 'IMPORT_COMPLETE' })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it('skips an unchanged sandboxes-only service', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'sandboxes', 'vm-bbb.zip'), 'y')
    const ctx = buildCtx({ stackStatus: 'CREATE_COMPLETE' })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it.each([
    'UPDATE_ROLLBACK_COMPLETE',
    'ROLLBACK_COMPLETE',
    // `provider.disableRollback: true` keeps a failed deploy's state.
    'UPDATE_FAILED',
    'CREATE_FAILED',
  ])(
    'deploys again after a deploy that left the stack in %s',
    async (stackStatus) => {
      fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
      const ctx = buildCtx({ stackStatus })

      await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

      expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
    },
  )

  it('deploys when an object is newer than the last stack update', async () => {
    // A deploy uploaded its directory and then failed before the stack update
    // (a rejected template or change set), so the stack never applied it.
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
    const ctx = buildCtx({
      stackStatus: 'UPDATE_COMPLETE',
      stackLastUpdatedTime: new Date('2026-10-14T00:00:00Z'),
    })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })

  it('compares a stack time given as a string', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
    const ctx = buildCtx({
      stackStatus: 'UPDATE_COMPLETE',
      stackLastUpdatedTime: '2026-10-15T00:00:05.000Z',
    })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(true)
  })

  it('deploys when the stack time is unknown', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
    const ctx = buildCtx({ stackStatus: 'UPDATE_COMPLETE' })
    ctx.stackLastUpdatedTime = undefined

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })

  it('deploys when the stack did not exist before this deploy', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-aaa.zip'), 'x')
    const ctx = buildCtx({
      stackStatus: undefined,
      stackLastUpdatedTime: undefined,
    })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })

  it('deploys a changed template', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'webapps', 'api-ccc.zip'), 'z')
    const ctx = buildCtx({ stackStatus: 'UPDATE_COMPLETE' })
    const deployedTemplate = structuredClone(template)
    deployedTemplate.Resources.ApiWebFunctionRevision.Properties.BuildConfig.CodeConfig.S3Object.Key =
      'serverless/shop/dev/webapps/api-old.zip'

    await ctx.checkIfDeploymentIsNecessary(
      remoteObjects(deployedTemplate),
      null,
    )

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })

  it('still hashes other zips under .serverless', async () => {
    fs.writeFileSync(path.join(serverlessDir, 'shop.zip'), 'service code')
    const ctx = buildCtx({ stackStatus: 'UPDATE_COMPLETE' })

    await ctx.checkIfDeploymentIsNecessary(remoteObjects(), null)

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })

  it('keeps the LastModified guard for a service with functions', async () => {
    const ctx = buildCtx({
      stackStatus: 'UPDATE_COMPLETE',
      functions: ['hello'],
    })

    await ctx.checkIfDeploymentIsNecessary(
      remoteObjects(),
      new Date('2026-10-15T00:00:00Z'),
    )

    expect(ctx.serverless.service.provider.shouldNotDeploy).toBe(false)
  })
})
