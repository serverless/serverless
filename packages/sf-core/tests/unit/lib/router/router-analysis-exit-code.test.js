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

test('a non-zero exit without an error reports its reason as the error code, with a fixed name and message', () => {
  const event = createAnalysisEvent({
    ...base,
    exitCode: 3,
    exitReason: 'DEV_MODE_ATTACH_INCOMPLETE',
  })
  expect(event.actionSucceeded).toBe(false)
  expect(event.error).toEqual({
    name: 'ExitCode',
    message: 'The command ended with exit code 3.',
    code: 'DEV_MODE_ATTACH_INCOMPLETE',
  })
})

test('an error is reported as before, whatever the exit reason; a reason without a non-zero exit adds nothing', () => {
  const error = Object.assign(new Error('boom'), { code: 'SOME_CODE' })
  expect(
    createAnalysisEvent({
      ...base,
      error,
      exitCode: 3,
      exitReason: 'DEV_MODE_ATTACH_INCOMPLETE',
    }).error,
  ).toMatchObject({ name: 'Error', message: 'boom', code: 'SOME_CODE' })
  for (const exitCode of [0, undefined]) {
    const event = createAnalysisEvent({
      ...base,
      exitCode,
      exitReason: 'DEV_MODE_ATTACH_INCOMPLETE',
    })
    expect(event.actionSucceeded).toBe(true)
    expect(event).not.toHaveProperty('error')
  }
})
