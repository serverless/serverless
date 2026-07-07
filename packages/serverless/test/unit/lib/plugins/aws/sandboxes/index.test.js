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
    serviceDir: '/svc',
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
    addServiceOutputSection: jest.fn(),
    processedInput: { commands: ['deploy'] },
    classes: { Error },
  }
}

// fs/promises-like stub for the package-dir hand-off. `manifest` (when given)
// is returned for the manifest read; any other read returns a fake zip body.
function makeFakeFs(manifest) {
  return {
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async () => {}),
    readFile: jest.fn(async (p) => {
      if (String(p).endsWith('sandboxes-uploads.json')) {
        if (!manifest) {
          throw Object.assign(new Error('not found'), { code: 'ENOENT' })
        }
        return JSON.stringify(manifest)
      }
      return Buffer.from('fake-zip')
    }),
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
    expect(p.hooks).toHaveProperty('before:aws:info:gatherData')
  })

  test('validate() throws when a sandbox is missing artifact', () => {
    const sls = makeServerless({ broken: { minimumMemory: 512 } })
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

  test('compile() does NOT touch service outputs — the dashboard line comes from the aws:info hook (so a bare `package` never prints it)', async () => {
    const sls = makeServerless({
      runner: { artifact: 's3://bucket/artifact.zip' },
    })
    sls.processedInput = { commands: ['package'] }
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    await p.compile()
    expect(sls.addServiceOutputSection).not.toHaveBeenCalled()
  })

  test('addSandboxServiceOutputs() surfaces the sandboxes list and the dashboard URL (fires for both `info` and `deploy` via aws:info:gatherData)', () => {
    const sls = makeServerless({
      runner: { artifact: 's3://bucket/artifact.zip' },
      worker: { artifact: 's3://bucket/worker.zip' },
    })
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    p.addSandboxServiceOutputs()
    // Sandbox list mirrors the `functions` section: name → deployed image name.
    expect(sls.addServiceOutputSection).toHaveBeenCalledWith('sandboxes', [
      'runner: svc-runner-dev',
      'worker: svc-worker-dev',
    ])
    // Dashboard name is `${service}-${stage}-sandboxes`; region from the provider.
    expect(sls.addServiceOutputSection).toHaveBeenCalledWith(
      'dashboard',
      'https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/svc-dev-sandboxes',
    )
  })

  test('addSandboxServiceOutputs() still lists sandboxes but omits the dashboard URL when observability is disabled', () => {
    const sls = makeServerless({
      runner: { artifact: 's3://bucket/artifact.zip', observability: false },
    })
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    p.addSandboxServiceOutputs()
    expect(sls.addServiceOutputSection).toHaveBeenCalledWith('sandboxes', [
      'runner: svc-runner-dev',
    ])
    const dashboardCall = sls.addServiceOutputSection.mock.calls.find(
      ([section]) => section === 'dashboard',
    )
    expect(dashboardCall).toBeUndefined()
  })

  test('addSandboxServiceOutputs() is idempotent — a repeat call never adds a section twice (addServiceOutputSection throws on duplicates)', () => {
    const sls = makeServerless({
      runner: { artifact: 's3://bucket/artifact.zip' },
    })
    const p = new ServerlessSandboxes(sls, {}, { log: { debug: jest.fn() } })
    p.addSandboxServiceOutputs()
    p.addSandboxServiceOutputs()
    // Exactly one 'sandboxes' + one 'dashboard' call across both invocations.
    expect(sls.addServiceOutputSection).toHaveBeenCalledTimes(2)
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

  test('packageArtifacts() uploads artifacts from the package-dir manifest (works for deploy --package)', async () => {
    const provider = makeProvider()
    const sls = makeServerless(
      { runner: { artifact: 's3://bucket/artifact.zip' } },
      provider,
    )
    // A separate `deploy --package` process: no compile() ran, the manifest is
    // read from disk. The fake fs returns it (and a zip body) without touching
    // the real filesystem.
    const fakeFs = makeFakeFs([
      {
        name: 'runner',
        key: 'serverless/svc/dev/sandboxes/runner-abc123.zip',
        file: 'sandboxes/runner-abc123.zip',
      },
    ])
    const p = new ServerlessSandboxes(
      sls,
      {},
      { log: { debug: jest.fn() } },
      { fs: fakeFs },
    )

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

  test('packageArtifacts() is a no-op when there is no manifest (only s3:// artifacts)', async () => {
    const provider = makeProvider()
    const sls = makeServerless(
      { runner: { artifact: 's3://bucket/artifact.zip' } },
      provider,
    )
    const fakeFs = makeFakeFs(null) // manifest read → ENOENT → []
    const p = new ServerlessSandboxes(
      sls,
      {},
      { log: { debug: jest.fn() } },
      { fs: fakeFs },
    )
    await p.compile()
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
      minimumMemory: 4096,
      description: 'my full sandbox',
      environment: { NODE_ENV: 'production', PORT: 3000 },
      osCapabilities: ['ALL'],
      hooks: {
        ready: true,
        run: { timeout: 5 },
      },
      vpc: {
        subnetIds: ['subnet-1'],
        securityGroupIds: ['sg-1'],
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

    test('emits MiniExecutionRole (AWS::IAM::Role)', () => {
      expect(template.Resources).toHaveProperty('MiniExecutionRole')
      expect(template.Resources.MiniExecutionRole.Type).toBe('AWS::IAM::Role')
    })

    test('does NOT emit MiniConnector or MiniConnectorOperatorRole (no vpc)', () => {
      expect(template.Resources).not.toHaveProperty('MiniConnector')
      expect(template.Resources).not.toHaveProperty('MiniConnectorOperatorRole')
    })

    test('emits MiniImageIdentifier Output referencing MiniImage', () => {
      expect(template.Outputs).toHaveProperty('MiniImageIdentifier')
      expect(template.Outputs.MiniImageIdentifier.Value).toEqual({
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

    test('FullImage.Hooks: ready auto-enables (no framework timeout); explicit run timeout passes through', () => {
      const hooks = template.Resources.FullImage.Properties.Hooks
      // Port defaults to 9000
      expect(hooks.Port).toBe(9000)
      // ready is enabled (auto), with NO timeout property — the framework sets no
      // default, so the AWS platform default applies.
      expect(hooks.MicrovmImageHooks).toEqual({
        Ready: 'ENABLED',
      })
      // run enabled with its explicit timeout=5 passed through verbatim
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

    test('emits FullExecutionRole (AWS::IAM::Role)', () => {
      expect(template.Resources).toHaveProperty('FullExecutionRole')
      expect(template.Resources.FullExecutionRole.Type).toBe('AWS::IAM::Role')
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

    test('emits FullImageIdentifier Output referencing FullImage', () => {
      expect(template.Outputs).toHaveProperty('FullImageIdentifier')
      expect(template.Outputs.FullImageIdentifier.Value).toEqual({
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
        'MiniExecutionRole',
        'FullImage',
        'FullImageBuildRole',
        'FullExecutionRole',
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
      expect(outputKeys).toContain('MiniImageIdentifier')
      expect(outputKeys).toContain('MiniExecutionRoleArn')
      expect(outputKeys).toContain('FullImageIdentifier')
      expect(outputKeys).toContain('FullExecutionRoleArn')
      expect(outputKeys).toContain('FullConnectorArn')
      expect(outputKeys).not.toContain('MiniConnectorArn')
      expect(outputKeys).toHaveLength(5)
    })

    test('all IAM roles use the Lambda trust principal (not network-connectors) except operator role', () => {
      const lambdaRoles = [
        'MiniImageBuildRole',
        'MiniExecutionRole',
        'FullImageBuildRole',
        'FullExecutionRole',
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
