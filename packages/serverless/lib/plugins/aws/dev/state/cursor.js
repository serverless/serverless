/**
 * A cursor names one record of one session's event log: `<session id>:<seq>`. Results carry the
 * cursor of the last record; `dev wait --after <cursor>` waits for records after it.
 */
import { cliCommand } from '../commands/cli-names.js'

const CURSOR = /^([^\s:]+):([1-9][0-9]{0,15})$/

export const formatCursor = (sessionId, seq) => `${sessionId}:${seq}`

/** `{ sessionId, seq }`; a malformed cursor throws an error whose `reason` is 'invalid_cursor'. */
export const parseCursor = (text) => {
  const match = CURSOR.exec(String(text ?? '').trim())
  const seq = Number(match?.[2])
  if (!match || !Number.isSafeInteger(seq)) {
    throw Object.assign(
      new Error(
        `"${String(text ?? '').slice(0, 80)}" is not a Dev Mode cursor. Use the "cursor" of a "${cliCommand('dev status')}", "dev wait" or "dev stop" result (<session id>:<number>).`,
      ),
      { reason: 'invalid_cursor' },
    )
  }
  return { sessionId: match[1], seq }
}
