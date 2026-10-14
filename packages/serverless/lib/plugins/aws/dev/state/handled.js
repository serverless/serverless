/**
 * Whether this directory's Dev Mode session ran a `serverless invoke` call on the working copy, and
 * the lines `invoke` adds about it on stderr. A call is matched by the request id of the Invoke
 * response: the session writes the invocation's file just after the result went back, so the file
 * is looked for up to HANDLED_WAIT_MS. Nothing is waited for unless a session of the same service,
 * stage and region runs the function in mode `dev` here.
 */
import nodeFs from 'fs'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { processAlive } from '../local/leftovers.js'
import { devDirOf } from './paths.js'
import { readSession } from './session-file.js'
import { findInvocation, readSessionRecords } from './read.js'

export const HANDLED_WAIT_MS = 2_000
export const HANDLED_POLL_MS = 100
export const LOCAL_LOG_HEADING = 'Dev Mode: log lines from your working copy'

/**
 * The request id of a Lambda Invoke response: `$metadata.requestId` with the AWS SDK v3,
 * `$response.requestId` with v2 (a property the SDK attaches without making it enumerable).
 */
export const requestIdOf = (reply) => {
  const id = reply?.$metadata?.requestId ?? reply?.$response?.requestId
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

const modeOf = (records, functionKey) => {
  let mode
  for (const record of records ?? []) {
    if (record?.type === 'function.mode' && record.function === functionKey) {
      mode = record.mode
    }
  }
  return mode
}

/**
 * The invocation file of a call this directory's session ran on the working copy, or null. It
 * returns null at once, without waiting, whenever the call cannot be this session's: an
 * asynchronous or dry-run call (`invocationType` other than RequestResponse), a call of a version
 * or alias (Dev Mode runs only the unqualified function), no session of this service, stage and
 * region, a session whose process is gone, or a function the current session does not run in mode
 * `dev` (only the current session's records are read).
 */
export const findHandledInvocation = async ({
  serviceDir,
  service,
  stage,
  region,
  functionKey,
  requestId,
  invocationType = 'RequestResponse',
  qualifier,
  fs = nodeFs,
  isAlive = processAlive,
  timers = GLOBAL_TIMERS,
  waitMs = HANDLED_WAIT_MS,
  pollMs = HANDLED_POLL_MS,
  read = { readSession, readSessionRecords, findInvocation },
}) => {
  if (!requestId || !serviceDir) return null
  if (invocationType !== 'RequestResponse') return null
  if (qualifier && qualifier !== '$LATEST') return null
  const dir = devDirOf(serviceDir)
  const session = read.readSession({ dir, fs })
  if (
    !session ||
    session.service !== service ||
    session.stage !== stage ||
    session.region !== region ||
    !isAlive(session.pid)
  ) {
    return null
  }
  const records = read.readSessionRecords({
    dir,
    sessionId: session.session_id,
    fs,
  })
  if (modeOf(records, functionKey) !== 'dev') return null
  const lookup = () => {
    try {
      return read.findInvocation({ dir, idOrPrefix: requestId, fs })
    } catch (error) {
      if (error?.reason === 'invocation_not_found') return null
      throw error
    }
  }
  for (let waited = 0; ; waited += pollMs) {
    const found = lookup()
    if (found) return found
    if (waited >= waitMs) return null
    await new Promise((resolve) => timers.setTimeout(resolve, pollMs))
  }
}

export const handledLine = ({ requestId, file }) =>
  `Dev Mode: handled by your working copy · request ${requestId.slice(0, 8)} · ${file}`

/** The handler's log lines from the invocation file, as `invoke --log` prints them. */
export const localLogLines = (record) => {
  const lines = Array.isArray(record?.logs?.lines) ? record.logs.lines : []
  if (!lines.length) return ['(no log lines)']
  return record.logs.truncated
    ? [...lines, '(more log lines than Dev Mode keeps)']
    : lines
}
