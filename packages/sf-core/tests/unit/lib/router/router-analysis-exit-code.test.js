import { expect, test } from '@jest/globals'
import { createAnalysisEvent } from '../../../../src/lib/router.js'

const base = {
  licenseKey: null,
  orgId: 'o',
  versionFramework: '4.99.0',
  command: ['dev'],
  cliOptions: {},
  resolvers: [],
}

test('a command that ends with a non-zero exit code did not succeed, even without an error', () => {
  expect(createAnalysisEvent({ ...base, exitCode: 3 }).actionSucceeded).toBe(
    false,
  )
  expect(createAnalysisEvent({ ...base, exitCode: 3 })).not.toHaveProperty(
    'error',
  )
})

test('a command that ends with exit code 0, or none, succeeded; an error still fails it', () => {
  expect(createAnalysisEvent({ ...base, exitCode: 0 }).actionSucceeded).toBe(
    true,
  )
  expect(createAnalysisEvent(base).actionSucceeded).toBe(true)
  expect(
    createAnalysisEvent({ ...base, error: new Error('boom') }).actionSucceeded,
  ).toBe(false)
})

test('the exit code is not a field of the event', () => {
  expect(createAnalysisEvent({ ...base, exitCode: 3 })).not.toHaveProperty(
    'exitCode',
  )
})
