import { describe, it, expect, jest } from '@jest/globals'

const logger = {
  notice: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
  aside: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}
jest.unstable_mockModule('@serverless/util', () => ({
  log: Object.assign(jest.fn(), { ...logger, get: () => logger }),
  progress: { get: () => ({ notice: jest.fn(), remove: jest.fn() }) },
  style: { aside: (s) => s },
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
}))

const { default: AwsRollback } =
  await import('../../../../../lib/plugins/aws/rollback.js')
const { devModeCommandHooks, restoreStageBeforeCommand } =
  await import('../../../../../lib/plugins/aws/dev/attach/commands.js')
const { fakeLambda, fakeLog } = await import('./dev/attach/fakes.js')

const TIMESTAMP = '1790000000000'
const DIRECTORY = `${TIMESTAMP}-${new Date(Number(TIMESTAMP)).toISOString()}`
const DEV_LAYER =
  'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:1'

/**
 * Runs the `rollback` lifecycle the way the plugin manager does: per event, every plugin's
 * before hook, then at, then after, in plugin order (Dev Mode is registered before rollback).
 */
const runRollback = async (plugins) => {
  for (const event of ['initialize', 'rollback']) {
    for (const phase of ['before:', '', 'after:']) {
      for (const plugin of plugins) {
        const hook = plugin.hooks[`${phase}rollback:${event}`]
        if (hook) await hook()
      }
    }
  }
}

const setup = (options) => {
  const calls = []
  const provider = {
    getStage: () => 'dev',
    getRegion: () => 'us-east-1',
    getDeploymentPrefix: () => 'serverless',
    getServerlessDeploymentBucketName: async () => 'deploy-bucket',
    naming: {
      getCompiledTemplateS3Suffix: () =>
        'compiled-cloudformation-template.json',
      getServiceStateFileName: () => 'serverless-state.json',
    },
    async request(service, method, params) {
      calls.push(`${service}.${method}`)
      if (method === 'listObjectsV2') {
        expect(params).toEqual({
          Bucket: 'deploy-bucket',
          Prefix: 'serverless/svc/dev',
        })
        return {
          Contents: [
            {
              Key: `serverless/svc/dev/${DIRECTORY}/compiled-cloudformation-template.json`,
            },
          ],
        }
      }
      throw Object.assign(new Error('no state file'), {
        code: 'AWS_S3_GET_OBJECT_NO_SUCH_KEY',
      })
    },
  }
  const serverless = {
    serviceDir: '/service',
    service: {
      service: 'svc',
      package: {},
      getAllFunctions: () => ['api'],
      getFunction: () => ({ name: 'svc-dev-api' }),
    },
    getProvider: () => provider,
    pluginManager: {
      commandRunStartTime: Date.now(),
      spawn: async (name) => calls.push(`spawn ${name}`),
    },
  }
  // api was left in Dev Mode by a session that was killed.
  const lambda = fakeLambda({
    'svc-dev-api': {
      Layers: [{ Arn: DEV_LAYER }],
      Environment: {
        Variables: {
          AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
          SLS_DEV_SESSION: 's_old',
        },
      },
    },
  })
  const rollback = new AwsRollback(serverless, options)
  rollback.updateStack = async () => {
    calls.push('updateStack')
    return true
  }
  const dev = {
    hooks: devModeCommandHooks({
      commandName: 'rollback',
      options,
      handlers: {
        setup: async () => {},
        restore: async () => {},
        restoreStage: (verb) => async () => {
          await restoreStageBeforeCommand({
            serverless,
            provider,
            verb,
            timestamp: options.timestamp,
            deps: { clients: { lambda }, logger: fakeLog() },
          })
          if (lambda.state.get('svc-dev-api').Layers.length === 0) {
            calls.push('restored')
          }
        },
        restoreFunction: async () => {},
      },
    }),
  }
  return {
    calls,
    lambda,
    serverless,
    run: () => runRollback([dev, rollback]),
  }
}

describe('rollback and the Dev Mode restore', () => {
  it('keeps the rollback lifecycle hooks of the core plugin', () => {
    expect(
      Object.keys(new AwsRollback(setup({}).serverless, {}).hooks),
    ).toEqual(['before:rollback:initialize', 'rollback:rollback'])
  })

  it('a rollback without --timestamp only lists deployments and restores nothing', async () => {
    const s = setup({})
    await s.run()
    expect(s.calls).toEqual(['spawn deploy:list'])
    expect(s.lambda.calls).toEqual([])
  })

  it('a rollback to a timestamp with no deployment fails, and Dev Mode restores nothing', async () => {
    const s = setup({ timestamp: '1700000000000' })
    await expect(s.run()).rejects.toMatchObject({
      code: 'ROLLBACK_DEPLOYMENT_NOT_FOUND',
    })
    expect(s.calls).toEqual(['S3.listObjectsV2', 'S3.listObjectsV2'])
    expect(s.lambda.state.get('svc-dev-api').Layers).toEqual([
      { Arn: DEV_LAYER },
    ])
  })

  it('a rollback to a deployment restores Dev Mode functions before the stack update', async () => {
    const s = setup({ timestamp: TIMESTAMP })
    await s.run()
    expect(s.calls).toEqual([
      'S3.listObjectsV2',
      'restored',
      'S3.listObjectsV2',
      'S3.getObject',
      'updateStack',
    ])
    expect(s.serverless.service.package.artifactDirectoryName).toBe(
      `serverless/svc/dev/${DIRECTORY}`,
    )
  })
})
