'use strict'

import { jest } from '@jest/globals'

import AwsLogs from '../../../../../lib/plugins/aws/logs.js'

function buildHarness({
  functions = {},
  stage = 'dev',
  region = 'us-east-1',
  logGroupClass,
} = {}) {
  const provider = {
    naming: {
      getLogGroupName: jest.fn((name, options = {}) => {
        const classSuffix =
          options.logGroupClass === 'INFREQUENT_ACCESS' ? '-ia' : ''
        return `/aws/lambda/${name}${classSuffix}`
      }),
    },
    getStage: jest.fn(() => stage),
    getRegion: jest.fn(() => region),
    getLogGroupClass: jest.fn(() => logGroupClass),
  }

  const serverless = {
    serviceDir: '/tmp/svc',
    service: {
      getFunction: jest.fn((name) => functions[name]),
    },
    getProvider: jest.fn(() => provider),
  }

  const pluginUtils = {
    log: { aside: jest.fn(), notice: jest.fn(), blankLine: jest.fn() },
    progress: { notice: jest.fn(), remove: jest.fn() },
  }

  return { serverless, provider, pluginUtils }
}

function makeLogsPlugin(options = {}) {
  const { serverless, pluginUtils } = buildHarness()
  return new AwsLogs(serverless, options, pluginUtils)
}

describe('AwsLogs', () => {
  describe('hooks[logs:logs]', () => {
    test('throws when no --function, --agent, or --sandbox is provided', async () => {
      const inst = makeLogsPlugin({})
      await expect(inst.hooks['logs:logs']()).rejects.toThrow(
        /--function.*--agent.*--sandbox/,
      )
    })

    test('does not throw when only --sandbox is provided', async () => {
      const inst = makeLogsPlugin({ sandbox: 'echo' })
      await expect(inst.hooks['logs:logs']()).resolves.toBeUndefined()
    })

    test('does not throw when only --agent is provided (regression guard)', async () => {
      const inst = makeLogsPlugin({ agent: 'my-agent' })
      await expect(inst.hooks['logs:logs']()).resolves.toBeUndefined()
    })
  })

  describe('extendedValidate', () => {
    test('resolves the AWS-default Lambda log group name from the function name', () => {
      const { serverless, provider, pluginUtils } = buildHarness({
        functions: {
          hello: { name: 'my-service-dev-hello' },
        },
      })
      const options = { function: 'hello' }

      const instance = new AwsLogs(serverless, options, pluginUtils)
      instance.extendedValidate()

      expect(options.logGroupName).toBe('/aws/lambda/my-service-dev-hello')
      expect(provider.naming.getLogGroupName).toHaveBeenCalled()
      expect(provider.naming.getLogGroupName.mock.calls[0][0]).toBe(
        'my-service-dev-hello',
      )
    })

    test('sets a default polling interval when none is provided', () => {
      const { serverless, pluginUtils } = buildHarness({
        functions: {
          hello: { name: 'my-service-dev-hello' },
        },
      })
      const options = { function: 'hello' }

      const instance = new AwsLogs(serverless, options, pluginUtils)
      instance.extendedValidate()

      expect(options.interval).toBe(1000)
    })

    test('preserves a user-supplied polling interval', () => {
      const { serverless, pluginUtils } = buildHarness({
        functions: {
          hello: { name: 'my-service-dev-hello' },
        },
      })
      const options = { function: 'hello', interval: 250 }

      const instance = new AwsLogs(serverless, options, pluginUtils)
      instance.extendedValidate()

      expect(options.interval).toBe(250)
    })

    test('throws a helpful error when the function uses INFREQUENT_ACCESS', () => {
      const { serverless, pluginUtils } = buildHarness({
        functions: {
          hello: { name: 'my-service-dev-hello' },
        },
        logGroupClass: 'INFREQUENT_ACCESS',
      })
      const options = { function: 'hello' }

      const instance = new AwsLogs(serverless, options, pluginUtils)
      expect(() => instance.extendedValidate()).toThrow(
        /INFREQUENT_ACCESS.*Logs Insights/i,
      )
    })

    test('the IA error message names the actual IA log group', () => {
      const { serverless, pluginUtils } = buildHarness({
        functions: {
          hello: { name: 'my-service-dev-hello' },
        },
        logGroupClass: 'INFREQUENT_ACCESS',
      })
      const options = { function: 'hello' }

      const instance = new AwsLogs(serverless, options, pluginUtils)
      expect(() => instance.extendedValidate()).toThrow(
        /\/aws\/lambda\/my-service-dev-hello-ia/,
      )
    })
  })
})
