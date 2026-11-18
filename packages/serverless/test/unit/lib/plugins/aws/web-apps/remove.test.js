import { describe, expect, it, jest } from '@jest/globals'
import {
  findStackWebAppLogGroups,
  removeWebAppLogGroups,
} from '../../../../../../lib/plugins/aws/web-apps/remove.js'
import ServerlessError from '../../../../../../lib/serverless-error.js'
import { givenContext } from './given.js'

/** An error shaped like the ones `provider.request` throws. */
const givenProviderError = (code, message, service = 'CLOUD_WATCH_LOGS') =>
  Object.assign(new ServerlessError(message, `AWS_${service}_${code}`), {
    providerError: { code },
  })

const givenLog = () => ({ debug: jest.fn(), warning: jest.fn() })

const deletedNames = (request) =>
  request.mock.calls.map(([service, method, params]) => {
    expect([service, method]).toEqual(['CloudWatchLogs', 'deleteLogGroup'])
    return params.logGroupName
  })

/** `describeStackResource` answers for a stack holding `resources`, by logical ID. */
const givenStack = (resources) =>
  jest.fn(async (service, method, { StackName, LogicalResourceId }) => {
    expect([service, method, StackName]).toEqual([
      'CloudFormation',
      'describeStackResource',
      'shop-dev',
    ])
    const resource = resources[LogicalResourceId]
    if (!resource) {
      throw givenProviderError(
        'VALIDATION_ERROR',
        `Resource ${LogicalResourceId} does not exist for stack shop-dev`,
        'CLOUD_FORMATION',
      )
    }
    return {
      StackResourceDetail: {
        LogicalResourceId,
        ResourceType: 'AWS::Logs::LogGroup',
        ...resource,
      },
    }
  })

const logGroup = (PhysicalResourceId) => ({ PhysicalResourceId })

