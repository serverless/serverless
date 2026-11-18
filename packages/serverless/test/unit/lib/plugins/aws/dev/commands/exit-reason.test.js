import { expect, test } from '@jest/globals'
import {
  EXIT_REASONS,
  exitReasonFor,
  recordExitReason,
} from '../../../../../../../lib/plugins/aws/dev/commands/exit-reason.js'

test('the codes follow the DEV_MODE_ convention of the CLI error codes', () => {
  expect(EXIT_REASONS).toEqual({
    ATTACH_INCOMPLETE: 'DEV_MODE_ATTACH_INCOMPLETE',
    RESTORE_INCOMPLETE: 'DEV_MODE_RESTORE_INCOMPLETE',
    RESTORE_TIMEOUT: 'DEV_MODE_RESTORE_TIMEOUT',
    FORCED_STOP: 'DEV_MODE_FORCED_STOP',
  })
})

test('only the reasons of an exit 3 have a code', () => {
  expect(exitReasonFor('attach_incomplete')).toBe('DEV_MODE_ATTACH_INCOMPLETE')
  expect(exitReasonFor('restore_incomplete')).toBe(
    'DEV_MODE_RESTORE_INCOMPLETE',
  )
  for (const reason of ['error', 'timeout', 'constructor', undefined, null]) {
    expect(exitReasonFor(reason)).toBeUndefined()
  }
})

test('a zero exit code records no reason, and clears one', () => {
  const serverless = {}
  recordExitReason(serverless, 3, 'attach_incomplete')
  expect(serverless.exitReason).toBe('DEV_MODE_ATTACH_INCOMPLETE')
  recordExitReason(serverless, 0, 'attach_incomplete')
  expect(serverless.exitReason).toBeUndefined()
  expect(() =>
    recordExitReason(undefined, 3, 'attach_incomplete'),
  ).not.toThrow()
})
