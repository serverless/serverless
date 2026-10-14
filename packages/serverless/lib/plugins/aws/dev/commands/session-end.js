/**
 * How a Dev Mode session's end is reported, the one rule `dev stop`, `dev wait` and
 * `dev --detach` share. A session ends with `session.ended`; a start that failed writes
 * `session.failed` first, then its `session.ended` right after it. What was restored is only in
 * `session.ended`.
 */
import { errorResult, restoreNext } from './envelope.js'

/**
 * The reason a session's end reports, or null for a clean end, from its `session.ended`
 * (`ended`, null when the process went before writing it) and, for a start that failed, its
 * `session.failed` (`failed`):
 * - `restore_incomplete`: a function could not be restored (`ended.restore.failed`);
 * - `attach_incomplete`: exit 3 with every function restored: some function could not be attached;
 * - `error`: a failed start (the failure's own reason applies; with no `session.ended` it is all
 *   there is to go by), or an exit code other than 0.
 */
export const endReasonOf = ({ ended, failed }) => {
  if (ended?.restore?.failed) return 'restore_incomplete'
  if (ended?.exit_code === 3) return 'attach_incomplete'
  if (failed || ended?.exit_code !== 0) return 'error'
  return null
}

/** "Dev Mode did not start", with the failure's message in parentheses when it wrote one. */
const didNotStart = (failed) =>
  failed.message
    ? `Dev Mode did not start (${String(failed.message).replace(/\.+$/, '')})`
    : 'Dev Mode did not start'

/**
 * The result fields for a session's end (`dev wait --for ended`, and `dev --detach` for a start
 * that ended before it was ready), from its terminal record (`record`) and its `session.ended`
 * (`ended`: the record itself, the one after a failed start, or null when the
 * process went before writing it), by the rule `dev stop` reports an end with (`endReasonOf`): ok
 * for a clean end; otherwise the end's own status and exit code (a function not restored → 3
 * restore_incomplete; exit 3 with everything restored → 3 attach_incomplete; a failed start →
 * its own reason; another error → 1). `scope` is the session's stage, region and AWS profile (its
 * session file or its `session.starting`): the restore it suggests names them.
 */
export const endStatusOf = (record, ended, scope) => {
  const failed = record.type === 'session.failed' ? record : undefined
  switch (endReasonOf({ ended, failed })) {
    case 'restore_incomplete':
      return {
        status: 'error',
        reason: 'restore_incomplete',
        message: failed
          ? `${didNotStart(failed)}, and it could not restore every function it had attached.`
          : 'The Dev Mode session ended without restoring every function.',
        next: [restoreNext(scope)],
      }
    case 'attach_incomplete':
      return {
        status: 'error',
        reason: 'attach_incomplete',
        message: failed
          ? `${didNotStart(failed)}; it restored its functions.`
          : 'The Dev Mode session ended; at its start some function could not be attached.',
      }
    case 'error':
      return failed
        ? errorResult(
            Object.assign(
              new Error(failed.message ?? 'Dev Mode did not start.'),
              { reason: failed.reason },
            ),
          )
        : {
            status: 'error',
            reason: 'error',
            message: `The Dev Mode session ended with exit code ${record.exit_code}.`,
          }
    default:
      return { status: 'ok' }
  }
}