describe('findStackWebAppLogGroups', () => {
  it('returns both log groups of every web app the stack holds, as the stack names them', async () => {
    const request = givenStack({
      ApiWebFunctionLogGroup: logGroup('/aws/lambda/web/shop-dev-api'),
      ApiWebFunctionLocalLogGroup: logGroup(
        '/aws/lambda/web/shop-dev-api.local',
      ),
      SiteWebFunctionLogGroup: logGroup('/aws/lambda/web/storefront'),
      SiteWebFunctionLocalLogGroup: logGroup(
        '/aws/lambda/web/storefront.local',
      ),
    })
    const log = givenLog()

    const names = await findStackWebAppLogGroups({
      provider: { request },
      webApps: {
        api: { entry: 'api.js' },
        site: { entry: 'site.js', name: 'storefront' },
      },
      ctx: givenContext(),
      stackName: 'shop-dev',
      log,
    })

    expect(names.sort()).toEqual([
      '/aws/lambda/web/shop-dev-api',
      '/aws/lambda/web/shop-dev-api.local',
      '/aws/lambda/web/storefront',
      '/aws/lambda/web/storefront.local',
    ])
    expect(log.warning).not.toHaveBeenCalled()
  })

  // Another service can name its web app the same: remove deletes only groups
  // its own stack held
  it('returns none when the stack does not exist', async () => {
    const request = jest
      .fn()
      .mockRejectedValue(
        givenProviderError(
          'VALIDATION_ERROR',
          "Stack 'shop-dev' does not exist",
          'CLOUD_FORMATION',
        ),
      )
    const log = givenLog()

    await expect(
      findStackWebAppLogGroups({
        provider: { request },
        webApps: { api: { entry: 'api.js', name: 'storefront' } },
        ctx: givenContext(),
        stackName: 'shop-dev',
        log,
      }),
    ).resolves.toEqual([])
    expect(request).toHaveBeenCalledTimes(2)
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('leaves out a web app the stack does not hold, and a resource that is not a log group', async () => {
    const request = givenStack({
      ApiWebFunctionLogGroup: logGroup('/aws/lambda/web/shop-dev-api'),
      ApiWebFunctionLocalLogGroup: {
        ResourceType: 'AWS::CloudFormation::WaitConditionHandle',
        PhysicalResourceId: 'handle',
      },
    })
    const log = givenLog()

    await expect(
      findStackWebAppLogGroups({
        provider: { request },
        webApps: { api: { entry: 'api.js' }, site: { entry: 'site.js' } },
        ctx: givenContext(),
        stackName: 'shop-dev',
        log,
      }),
    ).resolves.toEqual(['/aws/lambda/web/shop-dev-api'])
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('warns about a lookup that fails otherwise and leaves that log group out', async () => {
    const request = jest.fn(async (service, method, { LogicalResourceId }) => {
      if (LogicalResourceId === 'ApiWebFunctionLocalLogGroup') {
        throw givenProviderError(
          'ACCESS_DENIED',
          'not authorized to perform: cloudformation:DescribeStackResource',
          'CLOUD_FORMATION',
        )
      }
      return {
        StackResourceDetail: {
          ResourceType: 'AWS::Logs::LogGroup',
          PhysicalResourceId: '/aws/lambda/web/shop-dev-api',
        },
      }
    })
    const log = givenLog()

    await expect(
      findStackWebAppLogGroups({
        provider: { request },
        webApps: { api: { entry: 'api.js' } },
        ctx: givenContext(),
        stackName: 'shop-dev',
        log,
      }),
    ).resolves.toEqual(['/aws/lambda/web/shop-dev-api'])
    expect(log.warning.mock.calls).toEqual([
      [
        'Could not check that stack shop-dev holds log group /aws/lambda/web/shop-dev-api.local, so remove will not delete it if Lambda recreates it: not authorized to perform: cloudformation:DescribeStackResource',
      ],
    ])
  })
})

describe('removeWebAppLogGroups', () => {
  const logGroupNames = [
    '/aws/lambda/web/shop-dev-api',
    '/aws/lambda/web/shop-dev-api.local',
  ]

  it('deletes exactly the log groups it is given', async () => {
    const request = jest.fn().mockResolvedValue({})
    const log = givenLog()

    await removeWebAppLogGroups({ provider: { request }, logGroupNames, log })

    expect(deletedNames(request).sort()).toEqual(logGroupNames)
    expect(request.mock.calls.every((call) => call.length === 3)).toBe(true)
    expect(log.debug).toHaveBeenCalledWith(
      'Deleted log group /aws/lambda/web/shop-dev-api',
    )
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('treats a log group that does not exist as removed', async () => {
    const request = jest
      .fn()
      .mockRejectedValue(
        givenProviderError(
          'ResourceNotFoundException',
          'The specified log group does not exist.',
        ),
      )
    const log = givenLog()

    await expect(
      removeWebAppLogGroups({ provider: { request }, logGroupNames, log }),
    ).resolves.toBeUndefined()

    expect(request).toHaveBeenCalledTimes(2)
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('warns about any other failure and still deletes the rest', async () => {
    const request = jest.fn(async (service, method, { logGroupName }) => {
      if (logGroupName.endsWith('.local')) {
        throw givenProviderError(
          'AccessDeniedException',
          'not authorized to perform: logs:DeleteLogGroup',
        )
      }
      return {}
    })
    const log = givenLog()

    await expect(
      removeWebAppLogGroups({ provider: { request }, logGroupNames, log }),
    ).resolves.toBeUndefined()

    expect(deletedNames(request).sort()).toEqual(logGroupNames)
    expect(log.warning.mock.calls).toEqual([
      [
        'Could not delete log group /aws/lambda/web/shop-dev-api.local: not authorized to perform: logs:DeleteLogGroup',
      ],
    ])
    expect(log.debug).toHaveBeenCalledWith(
      'Deleted log group /aws/lambda/web/shop-dev-api',
    )
  })
})
