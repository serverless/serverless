'use strict'

import { jest } from '@jest/globals'
import { orchestrate } from '../../../../../../../lib/plugins/aws/sandboxes/compilation/orchestrator.js'

const INTERNET_EGRESS_ARN =
  'arn:aws:lambda:us-east-1:aws:network-connector:aws-network-connector:INTERNET_EGRESS'

function makeProvider(overrides = {}) {
  return {
    request: jest.fn().mockImplementation((service, method) => {
      if (
        service === 'LambdaMicrovms' &&
        method === 'listManagedMicrovmImageVersions'
      ) {
        return Promise.resolve({ items: [{ imageVersion: '3' }] })
      }
      return Promise.resolve({})
    }),
    ...overrides,
  }
}

function makeCtx(overrides = {}) {
  return {
    serviceName: 'svc',
    stage: 'dev',
    region: 'us-east-1',
    deploymentBucket: 'my-deploy-bucket',
    ...overrides,
  }
}

function makeTemplate() {
  return { Resources: {}, Outputs: {} }
}

const stubZipDir = jest.fn().mockResolvedValue(Buffer.from('fake-zip'))

describe('orchestrate', () => {
  describe('single sandbox (no vpc)', () => {
    let template
    let provider

    beforeEach(async () => {
      template = makeTemplate()
      provider = makeProvider()
      await orchestrate({
        sandboxesConfig: {
          runner: { artifact: './app', memory: 2048 },
        },
        ctx: makeCtx(),
        template,
        provider,
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
    })

    test('emits AWS::Lambda::MicrovmImage resource', () => {
      expect(template.Resources).toHaveProperty('RunnerImage')
      expect(template.Resources.RunnerImage.Type).toBe(
        'AWS::Lambda::MicrovmImage',
      )
    })

    test('emits BuildRole and ExecutionRole', () => {
      expect(template.Resources).toHaveProperty('RunnerImageBuildRole')
      expect(template.Resources.RunnerImageBuildRole.Type).toBe(
        'AWS::IAM::Role',
      )
      expect(template.Resources).toHaveProperty('RunnerExecutionRole')
      expect(template.Resources.RunnerExecutionRole.Type).toBe('AWS::IAM::Role')
    })

    test('emits Outputs.RunnerImageIdentifier', () => {
      expect(template.Outputs).toHaveProperty('RunnerImageIdentifier')
      expect(template.Outputs.RunnerImageIdentifier.Value).toEqual({
        Ref: 'RunnerImage',
      })
    })

    test('emits Outputs.RunnerExecutionRoleArn (GetAtt of the generated exec role)', () => {
      expect(template.Outputs).toHaveProperty('RunnerExecutionRoleArn')
      expect(template.Outputs.RunnerExecutionRoleArn.Value).toEqual({
        'Fn::GetAtt': ['RunnerExecutionRole', 'Arn'],
      })
    })

    test('image EgressNetworkConnectors defaults to INTERNET_EGRESS', () => {
      const connectors =
        template.Resources.RunnerImage.Properties.EgressNetworkConnectors
      expect(connectors).toEqual([INTERNET_EGRESS_ARN])
    })

    test('does NOT emit a NetworkConnector or OperatorRole (no vpc)', () => {
      expect(template.Resources).not.toHaveProperty('RunnerConnector')
      expect(template.Resources).not.toHaveProperty(
        'RunnerConnectorOperatorRole',
      )
    })

    test('BuildRole Fn::GetAtt wired into image BuildRoleArn', () => {
      const buildRoleArn =
        template.Resources.RunnerImage.Properties.BuildRoleArn
      expect(buildRoleArn).toEqual({
        'Fn::GetAtt': ['RunnerImageBuildRole', 'Arn'],
      })
    })

    test('does NOT call provider.request S3 upload during compile (no live upload)', () => {
      const s3UploadCalls = provider.request.mock.calls.filter(
        ([svc, method]) => svc === 'S3' && method === 'upload',
      )
      expect(s3UploadCalls).toHaveLength(0)
    })

    test('always emits the owned LogGroup with default retention', () => {
      const lg = template.Resources.RunnerLogGroup
      expect(lg).toBeDefined()
      expect(lg.Type).toBe('AWS::Logs::LogGroup')
      expect(lg.Properties.LogGroupName).toBe(
        '/aws/lambda-microvms/svc-runner-dev',
      )
      expect(lg.Properties.RetentionInDays).toBe(14)
    })

    test('image DependsOn the log group', () => {
      expect(template.Resources.RunnerImage.DependsOn).toContain(
        'RunnerLogGroup',
      )
    })

    test('observability default (absent⇒true): metric filter + dashboard emitted, no alarm', () => {
      expect(template.Resources.RunnerErrorsMetricFilter).toBeDefined()
      expect(template.Resources.SandboxesDashboard).toBeDefined()
      const alarmKeys = Object.keys(template.Resources).filter((k) =>
        k.endsWith('Alarm'),
      )
      expect(alarmKeys).toHaveLength(0)
    })

    test('CodeArtifact.Uri is a CFN Fn::Sub intrinsic referencing the deployment bucket (local-dir case)', () => {
      const uri = template.Resources.RunnerImage.Properties.CodeArtifact.Uri
      expect(uri).toHaveProperty('Fn::Sub')
      const [template_str, vars] = uri['Fn::Sub']
      expect(template_str).toMatch(
        /^s3:\/\/\${B}\/serverless\/svc\/dev\/sandboxes\/runner-[a-f0-9]+\.zip$/,
      )
      // When deploymentBucket is configured, the ref is the literal name.
      expect(vars.B).toBe('my-deploy-bucket')
    })
  })

  describe('single sandbox (no vpc) — no configured deploymentBucket', () => {
    test('CodeArtifact.Uri uses Ref: ServerlessDeploymentBucket when no bucket configured', async () => {
      const template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: { artifact: './app', memory: 2048 },
        },
        ctx: makeCtx({ deploymentBucket: undefined }),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      const uri = template.Resources.RunnerImage.Properties.CodeArtifact.Uri
      expect(uri).toHaveProperty('Fn::Sub')
      const [, vars] = uri['Fn::Sub']
      expect(vars.B).toEqual({ Ref: 'ServerlessDeploymentBucket' })
    })

    test('CodeArtifact.Uri uses the resolved service.package.deploymentBucket name (global/external bucket case — no ServerlessDeploymentBucket resource exists)', async () => {
      const template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: { artifact: './app', memory: 2048 },
        },
        ctx: makeCtx({ deploymentBucket: undefined }),
        template,
        provider: makeProvider(),
        // The framework records the resolved (global) bucket name here and
        // deletes the ServerlessDeploymentBucket resource; emitting a Ref would
        // fail CFN validation with "Unresolved resource dependencies".
        serverless: {
          service: { package: { deploymentBucket: 'global-bkt' } },
        },
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      const uri = template.Resources.RunnerImage.Properties.CodeArtifact.Uri
      const [, vars] = uri['Fn::Sub']
      expect(vars.B).toBe('global-bkt')

      // The build role's s3:GetObject must target the SAME resolved bucket, not
      // the literal "undefined". A wrong bucket here is invisible to CFN (the
      // template is valid) but the build fails with AccessDenied fetching the
      // artifact → "did not stabilize" with no logs.
      const buildPolicy =
        template.Resources.RunnerImageBuildRole.Properties.Policies[0]
          .PolicyDocument.Statement
      const s3Stmt = buildPolicy.find((s) =>
        (Array.isArray(s.Action) ? s.Action : [s.Action]).includes(
          's3:GetObject',
        ),
      )
      expect(s3Stmt.Resource['Fn::Sub']).toBe(
        'arn:${AWS::Partition}:s3:::global-bkt/*',
      )
    })
  })

  describe('sandbox with vpc', () => {
    let template

    beforeEach(async () => {
      template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: {
            artifact: 's3://my-bucket/artifact.zip',
            vpc: {
              subnets: ['subnet-aaa', 'subnet-bbb'],
              securityGroups: ['sg-111'],
            },
          },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
    })

    test('emits NetworkConnector resource', () => {
      expect(template.Resources).toHaveProperty('RunnerConnector')
      expect(template.Resources.RunnerConnector.Type).toBe(
        'AWS::Lambda::NetworkConnector',
      )
    })

    test('emits OperatorRole for the connector', () => {
      expect(template.Resources).toHaveProperty('RunnerConnectorOperatorRole')
      expect(template.Resources.RunnerConnectorOperatorRole.Type).toBe(
        'AWS::IAM::Role',
      )
    })

    test('image still keeps INTERNET_EGRESS (build needs internet)', () => {
      const connectors =
        template.Resources.RunnerImage.Properties.EgressNetworkConnectors
      expect(connectors).toEqual([INTERNET_EGRESS_ARN])
    })

    test('emits RunnerConnectorArn Output for data-plane run path', () => {
      expect(template.Outputs).toHaveProperty('RunnerConnectorArn')
      expect(template.Outputs.RunnerConnectorArn.Value).toEqual({
        Ref: 'RunnerConnector',
      })
    })

    test('connector OperatorRole wired to NetworkConnector OperatorRole property', () => {
      const opRole = template.Resources.RunnerConnector.Properties.OperatorRole
      expect(opRole).toEqual({
        'Fn::GetAtt': ['RunnerConnectorOperatorRole', 'Arn'],
      })
    })

    test('CodeArtifact.Uri is the literal s3:// string for s3:// artifacts', () => {
      const uri = template.Resources.RunnerImage.Properties.CodeArtifact.Uri
      expect(uri).toBe('s3://my-bucket/artifact.zip')
    })
  })

  describe('orchestrate returns pendingUploads Map', () => {
    test('returns a Map with one entry for a local-dir sandbox', async () => {
      const template = makeTemplate()
      const pending = await orchestrate({
        sandboxesConfig: {
          runner: { artifact: './app' },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      expect(pending).toBeInstanceOf(Map)
      expect(pending.size).toBe(1)
      expect(pending.has('runner')).toBe(true)
      const { key, zipBuffer } = pending.get('runner')
      expect(key).toMatch(
        /^serverless\/svc\/dev\/sandboxes\/runner-[a-f0-9]+\.zip$/,
      )
      expect(Buffer.isBuffer(zipBuffer)).toBe(true)
    })

    test('returns an empty Map for an s3:// sandbox', async () => {
      const template = makeTemplate()
      const pending = await orchestrate({
        sandboxesConfig: {
          runner: { artifact: 's3://b/k.zip' },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      expect(pending.size).toBe(0)
    })
  })

  describe('idempotency', () => {
    test('calling orchestrate twice does not duplicate resources', async () => {
      const template = makeTemplate()
      const args = {
        sandboxesConfig: { runner: { artifact: 's3://b/k.zip' } },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      }
      await orchestrate(args)
      await orchestrate(args)
      const resourceKeys = Object.keys(template.Resources)
      const unique = new Set(resourceKeys)
      expect(resourceKeys.length).toBe(unique.size)
    })
  })

  describe('explicit role override (shouldGenerateRole=false)', () => {
    test('does not generate a build role when an ARN string is provided', async () => {
      const template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: {
            artifact: 's3://b/k.zip',
            iam: { buildRole: 'arn:aws:iam::123456789012:role/my-build-role' },
          },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      expect(template.Resources).not.toHaveProperty('RunnerImageBuildRole')
      expect(template.Resources.RunnerImage.Properties.BuildRoleArn).toBe(
        'arn:aws:iam::123456789012:role/my-build-role',
      )
    })
  })

  describe('multiple sandboxes', () => {
    test('both sandboxes get their own resources', async () => {
      const template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          alpha: { artifact: 's3://b/alpha.zip' },
          beta: { artifact: 's3://b/beta.zip' },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      expect(template.Resources).toHaveProperty('AlphaImage')
      expect(template.Resources).toHaveProperty('BetaImage')
      expect(template.Resources).toHaveProperty('AlphaImageBuildRole')
      expect(template.Resources).toHaveProperty('BetaImageBuildRole')
      expect(template.Outputs).toHaveProperty('AlphaImageIdentifier')
      expect(template.Outputs).toHaveProperty('BetaImageIdentifier')
    })
  })

  describe('single sandbox — observability:false', () => {
    test('log group still owned; no metric filter/dashboard/alarm', async () => {
      const template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: { artifact: './app', observability: false },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      expect(template.Resources.RunnerLogGroup).toBeDefined()
      expect(template.Resources.RunnerErrorsMetricFilter).toBeUndefined()
      expect(template.Resources.SandboxesDashboard).toBeUndefined()
    })
  })

  describe('single sandbox — observability with alarms', () => {
    test('observability.alarms.notify ⇒ alarm with AlarmActions', async () => {
      const template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: {
            artifact: './app',
            observability: { alarms: { notify: 'arn:sns:t' } },
          },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      const alarm = template.Resources.RunnerErrorsAlarm
      expect(alarm).toBeDefined()
      expect(alarm.Properties.AlarmActions).toEqual(['arn:sns:t'])
    })
  })

  describe('tags propagation', () => {
    let template
    const TAGS = [{ Key: 'team', Value: 'platform' }]

    beforeEach(async () => {
      template = makeTemplate()
      await orchestrate({
        sandboxesConfig: {
          runner: {
            artifact: './app',
            tags: { team: 'platform' },
            observability: { alarms: { notify: 'arn:sns:t' } },
            vpc: { subnets: ['subnet-a'], securityGroups: ['sg-a'] },
          },
        },
        ctx: makeCtx(),
        template,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
    })

    test('tags every taggable resource the sandbox creates', () => {
      for (const id of [
        'RunnerImage',
        'RunnerLogGroup',
        'RunnerImageBuildRole',
        'RunnerExecutionRole',
        'RunnerErrorsAlarm',
        'RunnerConnector',
        'RunnerConnectorOperatorRole',
      ]) {
        expect(template.Resources[id]).toBeDefined()
        expect(template.Resources[id].Properties.Tags).toEqual(TAGS)
      }
    })

    test('the service dashboard is not tagged (it spans sandboxes)', () => {
      expect(template.Resources.SandboxesDashboard).toBeDefined()
      expect(
        template.Resources.SandboxesDashboard.Properties.Tags,
      ).toBeUndefined()
    })

    test('does NOT add Tags to AWS::Logs::MetricFilter (unsupported)', () => {
      const mf = template.Resources.RunnerErrorsMetricFilter
      expect(mf.Type).toBe('AWS::Logs::MetricFilter')
      expect(mf.Properties.Tags).toBeUndefined()
    })

    test('no tags config ⇒ no Tags on the image', async () => {
      const t2 = makeTemplate()
      await orchestrate({
        sandboxesConfig: { runner: { artifact: './app' } },
        ctx: makeCtx(),
        template: t2,
        provider: makeProvider(),
        serverless: {},
        log: { debug: jest.fn() },
        _zipDir: stubZipDir,
      })
      expect(t2.Resources.RunnerImage.Properties.Tags).toBeUndefined()
    })
  })
})
