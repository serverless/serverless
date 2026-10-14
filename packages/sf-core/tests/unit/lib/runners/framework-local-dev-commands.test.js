// Importing router.js first resolves a circular-import ordering between the runners.
import '../../../../src/lib/router.js'
import { jest } from '@jest/globals'
import {
  metricsBeforeRun,
  prepareFrameworkOptions,
  readsOnlyLocalDevState,
  TraditionalRunner,
} from '../../../../src/lib/runners/framework.js'

test('a command that skipped the stack lookup does not say whether the stack existed', () => {
  expect(
    metricsBeforeRun({ command: ['dev', 'status'], serviceUniqueId: null }),
  ).toEqual({})
  expect(
    metricsBeforeRun({ command: ['dev', 'status'], serviceUniqueId: null }),
  ).not.toHaveProperty('stackExistedBeforeRun')
  expect(
    metricsBeforeRun({ command: ['deploy'], serviceUniqueId: null }),
  ).toEqual({ stackExistedBeforeRun: false })
  expect(
    metricsBeforeRun({ command: ['dev'], serviceUniqueId: 'arn:stack' }),
  ).toEqual({ stackExistedBeforeRun: true })
})

test('Dev Mode commands that talk to the local session skip the stack lookup; every other command keeps it', () => {
  for (const command of [
    ['dev', 'status'],
    ['dev', 'stop'],
    ['dev', 'wait'],
    ['dev', 'requests'],
    ['dev', 'replay'],
  ]) {
    expect(readsOnlyLocalDevState(command)).toBe(true)
  }
  for (const command of [
    ['dev'],
    ['dev', 'restore'],
    ['dev', 'setup'],
    ['deploy'],
    ['info'],
    [],
    undefined,
  ]) {
    expect(readsOnlyLocalDevState(command)).toBe(false)
  }
})

test('dev replay with its request id skips the stack lookup once its options are prepared', () => {
  // The runner prepares the options (moving the positional request id into them) before it asks.
  const command = ['dev', 'replay', '3f2a9c1e']
  const options = {}
  prepareFrameworkOptions(command, options)
  expect(command).toEqual(['dev', 'replay'])
  expect(options).toEqual({ requestId: '3f2a9c1e' })
  expect(readsOnlyLocalDevState(command)).toBe(true)
  expect(metricsBeforeRun({ command, serviceUniqueId: null })).toEqual({})
})

// Runs the runner up to the point it records the metrics known before the command, and reports
// whether it looked the stack up on the way.
const lookupBeforeRun = async (command) => {
  const lookup = jest.fn(async () => ({ serviceUniqueId: 'arn:stack' }))
  const stop = new Error('stopped before the command')
  let metrics
  const runner = {
    command,
    options: {},
    config: { service: 'orders', functions: {} },
    stage: 'dev',
    resolveVariablesAndAuthenticate: async () => ({}),
    resolveVariables: async () => {},
    getAwsCredentialProvider: async () => ({}),
    getAwsRegionWithoutCredentials: async () => ({}),
    getServiceUniqueId: lookup,
    set analyticsMetrics(value) {
      metrics = value
      throw stop
    },
  }
  await expect(TraditionalRunner.prototype.run.call(runner)).rejects.toBe(stop)
  return { looked: lookup.mock.calls.length > 0, metrics }
}

test('the runner skips the stack lookup for dev status and keeps it for deploy', async () => {
  expect(await lookupBeforeRun(['dev', 'status'])).toEqual({
    looked: false,
    metrics: {},
  })
  expect(await lookupBeforeRun(['dev', 'replay', '3f2a9c1e'])).toEqual({
    looked: false,
    metrics: {},
  })
  expect(await lookupBeforeRun(['deploy'])).toEqual({
    looked: true,
    metrics: { stackExistedBeforeRun: true },
  })
})
