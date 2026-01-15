import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import url from 'url'
import { log, progress } from '@serverless/util'
import { variables } from '../../src/lib/resolvers/index.js'
import { getRunner, route } from '../../src/lib/router.js'
import { jest } from '@jest/globals'
import fsextra from 'fs-extra'
import { AbstractProvider } from '../../src/lib/resolvers/providers/index.js'
import { providerRegistry } from '../../src/lib/resolvers/registry/index.js'
import cloudformationSchema from '../../src/utils/fs/cloudformation-schema.js'
import { Sls } from '../../src/lib/resolvers/providers/sls/sls.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('resolve variables and parameters', () => {
  let originalEnv

  beforeAll(async () => {
    originalEnv = {
      ...process.env,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: process.env.SERVERLESS_ACCESS_KEY_DEV,
    }
    process.env = originalEnv
  })

  beforeEach(() => {
    // Store original environment variables
    originalEnv = process.env
  })

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  const runTest = async (configFileDirPath, options, env = process.env) => {
    process.env = env
    try {
      const serviceConfigFilePath = path.join(
        configFileDirPath,
        'serverless.yml',
      )

      providerRegistry.register('example', ExampleResolverProvider)

      const logger = log.get('test:resolve-variables')

      const { runner } = await getRunner({
        logger,
        command: ['print'],
        options: { ...options, c: serviceConfigFilePath },
        versions: { serverless_framework: '0.0.0' },
      })

      await runner.resolveVariablesAndAuthenticate()
      await runner.resolveVariables()

      // Load the golden file
      const goldenFilePath = path.join(
        configFileDirPath,
        'resolved-serverless.yml',
      )
      const goldenFile = yaml.load(fs.readFileSync(goldenFilePath, 'utf8'), {
        schema: cloudformationSchema,
      })

      // Compare the result with the golden file
      expect(runner.config).toEqual(goldenFile)
    } catch (error) {
      expect(error).toBeUndefined()
    }
  }

  const runComposeTest = async ({
    configFileDirPath,
    options = {},
    errorToExpect,
  }) => {
    // Define the arguments for the route function
    const args = {
      command: ['print'],
      options: {
        ...options,
        c: path.join(configFileDirPath, 'serverless-compose.yml'),
      },
    }

    providerRegistry.register('example', ExampleResolverProvider)

    const originalStderr = { write: process.stderr.write }
    const chunks = []
    jest.spyOn(process.stderr, 'write').mockImplementation((...args) => {
      for (const arg of args) {
        if (typeof arg === 'string') {
          chunks.push(arg)
        }
      }
      originalStderr.write(...args)
    })

    // Spy on the resolveServiceConfig function without changing its implementation
    const spy = jest.spyOn(variables, 'createResolverManager')

    await route(args)
    progress.cleanup()

    // route function doesn't throw an error, so we need to check the console output
    // to see if the expected error message was printed
    if (errorToExpect) {
      expect(
        chunks.some((chunk) => chunk.toString().includes(errorToExpect)),
      ).toBeTruthy()
      return
    }

    // Check that the resolveServiceConfig function was called 4 times
    // (once for each service in the compose file and once for the compose file itself)
    expect(spy).toHaveBeenCalledTimes(4)

    // For each call to resolveServiceConfig, check that the resolved service config
    // matches the golden file
    spy.mock.calls.forEach((callArgs, index) => {
      // Load the golden file
      const goldenFilePath = path.join(
        callArgs[0].configFileDirPath,
        'resolved-serverless.yml',
      )
      const goldenFile = yaml.load(fs.readFileSync(goldenFilePath, 'utf8'))
      // Compare the result with the golden file
      expect(callArgs[0].serviceConfigFile).toEqual(goldenFile)
    })
  }

  describe('validate', () => {
    const dirPath = path.join(__dirname, 'validate')
    it('params and stages are not used together', async () => {
      await expect(
        runTest(path.join(dirPath, 'params-and-stages')),
      ).rejects.toThrow(
        '"params" and "stages" cannot be used together in the top-level of serverless.yml.If you want to define params, use the "params" key in the "stages" block.',
      )
    })
    it('cycle', async () => {
      await expect(runTest(path.join(dirPath, 'cycle'))).rejects.toThrow(
        'Cyclic reference found: ${self:custom.name1} -> ${self:custom.name3} -> ${self:custom.name2}',
      )
    })
  })

  describe('env', () => {
    const dirPath = path.join(__dirname, 'env')
    it('resolve environment variable set programmatically', async () => {
      process.env = { ...originalEnv, FUNC_PREFIX: 'foo', FUNC_SUFFIX: 'bar' }
      await runTest(path.join(dirPath, 'simple'))
    })

    it('resolve environment variable set in .env file', async () => {
      process.env = {
        ...originalEnv,
        SHOULD_BE_OVERWRITTEN_BY_SYSTEM_ENV: 'system-value',
      }
      await runTest(path.join(dirPath, 'dotenv'), { stage: 'foo', s: 'foo' })
    })

    it('resolve environment variable set in .env file without stage provided in options', async () => {
      await runTest(path.join(dirPath, 'dotenv-without-stage-option'))
    })

    it('resolve environment variable in org, app, service, region', async () => {
      process.env = {
        ...originalEnv,
        FOO: 'bar',
        ONE: '1',
        ACCOUNT: 'account',
        TEST: 'test',
      }
      await runTest(path.join(dirPath, 'org-app-service-region'))
    })
  })

  describe('opt', () => {
    const dirPath = path.join(__dirname, 'opt')
    it('resolve options', async () => {
      const options = { prefix: 'foo', suffix: 'bar', stage: 'sit' }
      await runTest(path.join(dirPath, 'simple'), options)
    })
  })

  describe('self', () => {
    const dirPath = path.join(__dirname, 'self')
    it('resolve self reference', async () => {
      await runTest(path.join(dirPath, 'simple'))
    })
    it('bracket in string', async () => {
      await runTest(path.join(dirPath, 'bracket-in-string'))
    })
    it('array', async () => {
      await runTest(path.join(dirPath, 'array'))
    })
    it('placeholder in resolved value', async () => {
      await runTest(path.join(dirPath, 'placeholder-in-resolved-value'))
    })
    it('resolve to non string', async () => {
      await runTest(path.join(dirPath, 'resolve-to-non-string'))
    })
    it('variable with default is a dependency', async () => {
      await runTest(path.join(dirPath, 'literal-value-is-dependency'))
    })
    it('combined', async () => {
      await runTest(path.join(dirPath, 'combined'))
    })
  })

  describe('file', () => {
    const dirPath = path.join(__dirname, 'file')
    it('resolve key in JSON file', async () => {
      await runTest(path.join(dirPath, 'simple'))
    })
    it('variables in file', async () => {
      await runTest(path.join(dirPath, 'variables-in-file'), { stage: 'Dev' })
    })
    it('cloudformation format', async () => {
      await runTest(path.join(dirPath, 'cloudformation'))
    })
    it('params in file', async () => {
      await runTest(path.join(dirPath, 'params-in-file'))
    })
  })

  describe('param', () => {
    const dirPath = path.join(__dirname, 'param')

    it('resolve local parameter', async () => {
      await runTest(path.join(dirPath, 'simple'), {
        param: ['fromCli=baz'],
        region: 'eu-north-1',
      })
    })
    it('resolve multiple CLI parameters', async () => {
      await runTest(path.join(dirPath, 'multiple-cli-params'), {
        param: ['prefix=foo', 'suffix=bar'],
      })
    })
    it('stage parameter overrides default', async () => {
      await runTest(path.join(dirPath, 'stage-override'), { stage: 'prod' })
    })
    it('resolve dashboard parameter', async () => {
      const options = { prefix: 'devs', suffix: 'dev' }
      await runTest(path.join(dirPath, 'dashboard-param'), options)
    })
    it('override dashboard parameter with local', async () => {
      await runTest(path.join(dirPath, 'dashboard-param-override'))
    })
    it('resolver in param', async () => {
      process.env = { ...originalEnv, FOO: 'foo' }
      await runTest(path.join(dirPath, 'resolver-in-param'))
    })
    it('custom resolver in param', async () => {
      process.env = { ...originalEnv, FOO: 'foo' }
      await runTest(path.join(dirPath, 'custom-resolver-in-param'))
    })
  })

  describe('custom', () => {
    const dirPath = path.join(__dirname, 'custom')
    it('simple', async () => {
      await runTest(path.join(dirPath, 'simple'))
    })
    it('resolve custom resolvers dependent on each other', async () => {
      await runTest(path.join(dirPath, 'dependency'), {
        handlerName: 'hello',
        stage: 'prod',
      })
    })
    it('resolve custom resolvers dependent on each other in other stages', async () => {
      await runTest(path.join(dirPath, 'dependency-in-other-stage'), {
        handlerName: 'hello',
        stage: 'prod',
      })
    })
    it('resolve custom resolvers in parallel groups', async () => {
      await runTest(path.join(dirPath, 'multiple-dependency-groups'))
    })
    it('resolver in specific stage block overrides resolver in default stage', async () => {
      await runTest(path.join(dirPath, 'stage-override-default'), {})
    })
  })

  describe('compose', () => {
    const dirPath = path.join(__dirname, 'compose')
    it('use compose resolvers in service config file', async () => {
      await runComposeTest({
        configFileDirPath: path.join(dirPath, 'compose-resolvers-are-shared'),
      })
    })
    it('use compose params in service config file', async () => {
      await runComposeTest({
        configFileDirPath: path.join(dirPath, 'compose-params-are-shared'),
      })
    })
    it('children do not share resolvers', async () => {
      await runComposeTest({
        configFileDirPath: path.join(
          dirPath,
          'children-do-not-share-resolvers',
        ),
        errorToExpect: 'Provider service-a-resolver is not supported',
      })
      process.exitCode = 0
    })
    it('compose resolvers are overridden by local resolvers', async () => {
      await runComposeTest({
        configFileDirPath: path.join(
          dirPath,
          'compose-resolvers-are-overridden',
        ),
      })
    })
    it('combined', async () => {
      await runComposeTest({
        configFileDirPath: path.join(dirPath, 'combined'),
        options: { stage: 'sit' },
      })
    })
  })

  describe('nested', () => {
    const dirPath = path.join(__dirname, 'nested')
    it('resolve nested placeholder', async () => {
      await runTest(path.join(dirPath, 'simple'), { stage: 'sit', s: 'sit' })
    })
    it('resolve nested placeholder with legacy format', async () => {
      const options = {
        key: 'prefix',
        'ssm-param': '/resolvers/sample-param',
        region: 'us-east-1',
        filename: 'test.txt',
      }
      await runTest(path.join(dirPath, 'legacy'), options)
    })
  })

  describe('legacy', () => {
    const dirPath = path.join(__dirname, 'legacy')
    describe('legacy files', () => {
      const legacyFileDirPath = path.join(dirPath, 'file')
      it('resolve key in JSON file', async () => {
        await runTest(path.join(legacyFileDirPath, 'simple-json'))
      })
      it('resolve key in YAML file', async () => {
        await runTest(path.join(legacyFileDirPath, 'simple-yaml'))
      })
      it('multiple resources files', async () => {
        await runTest(path.join(legacyFileDirPath, 'resources'))
      })
      it('default value', async () => {
        await runTest(path.join(legacyFileDirPath, 'default-value'))
      })
      describe('js', () => {
        const jsDirPath = path.join(legacyFileDirPath, 'js')
        describe('esm', () => {
          const esmDirPath = path.join(jsDirPath, 'esm')
          it('object export', async () => {
            await runTest(path.join(esmDirPath, 'object-export'))
          })
          it('function export', async () => {
            await runTest(path.join(esmDirPath, 'function-export'))
          })
          it('function export with resolveVariable', async () => {
            await runTest(
              path.join(esmDirPath, 'function-export-with-resolveVariable'),
            )
          })
          it('function export with resolveConfigurationProperty', async () => {
            await runTest(
              path.join(
                esmDirPath,
                'function-export-with-resolveConfigurationProperty',
              ),
              { option1: 'option1-value' },
            )
          })
        })
        describe('commonjs', () => {
          const commonjsDirPath = path.join(jsDirPath, 'commonjs')
          it('object export named', async () => {
            await runTest(path.join(commonjsDirPath, 'object-export-named'))
          })
          it('object export default', async () => {
            await runTest(path.join(commonjsDirPath, 'object-export-default'))
          })
          it('function export', async () => {
            await runTest(path.join(commonjsDirPath, 'function-export'))
          })
          it('function export with resolveConfigurationProperty and resolveVariable', async () => {
            await runTest(
              path.join(
                commonjsDirPath,
                'function-export-with-resolveConfigurationProperty',
              ),
              { region: 'us-east-1', stage: 'other' },
            )
          })
        })
      })
    })
    describe('legacy param', () => {
      const legacyParamsDirPath = path.join(dirPath, 'param')
      it('resolve local parameter', async () => {
        await runTest(path.join(legacyParamsDirPath, 'simple'))
      })
    })
    describe('legacy ssm', () => {
      const legacySsmDirPath = path.join(dirPath, 'ssm')
      it('resolve SSM parameter using legacy format', async () => {
        await runTest(path.join(legacySsmDirPath, 'simple'))
      })
      it('resolve SSM parameter using legacy format with raw param', async () => {
        await runTest(path.join(legacySsmDirPath, 'raw'))
      })
      it('resolve SSM parameter using legacy format without decryption', async () => {
        await runTest(path.join(legacySsmDirPath, 'no-decrypt'))
      })
    })
    describe('legacy s3', () => {
      const legacyS3DirPath = path.join(dirPath, 's3')
      it('resolve S3 parameter using legacy format', async () => {
        await runTest(path.join(legacyS3DirPath, 'simple'))
      })
    })
    describe('legacy cloudformation', () => {
      const legacyCfDirPath = path.join(dirPath, 'cloudformation')
      it('resolve CloudFormation output using legacy format', async () => {
        await runTest(path.join(legacyCfDirPath, 'simple'))
      })
    })
    describe('legacy str-to-bool', () => {
      const legacyStrToBoolDirPath = path.join(dirPath, 'str-to-bool')
      it('resolve string to boolean using legacy format', async () => {
        await runTest(path.join(legacyStrToBoolDirPath, 'simple'))
      })
    })
  })

  describe('aws', () => {
    const awsDirPath = path.join(__dirname, 'aws')
    it('resolve region', async () => {
      const { AWS_REGION, ...envWithoutRegion } = originalEnv
      await runTest(path.join(awsDirPath, 'region'), {}, envWithoutRegion)
    })
    it('resolve accountid', async () => {
      const { AWS_REGION, ...envWithoutRegion } = originalEnv
      await runTest(path.join(awsDirPath, 'accountid'), {}, envWithoutRegion)
    })
    describe('s3', () => {
      const dirPath = path.join(awsDirPath, 's3')
      it('bucket name and object key in variable', async () => {
        await runTest(path.join(dirPath, 'bucket-name-object-key-in-variable'))
      })
      it('s3 uri', async () => {
        await runTest(path.join(dirPath, 's3-uri'))
      })
      it('s3 arn', async () => {
        await runTest(path.join(dirPath, 's3-arn'))
      })
      it('bucket name in config', async () => {
        await runTest(path.join(dirPath, 'bucket-name-in-config'))
      })
      it('bucket name and object key in config', async () => {
        await runTest(path.join(dirPath, 'bucket-name-object-key-in-config'))
      })
    })
    describe('ssm', () => {
      const dirPath = path.join(awsDirPath, 'ssm')
      it('default', async () => {
        await runTest(path.join(dirPath, 'default'))
      })
      it('raw', async () => {
        await runTest(path.join(dirPath, 'raw'))
      })
      it('no decrypt', async () => {
        await runTest(path.join(dirPath, 'no-decrypt'))
      })
    })
    describe('cloudformation', () => {
      const dirPath = path.join(awsDirPath, 'cloudformation')
      it('default', async () => {
        await runTest(path.join(dirPath, 'default'))
      })
    })
  })

  // Ignored because it can be executed locally but not in CI
  // because it fails in the CI with the following error:
  // Command failed: git config user.email
  xdescribe('git', () => {
    const dirPath = path.join(__dirname, 'git')
    it('resolve git variables', async () => {
      await fsextra.copy(
        path.join(dirPath, 'simple', 'fixture', 'git'),
        path.join(dirPath, 'simple', '.git'),
      )
      await runTest(path.join(dirPath, 'simple'))
    })
  })

  describe('sls', () => {
    Sls.instanceId = '1704067200000'
    const dirPath = path.join(__dirname, 'sls')
    it('stage in options', async () => {
      await runTest(path.join(dirPath, 'stage-in-opts'), { stage: 'oat' })
    })
    it('stage in service config', async () => {
      await runTest(path.join(dirPath, 'stage-in-config-file'))
    })
  })

  describe('str-to-bool', () => {
    const dirPath = path.join(__dirname, 'str-to-bool')
    it('resolve string to boolean', async () => {
      await runTest(path.join(dirPath, 'simple'))
    })
  })

  describe('fallback', () => {
    const dirPath = path.join(__dirname, 'fallback')
    it('simple fallback', async () => {
      await runTest(path.join(dirPath, 'simple'))
    })
    it('fallback in stage', async () => {
      await runTest(
        path.join(dirPath, 'stage'),
        {},
        { ...originalEnv, NAME: 'john' },
      )
    })
  })

  describe('output', () => {
    const dirPath = path.join(__dirname, 'output')
    it('simple', async () => {
      await runTest(path.join(dirPath, 'simple'))
    })
  })

  // Ignored because it can be executed locally but not in CI
  // because it requires multiple AWS profiles to be set up
  xdescribe('credentials resolver', () => {
    const dirPath = path.join(__dirname, 'credentials-resolver')
    it('default', async () => {
      await runTest(path.join(dirPath, 'default'))
    })
    it('provider profile', async () => {
      await runTest(path.join(dirPath, 'provider-profile'))
    })
    it('provider profile overridden with CLI option', async () => {
      await runTest(
        path.join(dirPath, 'provider-profile-cli-option-override'),
        {
          'aws-profile': 'acc2',
        },
      )
    })
    it('single aws resolver', async () => {
      await runTest(path.join(dirPath, 'single-aws-resolver'))
    })
    it('when both provider profile and aws resolver are defined provider profile is used', async () => {
      await runTest(path.join(dirPath, 'provider-profile-aws-resolver'))
    })
    it('when provider profile and aws named resolver are defined provider profile is used for deployment and aws resolver for variables', async () => {
      await runTest(path.join(dirPath, 'provider-profile-aws-named-resolver'))
    })
    it('two aws resolvers', async () => {
      await expect(
        runTest(path.join(dirPath, 'two-aws-resolvers')),
      ).rejects.toThrow(
        'Multiple resolvers with type "aws" found. Please specify the credential provider to use for deployment in the provider.resolver key.',
      )
    })
    it('provider resolver', async () => {
      await runTest(path.join(dirPath, 'provider-resolver'))
    })
    it('provider profile and provider resolver', async () => {
      await expect(
        runTest(path.join(dirPath, 'provider-profile-provider-resolver')),
      ).rejects.toThrow(
        'Error: The provider.profile and provider.resolver cannot be set at the same time',
      )
    })
    it('dashboard', async () => {
      await runTest(path.join(dirPath, 'dashboard'))
    })
    it('dashboard is used when provider profile is defined', async () => {
      await runTest(path.join(dirPath, 'dashboard-provider-profile'))
    })
    it('dashboard is used when single aws resolver is defined', async () => {
      await runTest(path.join(dirPath, 'dashboard-single-aws-resolver'))
    })
    it('dashboard is used when single aws resolver with profile is defined', async () => {
      await runTest(
        path.join(dirPath, 'dashboard-single-aws-resolver-with-profile'),
      )
    })
    it('aws resolver is used when dashboard and single aws resolver with dashboard disabled', async () => {
      await runTest(
        path.join(dirPath, 'dashboard-single-aws-resolver-dashboard-disabled'),
      )
    })
    it('dashboard is used when provider resolver is defined', async () => {
      await runTest(path.join(dirPath, 'dashboard-provider-resolver'))
    })
  })
})

class ExampleResolverProvider extends AbstractProvider {
  static type = 'example'
  static resolvers = ['vault', 's3']
  static defaultResolver = 'vault'

  static validateConfig(providerConfig) {}

  resolveVariable({ resolverType, resolutionDetails, key }) {
    super.resolveVariable({ resolverType, resolutionDetails, key })

    if (resolverType === 'vault') {
      return resolveVariableFromVault(
        this.credentials,
        resolutionDetails,
        key,
        this.config,
      )
    } else if (resolverType === 's3') {
      return resolveVariableFromS3(
        this.credentials,
        resolutionDetails,
        key,
        this.config,
      )
    }
    throw new Error(`Resolver ${resolverType} is not supported`)
  }
}

const resolveVariableFromVault = (
  credentials,
  resolutionDetails,
  key,
  providerConfig,
) => {
  return `vault-${providerConfig.option1}`
}

const resolveVariableFromS3 = (credentials, resolutionDetails, key) => {
  return `vault-s3-${key}`
}
