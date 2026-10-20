import { describe, expect, it, jest } from '@jest/globals'
import AwsLogsWebApp from '../../../../../lib/plugins/aws/logs-web-app.js'

const makePlugin = ({
  options,
  webApps = { api: {} },
  describeLogStreams = async () => ({
    logStreams: [{ logStreamName: 'stream-1' }],
  }),
} = {}) => {
  const request = jest.fn(async (service, method, params) => {
    if (method === 'describeLogStreams') return describeLogStreams(params)
    if (method === 'filterLogEvents') {
      return {
        events: [{ timestamp: 1, message: 'hello from the web app' }],
      }
    }
    throw new Error(`unexpected ${service}.${method}`)
  })
  const serverless = {
    service: { service: 'shop', webApps, provider: {} },
    configurationInput: { webApps },
    getProvider: () => ({
      request,
      getStage: () => 'dev',
      getRegion: () => 'us-east-1',
    }),
  }
  const logger = { aside: jest.fn(), notice: jest.fn(), blankLine: jest.fn() }
  const progress = { notice: jest.fn(), remove: jest.fn() }
  const plugin = new AwsLogsWebApp(serverless, options, {
    log: logger,
    progress,
  })
  return { plugin, request, logger }
}

describe('logs --web-app', () => {
  it('does nothing without --web-app', async () => {
    const { plugin, request } = makePlugin({ options: { function: 'hello' } })
    await plugin.hooks['logs:logs']()
    expect(request).not.toHaveBeenCalled()
  })

  it('names the web apps when the name is unknown', async () => {
    const { plugin } = makePlugin({ options: { 'web-app': 'nope' } })
    await expect(plugin.hooks['logs:logs']()).rejects.toMatchObject({
      code: 'WEB_APPS_NOT_FOUND',
      stack: undefined,
      message: 'No web app named "nope" in this service. Web apps: api.',
    })
  })

  it("reads the web app's .local log group through the functions path", async () => {
    const { plugin, request, logger } = makePlugin({
      options: { 'web-app': 'api', filter: 'ERROR' },
    })
    await plugin.hooks['logs:logs']()
    expect(request).toHaveBeenCalledWith(
      'CloudWatchLogs',
      'describeLogStreams',
      expect.objectContaining({
        logGroupName: '/aws/lambda/web/shop-dev-api.local',
      }),
    )
    expect(request).toHaveBeenCalledWith(
      'CloudWatchLogs',
      'filterLogEvents',
      expect.objectContaining({
        logGroupName: '/aws/lambda/web/shop-dev-api.local',
        logStreamNames: ['stream-1'],
        filterPattern: 'ERROR',
      }),
    )
    expect(logger.notice).toHaveBeenCalledWith('hello from the web app')
  })

  it("leaves the command's options as they were", async () => {
    const options = { 'web-app': 'api' }
    const { plugin } = makePlugin({ options })
    await plugin.hooks['logs:logs']()
    expect(options).toEqual({ 'web-app': 'api' })
  })

  it('--tail polls the .local group again, keeping its paging state off the options', async () => {
    const options = { 'web-app': 'api', tail: true, interval: 1 }
    const stop = new Error('stop polling')
    let lookups = 0
    const { plugin, request } = makePlugin({
      options,
      describeLogStreams: async () => {
        lookups += 1
        if (lookups > 1) throw stop
        return { logStreams: [{ logStreamName: 'stream-1' }] }
      },
    })
    await expect(plugin.hooks['logs:logs']()).rejects.toBe(stop)
    expect(
      request.mock.calls.filter(
        ([, method]) => method === 'describeLogStreams',
      ),
    ).toEqual([
      expect.arrayContaining([
        expect.objectContaining({
          logGroupName: '/aws/lambda/web/shop-dev-api.local',
        }),
      ]),
      expect.arrayContaining([
        expect.objectContaining({
          logGroupName: '/aws/lambda/web/shop-dev-api.local',
        }),
      ]),
    ])
    expect(options).toEqual({ 'web-app': 'api', tail: true, interval: 1 })
  })

  const NO_LOGS = {
    code: 'NO_EXISTING_LOG_STREAMS',
    message:
      'No logs yet for web app "api". Send it a request, then run this command again.',
    stack: undefined,
  }

  it('a .local group without streams: no logs yet, naming the web app', async () => {
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      describeLogStreams: async () => ({ logStreams: [] }),
    })
    await expect(plugin.hooks['logs:logs']()).rejects.toMatchObject(NO_LOGS)
  })

  it('a .local group that does not exist yet: the same message', async () => {
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      describeLogStreams: async () => {
        throw Object.assign(
          new Error('The specified log group does not exist.'),
          { providerError: { code: 'ResourceNotFoundException' } },
        )
      },
    })
    await expect(plugin.hooks['logs:logs']()).rejects.toMatchObject(NO_LOGS)
  })

  it('other lookup failures pass through unchanged', async () => {
    const original = new Error('AccessDeniedException')
    const { plugin } = makePlugin({
      options: { 'web-app': 'api' },
      describeLogStreams: async () => {
        throw original
      },
    })
    await expect(plugin.hooks['logs:logs']()).rejects.toBe(original)
  })

  it('uses the name the web app sets', async () => {
    const { plugin, request } = makePlugin({
      options: { 'web-app': 'api' },
      webApps: { api: { name: 'storefront' } },
    })
    await plugin.hooks['logs:logs']()
    expect(request).toHaveBeenCalledWith(
      'CloudWatchLogs',
      'describeLogStreams',
      expect.objectContaining({
        logGroupName: '/aws/lambda/web/storefront.local',
      }),
    )
  })
})
