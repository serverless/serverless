import { expect, test } from '@jest/globals'
import { endReasonOf } from '../../../../../../../lib/plugins/aws/dev/commands/session-end.js'

const restore = (failed) => ({
  restored: 1,
  unchanged: 0,
  skipped: 0,
  missing: 0,
  failed,
})
const ended = (exitCode, failed = 0) => ({
  type: 'session.ended',
  exit_code: exitCode,
  restore: restore(failed),
})
const failedStart = (reason, exitCode) => ({
  type: 'session.failed',
  reason,
  exit_code: exitCode,
})

test.each([
  ['a clean end', { ended: ended(0) }, null],
  [
    'an end with a function not restored',
    { ended: ended(3, 1) },
    'restore_incomplete',
  ],
  [
    'an end with a function not restored, exit 1',
    { ended: ended(1, 2) },
    'restore_incomplete',
  ],
  [
    'an end after a function could not be attached',
    { ended: ended(3) },
    'attach_incomplete',
  ],
  ['an end with another exit code', { ended: ended(1) }, 'error'],
  [
    'a failed start whose restore failed',
    { failed: failedStart('error', 3), ended: ended(3, 1) },
    'restore_incomplete',
  ],
  [
    'a failed start where no function could be attached, its restore clean',
    { failed: failedStart('attach_incomplete', 3), ended: ended(3) },
    'attach_incomplete',
  ],
  [
    'a failed start',
    { failed: failedStart('nothing_to_attach', 1), ended: ended(1) },
    'error',
  ],
  [
    'a failed start with no session.ended after it (its own reason applies)',
    { failed: failedStart('attach_incomplete', 3), ended: null },
    'error',
  ],
])('%s reports %p', (_name, end, reason) => {
  expect(endReasonOf(end)).toBe(reason)
})
