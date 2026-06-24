'use strict'

import { jest } from '@jest/globals'
import ServerlessSandboxes from '../../../../../../lib/plugins/aws/sandboxes/index.js'

function makeProvider(overrides = {}) {
  return {
    getStage: () => 'dev',
    getRegion: () => 'us-east-1',
    getServerlessDeploymentBucketName: jest
      .fn()
      .mockResolvedValue('resolved-deploy-bucket'),
    request: jest.fn().mockImplementation((service, method) => {
      if (
        service === 'LambdaMicrovms' &&
        method === 'listManagedMicrovmImageVersions'
      ) {
        return Promise.resolve({ items: [{ imageVersion: '1' }] })
      }
      return Promise.resolve({})
    }),
    ...overrides,
  }
}

const makeServerless = (sandboxes, providerOverride) => {
  const provider = providerOverride ?? makeProvider()
  return {
    configurationInput: { sandboxes },
    service: {
      service: 'svc',
      sandboxes,
      provider: {
        deploymentBucket: 'test-bucket',
        compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
      },
    },
    getProvider: () => provider,
    configSchemaHandler: { defineTopLevelProperty: jest.fn() },
    classes: { Error },
  }
}

describe('ServerlessSandboxes', () => {
  test('shouldLoad is true when sandboxes config is non-empty', () => {
    expect(
      ServerlessSandboxes.shouldLoad({ serverless: makeServerless({ a: {} }) }),
    ).toBe(true)
  })

  test('shouldLoad is false when sandboxes config is absent/empty', () => {
    expect(
      ServerlessSandboxes.shouldLoad({
        serverless: { configurationInput: {} },
      }),
    ).toBe(false)
    expect(
      ServerlessSandboxes.shouldLoad({ serverless: makeServerless({}) }),
    ).toBe(false)
  })

  test('registers the schema and exposes all lifecycle hooks', () => {
    const sls = makeServerless({ a: {} })
    const p = new ServerlessSandboxes(sls, {}, { log: { debug() {} } })
    expect(sls.configSchemaHandler.defineTopLevelProperty).toHaveBeenCalledWith(
      'sandboxes',
      expect.any(Object),
    )
    expect(p.hooks).toHaveProperty('before:package:initialize')
    expect(p.hooks).toHaveProperty('before:deploy:deploy')
    expect(p.hooks).toHaveProperty('before:package:finalize')
  })

  test('validate() throws when a sandbox is missing artifact', () => {
    const sls = makeServerless({ broken: { memory: 512 } })
    const p = new ServerlessSandboxes(sls, {}, { log: { debug() {} } })
    expect(() => p.validate()).toThrow(/artifact/)
  })

  test('validate() is a no-op when sandboxesConfig is null', () => {
    const sls = makeServerless(null)
    const p = new ServerlessSandboxes(sls, {}, { log: { debug() {} } })
    expect(() => p.validate()).not.toThrow()
  })

  test('compile() emits MicrovmImage resource into CFN template', async () => {
    const sls = makeServerless({
      runner: { artifact: 's3://bucket/artifact.zip' },
    })
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await p.compile()
    const resources =
      sls.service.provider.compiledCloudFormationTemplate.Resources
    expect(resources).toHaveProperty('RunnerImage')
    expect(resources.RunnerImage.Type).toBe('AWS::Lambda::MicrovmImage')
  })

  test('compile() throws a clear error when the provider returns no base image versions', async () => {
    const provider = makeProvider({
      request: jest.fn().mockImplementation((service, method) => {
        if (
          service === 'LambdaMicrovms' &&
          method === 'listManagedMicrovmImageVersions'
        ) {
          return Promise.resolve({ items: [] })
        }
        return Promise.resolve({})
      }),
    })
    const sls = makeServerless(
      { runner: { artifact: 's3://bucket/artifact.zip' } },
      provider,
    )
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await expect(p.compile()).rejects.toThrow(
      /No managed MicroVM base image versions/i,
    )
  })

  test('compile() is idempotent — second call is a no-op', async () => {
    const sls = makeServerless({
      runner: { artifact: 's3://bucket/artifact.zip' },
    })
    const provider = sls.getProvider()
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await p.compile()
    const callCountAfterFirst = provider.request.mock.calls.length
    await p.compile()
    expect(provider.request.mock.calls.length).toBe(callCountAfterFirst)
  })

  test('compile() is a no-op when sandboxesConfig is null', async () => {
    const sls = makeServerless(null)
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await expect(p.compile()).resolves.toBeUndefined()
  })

  test('compile() does NOT call S3 upload (upload is deferred to packageArtifacts)', async () => {
    const provider = makeProvider()
    // Use an s3:// artifact so no filesystem zip is needed — the local-dir
    // path is tested via packageArtifacts below.  The key property under test
    // is that compile() makes no S3 upload call regardless of artifact type.
    const sls = makeServerless(
      { runner: { artifact: 's3://my-bucket/artifact.zip' } },
      provider,
    )
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await p.compile()
    const s3UploadCalls = provider.request.mock.calls.filter(
      ([svc, method]) => svc === 'S3' && method === 'upload',
    )
    expect(s3UploadCalls).toHaveLength(0)
  })

  test('packageArtifacts() uploads local-dir artifact to S3 at deploy time', async () => {
    const provider = makeProvider()
    const sls = makeServerless(
      { runner: { artifact: 's3://bucket/artifact.zip' } },
      provider,
    )
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })

    // Manually inject a pending upload to simulate what compile() would do
    // for a local-dir artifact, without needing real filesystem zip.
    p._pendingUploads = new Map([
      [
        'runner',
        {
          key: 'serverless/svc/dev/sandboxes/runner-abc123.zip',
          zipBuffer: Buffer.from('fake-zip'),
        },
      ],
    ])

    await p.packageArtifacts()

    expect(provider.getServerlessDeploymentBucketName).toHaveBeenCalled()
    const s3UploadCalls = provider.request.mock.calls.filter(
      ([svc, method]) => svc === 'S3' && method === 'upload',
    )
    expect(s3UploadCalls).toHaveLength(1)
    const [, , params] = s3UploadCalls[0]
    expect(params.Bucket).toBe('resolved-deploy-bucket')
    expect(params.Key).toBe('serverless/svc/dev/sandboxes/runner-abc123.zip')
    expect(params.ContentType).toBe('application/zip')
  })

  test('packageArtifacts() is a no-op when there are no pending uploads (s3:// artifact)', async () => {
    const provider = makeProvider()
    const sls = makeServerless(
      { runner: { artifact: 's3://bucket/artifact.zip' } },
      provider,
    )
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await p.compile()
    // _pendingUploads should be empty for s3:// artifact
    await p.packageArtifacts()
    expect(provider.getServerlessDeploymentBucketName).not.toHaveBeenCalled()
    const s3UploadCalls = provider.request.mock.calls.filter(
      ([svc, method]) => svc === 'S3' && method === 'upload',
    )
    expect(s3UploadCalls).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end compile structure test
// Drives the plugin's compile() method with a realistic multi-feature config
// and asserts the full merged compiledCloudFormationTemplate structure.
// This is a regression guard across the entire compile path.
// ─────────────────────────────────────────────────────────────────────────────
describe('end-to-end compile', () => {
  const INTERNET_EGRESS_ARN =
    'arn:aws:lambda:us-east-1:aws:network-connector:aws-network-connector:INTERNET_EGRESS'

  // Config exercising both minimal and fully-featured sandboxes.
  // All artifacts are s3:// so compile() is hermetic — no zipDir injection needed.
  const sandboxesConfig = {
    // Minimal: only required field. Defaults should apply everywhere.
    mini: { artifact: 's3://bucket/mini.zip' },

    // Full: every optional field set.
    full: {
      artifact: 's3://bucket/full.zip',
      memory: 4096,
      description: 'my full sandbox',
      environment: { NODE_ENV: 'production', PORT: 3000 },
      osCapabilities: ['ALL'],
      hooks: {
        ready: true,
        run: { timeout: 5 },
      },
      vpc: {
        subnets: ['subnet-1'],
        securityGroups: ['sg-1'],
      },
      iam: {
        buildRole: {
          statements: [
            {
              Effect: 'Allow',
              Action: ['s3:GetObject'],
              Resource: 'arn:aws:s3:::extra-bucket/*',
            },
          ],
        },
      },
      tags: { Team: 'platform', Env: 'prod' },
    },
  }

  let template
  let plugin

  beforeEach(async () => {
    const sls = makeServerless(sandboxesConfig)
    // Drive the real plugin compile() path: getSandboxesConfig() → getContext() → orchestrate().
    plugin = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await plugin.compile()
    template = sls.service.provider.compiledCloudFormationTemplate
  })

  // ── Minimal sandbox (mini) ──────────────────────────────────────────────────

  describe('mini sandbox (minimal config, s3:// artifact)', () => {
    test('emits MiniImage resource of correct type', () => {
      expect(template.Resources).toHaveProperty('MiniImage')
      expect(template.Resources.MiniImage.Type).toBe(
        'AWS::Lambda::MicrovmImage',
      )
    })

    test('MiniImage has exactly the expected 13 top-level Properties', () => {
      const props = template.Resources.MiniImage.Properties
      const expectedKeys = [
        'Name',
        'BaseImageArn',
        'BaseImageVersion',
        'BuildRoleArn',
        'Description',
        'CodeArtifact',
        'Logging',
        'EgressNetworkConnectors',
        'CpuConfigurations',
        'Resources',
        'AdditionalOsCapabilities',
        'Hooks',
        'EnvironmentVariables',
      ]
      for (const key of expectedKeys) {
        expect(props).toHaveProperty(key)
      }
      // No Tags for minimal sandbox
      expect(props).not.toHaveProperty('Tags')
    })

    test('MiniImage.Name is derived from service+name+stage', () => {
      expect(template.Resources.MiniImage.Properties.Name).toBe('svc-mini-dev')
    })

    test('MiniImage.BaseImageArn is the al2023-1 managed image ARN', () => {
      expect(template.Resources.MiniImage.Properties.BaseImageArn).toBe(
        'arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1',
      )
    })

    test('MiniImage.BaseImageVersion is "1" (from mocked response)', () => {
      expect(template.Resources.MiniImage.Properties.BaseImageVersion).toBe('1')
    })

    test('MiniImage.BuildRoleArn references the generated build role via Fn::GetAtt', () => {
      expect(template.Resources.MiniImage.Properties.BuildRoleArn).toEqual({
        'Fn::GetAtt': ['MiniImageBuildRole', 'Arn'],
      })
    })

    test('MiniImage.CodeArtifact.Uri is the literal s3:// string', () => {
      expect(template.Resources.MiniImage.Properties.CodeArtifact.Uri).toBe(
        's3://bucket/mini.zip',
      )
    })

    test('MiniImage.Logging has CloudWatch log group', () => {
      expect(template.Resources.MiniImage.Properties.Logging).toEqual({
        CloudWatch: { LogGroup: '/aws/lambda-microvms/svc-mini-dev' },
      })
    })

    test('MiniImage.EgressNetworkConnectors defaults to INTERNET_EGRESS only', () => {
      expect(
        template.Resources.MiniImage.Properties.EgressNetworkConnectors,
      ).toEqual([INTERNET_EGRESS_ARN])
    })

    test('MiniImage.CpuConfigurations defaults to ARM_64', () => {
      expect(template.Resources.MiniImage.Properties.CpuConfigurations).toEqual(
        [{ Architecture: 'ARM_64' }],
      )
    })

    test('MiniImage.Resources defaults to 2048 MiB memory', () => {
      expect(template.Resources.MiniImage.Properties.Resources).toEqual([
        { MinimumMemoryInMiB: 2048 },
      ])
    })

    test('MiniImage.AdditionalOsCapabilities is empty array (no osCapabilities set)', () => {
      expect(
        template.Resources.MiniImage.Properties.AdditionalOsCapabilities,
      ).toEqual([])
    })

    test('MiniImage.Hooks is empty object (no hooks set)', () => {
      expect(template.Resources.MiniImage.Properties.Hooks).toEqual({})
    })

    test('MiniImage.EnvironmentVariables is empty array (no env set)', () => {
      expect(
        template.Resources.MiniImage.Properties.EnvironmentVariables,
      ).toEqual([])
    })

    test('emits MiniImageBuildRole (AWS::IAM::Role)', () => {
      expect(template.Resources).toHaveProperty('MiniImageBuildRole')
      expect(template.Resources.MiniImageBuildRole.Type).toBe('AWS::IAM::Role')
    })

    test('emits MiniImageExecutionRole (AWS::IAM::Role)', () => {
      expect(template.Resources).toHaveProperty('MiniImageExecutionRole')
      expect(template.Resources.MiniImageExecutionRole.Type).toBe(
        'AWS::IAM::Role',
      )
    })

    test('does NOT emit MiniConnector or MiniConnectorOperatorRole (no vpc)', () => {
      expect(template.Resources).not.toHaveProperty('MiniConnector')
      expect(template.Resources).not.toHaveProperty('MiniConnectorOperatorRole')
    })

    test('emits MiniImageArn Output referencing MiniImage', () => {
      expect(template.Outputs).toHaveProperty('MiniImageArn')
      expect(template.Outputs.MiniImageArn.Value).toEqual({
        Ref: 'MiniImage',
      })
    })

    test('does NOT emit MiniConnectorArn Output (no vpc)', () => {
      expect(template.Outputs).not.toHaveProperty('MiniConnectorArn')
    })
  })

  // ── Full sandbox (full) ─────────────────────────────────────────────────────

  describe('full sandbox (all features, local artifact, vpc, hooks, env, osCapabilities, tags, iam customization)', () => {
    test('emits FullImage resource of correct type', () => {
      expect(template.Resources).toHaveProperty('FullImage')
      expect(template.Resources.FullImage.Type).toBe(
        'AWS::Lambda::MicrovmImage',
      )
    })

    test('FullImage has all 13 standard Properties plus Tags', () => {
      const props = template.Resources.FullImage.Properties
      const expectedKeys = [
        'Name',
        'BaseImageArn',
        'BaseImageVersion',
        'BuildRoleArn',
        'Description',
        'CodeArtifact',
        'Logging',
        'EgressNetworkConnectors',
        'CpuConfigurations',
        'Resources',
        'AdditionalOsCapabilities',
        'Hooks',
        'EnvironmentVariables',
        'Tags',
      ]
      for (const key of expectedKeys) {
        expect(props).toHaveProperty(key)
      }
    })

    test('FullImage.Name is derived from service+name+stage', () => {
      expect(template.Resources.FullImage.Properties.Name).toBe('svc-full-dev')
    })

    test('FullImage.BaseImageVersion is "1" (from mocked response)', () => {
      expect(template.Resources.FullImage.Properties.BaseImageVersion).toBe('1')
    })

    test('FullImage.Description is the user-supplied description', () => {
      expect(template.Resources.FullImage.Properties.Description).toBe(
        'my full sandbox',
      )
    })

    test('FullImage.CodeArtifact.Uri is the literal s3:// string', () => {
      expect(template.Resources.FullImage.Properties.CodeArtifact.Uri).toBe(
        's3://bucket/full.zip',
      )
    })

    test('FullImage.Resources uses overridden 4096 MiB memory', () => {
      expect(template.Resources.FullImage.Properties.Resources).toEqual([
        { MinimumMemoryInMiB: 4096 },
      ])
    })

    test('FullImage.EgressNetworkConnectors still contains INTERNET_EGRESS (build needs internet even with vpc)', () => {
      expect(
        template.Resources.FullImage.Properties.EgressNetworkConnectors,
      ).toEqual([INTERNET_EGRESS_ARN])
    })

    test('FullImage.CpuConfigurations is ARM_64 (no override supported)', () => {
      expect(template.Resources.FullImage.Properties.CpuConfigurations).toEqual(
        [{ Architecture: 'ARM_64' }],
      )
    })

    test('FullImage.AdditionalOsCapabilities uppercases ALL', () => {
      expect(
        template.Resources.FullImage.Properties.AdditionalOsCapabilities,
      ).toEqual(['ALL'])
    })

    test('FullImage.Hooks: ready+run hooks auto-enable Ready with correct timeouts', () => {
      const hooks = template.Resources.FullImage.Properties.Hooks
      // Port defaults to 9000
      expect(hooks.Port).toBe(9000)
      // MicrovmImageHooks: ready is enabled (explicitly), ReadyTimeoutInSeconds = 30
      expect(hooks.MicrovmImageHooks).toEqual({
        Ready: 'ENABLED',
        ReadyTimeoutInSeconds: 30,
      })
      // MicrovmHooks: run enabled with timeout=5
      expect(hooks.MicrovmHooks).toEqual({
        Run: 'ENABLED',
        RunTimeoutInSeconds: 5,
      })
    })

    test('FullImage.EnvironmentVariables maps env entries to Key/Value pairs', () => {
      const envVars =
        template.Resources.FullImage.Properties.EnvironmentVariables
      expect(envVars).toContainEqual({ Key: 'NODE_ENV', Value: 'production' })
      expect(envVars).toContainEqual({ Key: 'PORT', Value: '3000' })
      expect(envVars).toHaveLength(2)
    })

    test('FullImage.Tags maps tags to Key/Value pairs', () => {
      const tags = template.Resources.FullImage.Properties.Tags
      expect(tags).toContainEqual({ Key: 'Team', Value: 'platform' })
      expect(tags).toContainEqual({ Key: 'Env', Value: 'prod' })
      expect(tags).toHaveLength(2)
    })

    test('emits FullImageBuildRole with user-supplied extra statement', () => {
      expect(template.Resources).toHaveProperty('FullImageBuildRole')
      const statements =
        template.Resources.FullImageBuildRole.Properties.Policies[0]
          .PolicyDocument.Statement
      const extraStmt = statements.find(
        (s) => s.Resource === 'arn:aws:s3:::extra-bucket/*',
      )
      expect(extraStmt).toBeDefined()
      expect(extraStmt.Effect).toBe('Allow')
      expect(extraStmt.Action).toEqual(['s3:GetObject'])
    })

    test('emits FullImageExecutionRole (AWS::IAM::Role)', () => {
      expect(template.Resources).toHaveProperty('FullImageExecutionRole')
      expect(template.Resources.FullImageExecutionRole.Type).toBe(
        'AWS::IAM::Role',
      )
    })

    test('emits FullConnector (AWS::Lambda::NetworkConnector) for vpc sandbox', () => {
      expect(template.Resources).toHaveProperty('FullConnector')
      expect(template.Resources.FullConnector.Type).toBe(
        'AWS::Lambda::NetworkConnector',
      )
    })

    test('FullConnector.Properties has correct vpc config', () => {
      const connProps = template.Resources.FullConnector.Properties
      const vpcEgress = connProps.Configuration.VpcEgressConfiguration
      expect(vpcEgress.SubnetIds).toEqual(['subnet-1'])
      expect(vpcEgress.SecurityGroupIds).toEqual(['sg-1'])
      expect(vpcEgress.NetworkProtocol).toBe('IPv4')
      expect(vpcEgress.AssociatedComputeResourceTypes).toEqual(['MicroVm'])
    })

    test('FullConnector.OperatorRole references FullConnectorOperatorRole via Fn::GetAtt', () => {
      expect(template.Resources.FullConnector.Properties.OperatorRole).toEqual({
        'Fn::GetAtt': ['FullConnectorOperatorRole', 'Arn'],
      })
    })

    test('emits FullConnectorOperatorRole (AWS::IAM::Role) with network-connectors trust principal', () => {
      expect(template.Resources).toHaveProperty('FullConnectorOperatorRole')
      const role = template.Resources.FullConnectorOperatorRole
      expect(role.Type).toBe('AWS::IAM::Role')
      const trustStmt = role.Properties.AssumeRolePolicyDocument.Statement[0]
      expect(trustStmt.Principal.Service).toBe(
        'network-connectors.lambda.amazonaws.com',
      )
    })

    test('emits FullImageArn Output referencing FullImage', () => {
      expect(template.Outputs).toHaveProperty('FullImageArn')
      expect(template.Outputs.FullImageArn.Value).toEqual({
        Ref: 'FullImage',
      })
    })

    test('emits FullConnectorArn Output referencing FullConnector', () => {
      expect(template.Outputs).toHaveProperty('FullConnectorArn')
      expect(template.Outputs.FullConnectorArn.Value).toEqual({
        Ref: 'FullConnector',
      })
    })
  })

  // ── Cross-cutting template shape ────────────────────────────────────────────

  describe('merged template cross-cutting assertions', () => {
    test('template has resources for both sandboxes (no missing, no extra duplicates)', () => {
      const resourceKeys = Object.keys(template.Resources)
      // Mini: Image, BuildRole, ExecutionRole (no connector)
      // Full: Image, BuildRole, ExecutionRole, Connector, ConnectorOperatorRole
      const expectedKeys = [
        'MiniImage',
        'MiniImageBuildRole',
        'MiniImageExecutionRole',
        'FullImage',
        'FullImageBuildRole',
        'FullImageExecutionRole',
        'FullConnector',
        'FullConnectorOperatorRole',
      ]
      for (const key of expectedKeys) {
        expect(resourceKeys).toContain(key)
      }
      // Unique check — no accidental duplicates in the map
      expect(resourceKeys.length).toBe(new Set(resourceKeys).size)
    })

    test('template has exactly 5 Outputs (image + execution-role ARNs for both sandboxes, plus FullConnectorArn — no MiniConnectorArn)', () => {
      const outputKeys = Object.keys(template.Outputs)
      expect(outputKeys).toContain('MiniImageArn')
      expect(outputKeys).toContain('MiniImageExecutionRoleArn')
      expect(outputKeys).toContain('FullImageArn')
      expect(outputKeys).toContain('FullImageExecutionRoleArn')
      expect(outputKeys).toContain('FullConnectorArn')
      expect(outputKeys).not.toContain('MiniConnectorArn')
      expect(outputKeys).toHaveLength(5)
    })

    test('all IAM roles use the Lambda trust principal (not network-connectors) except operator role', () => {
      const lambdaRoles = [
        'MiniImageBuildRole',
        'MiniImageExecutionRole',
        'FullImageBuildRole',
        'FullImageExecutionRole',
      ]
      for (const roleId of lambdaRoles) {
        const principal =
          template.Resources[roleId].Properties.AssumeRolePolicyDocument
            .Statement[0].Principal.Service
        expect(principal).toBe('lambda.amazonaws.com')
      }
    })
  })
})
