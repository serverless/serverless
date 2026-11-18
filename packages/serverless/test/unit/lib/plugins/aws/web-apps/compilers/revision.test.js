import { describe, expect, it } from '@jest/globals'
import {
  compileRevision,
  getEffectiveTimeout,
} from '../../../../../../../lib/plugins/aws/web-apps/compilers/revision.js'
import { getWebAppLogicalIds } from '../../../../../../../lib/plugins/aws/web-apps/compilers/function.js'
import { givenProvider } from '../given.js'

const KEY = 'serverless/shop/dev/webapps/api-abc123.zip'

const compile = ({
  webApp = {},
  providerConfig = {},
  artifact = { key: KEY, entrypoint: '__sls_web_bootstrap.mjs' },
  bucketRef = { Ref: 'ServerlessDeploymentBucket' },
} = {}) =>
  compileRevision({
    functionName: 'shop-dev-api',
    webApp: { entry: 'src/server.ts', ...webApp },
    logicalIds: getWebAppLogicalIds('api'),
    artifact,
    bucketRef,
    provider: givenProvider(providerConfig),
    providerConfig,
  })

describe('compileRevision', () => {
  it('compiles a minimal revision', () => {
    expect(compile()).toEqual({
      Type: 'AWS::Lambda::WebFunctionRevision',
      DependsOn: ['ApiWebFunction'],
      Properties: {
        FunctionName: 'shop-dev-api',
        BuildConfig: {
          CodeConfig: {
            S3Object: {
              Bucket: { Ref: 'ServerlessDeploymentBucket' },
              Key: KEY,
            },
          },
          RuntimeConfig: { Runtime: 'nodejs24.x' },
        },
        ServiceConfig: {
          ExecutionRoleArn: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          EnvironmentVariables: {
            AWS_LAMBDA_NODEJS_ENTRYPOINT: '__sls_web_bootstrap.mjs',
          },
        },
      },
    })
  })

  it('names a resolved bucket literally and never pins a VersionId', () => {
    expect(
      compile({ bucketRef: 'my-bucket' }).Properties.BuildConfig.CodeConfig,
    ).toEqual({ S3Object: { Bucket: 'my-bucket', Key: KEY } })
  })

  describe('runtime', () => {
    const runtimeConfig = (options) =>
      compile(options).Properties.BuildConfig.RuntimeConfig

    it('inherits provider.runtime when it is nodejs24.x or newer', () => {
      expect(
        runtimeConfig({ providerConfig: { runtime: 'nodejs26.x' } }),
      ).toEqual({ Runtime: 'nodejs26.x' })
    })

    it('falls back to nodejs24.x for an older provider.runtime', () => {
      expect(
        runtimeConfig({ providerConfig: { runtime: 'nodejs20.x' } }),
      ).toEqual({ Runtime: 'nodejs24.x' })
    })

    it("uses the web app's own runtime over provider.runtime", () => {
      expect(
        runtimeConfig({
          webApp: { runtime: 'nodejs24.x' },
          providerConfig: { runtime: 'nodejs26.x' },
        }),
      ).toEqual({ Runtime: 'nodejs24.x' })
    })
  })

  it('sets description, kmsKeyArn and maxConcurrency', () => {
    const { Properties } = compile({
      webApp: {
        description: 'Storefront',
        kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/entry',
        maxConcurrency: 16,
      },
      providerConfig: {
        kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/provider',
      },
    })
    expect(Properties.Description).toBe('Storefront')
    expect(Properties.KmsKeyArn).toBe(
      'arn:aws:kms:us-east-1:123456789012:key/entry',
    )
    expect(Properties.ServiceConfig.MaxConcurrencyPerEnvironment).toBe(16)
  })

  // configValidationMode: off leaves a quoted number a string; the revision
  // resource only accepts an integer
  it('compiles maxConcurrency given as a numeric string to a number', () => {
    expect(
      compile({ webApp: { maxConcurrency: '64' } }).Properties.ServiceConfig
        .MaxConcurrencyPerEnvironment,
    ).toBe(64)
  })

  it('inherits provider.kmsKeyArn', () => {
    expect(
      compile({ providerConfig: { kmsKeyArn: { Ref: 'Key' } } }).Properties
        .KmsKeyArn,
    ).toEqual({ Ref: 'Key' })
  })

  describe('timeout', () => {
    it('is absent without an entry or provider timeout', () => {
      expect(compile().Properties.ServiceConfig).not.toHaveProperty(
        'TimeoutSeconds',
      )
    })

    it('inherits an explicit provider.timeout', () => {
      expect(
        compile({ providerConfig: { timeout: 6 } }).Properties.ServiceConfig
          .TimeoutSeconds,
      ).toBe(6)
    })

    it('passes an inherited intrinsic provider.timeout through', () => {
      expect(
        compile({ providerConfig: { timeout: { Ref: 'RequestTimeout' } } })
          .Properties.ServiceConfig.TimeoutSeconds,
      ).toEqual({ Ref: 'RequestTimeout' })
    })

    it('leaves out a provider.timeout that is not a number', () => {
      expect(
        compile({ providerConfig: { timeout: 'soon' } }).Properties
          .ServiceConfig,
      ).not.toHaveProperty('TimeoutSeconds')
    })

    it('prefers the entry timeout', () => {
      expect(
        compile({ webApp: { timeout: 60 }, providerConfig: { timeout: 6 } })
          .Properties.ServiceConfig.TimeoutSeconds,
      ).toBe(60)
    })
  })

  describe('environment', () => {
    it('merges provider.environment under the entry and sets the entrypoint last', () => {
      expect(
        compile({
          webApp: { environment: { B: '2', A: 'entry' } },
          providerConfig: {
            environment: {
              A: '1',
              PORT: 'x',
              AWS_LAMBDA_NODEJS_ENTRYPOINT: 'other.js',
            },
          },
        }).Properties.ServiceConfig.EnvironmentVariables,
      ).toEqual({
        A: 'entry',
        // A provider-level PORT stays: the bootstrap overrides it at startup.
        PORT: 'x',
        B: '2',
        AWS_LAMBDA_NODEJS_ENTRYPOINT: '__sls_web_bootstrap.mjs',
      })
    })

    it('passes intrinsic values through', () => {
      expect(
        compile({ webApp: { environment: { TABLE: { Ref: 'Table' } } } })
          .Properties.ServiceConfig.EnvironmentVariables.TABLE,
      ).toEqual({ Ref: 'Table' })
    })

    it('points a prebuilt zip at its entry', () => {
      expect(
        compile({ artifact: { key: KEY, entrypoint: 'server.js' } }).Properties
          .ServiceConfig.EnvironmentVariables,
      ).toEqual({ AWS_LAMBDA_NODEJS_ENTRYPOINT: 'server.js' })
    })
  })

  describe('logs', () => {
    it('upper-cases the levels', () => {
      expect(
        compile({
          webApp: {
            logs: { applicationLogLevel: 'debug', systemLogLevel: 'Warn' },
          },
        }).Properties.ServiceConfig.TelemetryConfig,
      ).toEqual({
        LoggingConfig: { ApplicationLogLevel: 'DEBUG', SystemLogLevel: 'WARN' },
      })
    })

    it('omits an unset level', () => {
      expect(
        compile({ webApp: { logs: { applicationLogLevel: 'debug' } } })
          .Properties.ServiceConfig.TelemetryConfig,
      ).toEqual({ LoggingConfig: { ApplicationLogLevel: 'DEBUG' } })
    })

    it('inherits provider.logs.lambda levels, whatever its logFormat', () => {
      expect(
        compile({
          providerConfig: {
            logs: {
              lambda: {
                applicationLogLevel: 'warn',
                systemLogLevel: 'Debug',
                logFormat: 'Text',
              },
            },
          },
        }).Properties.ServiceConfig.TelemetryConfig,
      ).toEqual({
        LoggingConfig: { ApplicationLogLevel: 'WARN', SystemLogLevel: 'DEBUG' },
      })
    })

    it("lets the web app's own level win over the provider's, level by level", () => {
      expect(
        compile({
          webApp: { logs: { applicationLogLevel: 'error' } },
          providerConfig: {
            logs: {
              lambda: { applicationLogLevel: 'WARN', systemLogLevel: 'INFO' },
            },
          },
        }).Properties.ServiceConfig.TelemetryConfig,
      ).toEqual({
        LoggingConfig: { ApplicationLogLevel: 'ERROR', SystemLogLevel: 'INFO' },
      })
    })

    it('omits TelemetryConfig without levels', () => {
      expect(
        compile({ webApp: { logs: {} } }).Properties.ServiceConfig,
      ).not.toHaveProperty('TelemetryConfig')
    })
  })

  describe('execution role', () => {
    const roleOf = (options) => {
      const resource = compile(options)
      return {
        arn: resource.Properties.ServiceConfig.ExecutionRoleArn,
        dependsOn: resource.DependsOn,
      }
    }

    it('uses an entry role ARN', () => {
      expect(
        roleOf({ webApp: { role: 'arn:aws:iam::123456789012:role/web' } }),
      ).toEqual({
        arn: 'arn:aws:iam::123456789012:role/web',
        dependsOn: ['ApiWebFunction'],
      })
    })

    it('resolves an entry role logical name and depends on it', () => {
      expect(roleOf({ webApp: { role: 'WebRole' } })).toEqual({
        arn: { 'Fn::GetAtt': ['WebRole', 'Arn'] },
        dependsOn: ['ApiWebFunction', 'WebRole'],
      })
    })

    it('depends on the role an Fn::GetAtt names', () => {
      expect(
        roleOf({ webApp: { role: { 'Fn::GetAtt': ['WebRole', 'Arn'] } } }),
      ).toEqual({
        arn: { 'Fn::GetAtt': ['WebRole', 'Arn'] },
        dependsOn: ['ApiWebFunction', 'WebRole'],
      })
    })

    it('passes other intrinsics through', () => {
      expect(
        roleOf({ webApp: { role: { 'Fn::ImportValue': 'shared-role' } } }),
      ).toEqual({
        arn: { 'Fn::ImportValue': 'shared-role' },
        dependsOn: ['ApiWebFunction'],
      })
    })

    it('uses an existing provider.iam.role', () => {
      expect(
        roleOf({
          providerConfig: {
            iam: { role: 'arn:aws:iam::123456789012:role/shared' },
          },
        }).arn,
      ).toBe('arn:aws:iam::123456789012:role/shared')
    })

    it('uses the generated role when provider.iam.role has statements', () => {
      expect(
        roleOf({
          providerConfig: { iam: { role: { statements: [] } } },
        }).arn,
      ).toEqual({ 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] })
    })
  })
})

describe('getEffectiveTimeout', () => {
  it.each([
    [{}, {}, 30],
    [{}, { timeout: 6 }, 6],
    [{}, { timeout: '20' }, 20],
    [{ timeout: 60 }, { timeout: 6 }, 60],
    // Lambda's default, as far as the Framework can tell before deploy
    [{}, { timeout: { Ref: 'RequestTimeout' } }, 30],
    [{}, { timeout: 'soon' }, 30],
  ])('webApp %p with provider %p is %p', (webApp, providerConfig, expected) => {
    expect(getEffectiveTimeout(webApp, providerConfig)).toBe(expected)
  })
})
