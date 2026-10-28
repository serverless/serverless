/**
 * Where a Dev Mode session keeps its record: `.serverless/dev/` in the service directory. The
 * names here are part of the record's contract; every reader and writer takes them from this file.
 */
import nodeFs from 'fs'
import path from 'path'

export const DEV_DIR_SEGMENTS = Object.freeze(['.serverless', 'dev'])

export const devDirOf = (serviceDir) =>
  path.join(serviceDir, ...DEV_DIR_SEGMENTS)

/**
 * Whether a Dev Mode session ran in `serviceDir`: it leaves `.serverless/dev/` behind (a link
 * there counts too). `deploy` empties `.serverless/` while it packages, so a command reads this
 * before it starts.
 */
export const devModeRanIn = (serviceDir, fs = nodeFs) => {
  if (!serviceDir) return false
  try {
    fs.lstatSync(devDirOf(serviceDir))
    return true
  } catch {
    return false
  }
}

export const FILES = Object.freeze({
  session: 'session.json',
  token: 'control.token',
  // Held for a moment while the session file is checked and changed (see session-file.js).
  lock: 'session.lock',
  events: 'session.ndjson',
  log: 'session.log',
  invocations: 'invocations',
  requests: 'requests',
})

/**
 * A detached session process writes to a log of its own, named for the start that launched it,
 * until it holds the directory; then it renames that log to session.log. The launcher passes the
 * name in SESSION_LOG_ENV.
 */
export const SESSION_LOG_ENV = 'SLS_DEV_SESSION_LOG'
export const ownLogFile = (launcherPid) => `${FILES.log}.${launcherPid}.tmp`
/** The launcher pid an own log is named for, or null for any other name. */
export const ownLogPidOf = (name) => {
  const match = /^session\.log\.([0-9]+)\.tmp$/.exec(String(name ?? ''))
  return match ? Number(match[1]) : null
}

const UNSAFE = /[^A-Za-z0-9._-]/g

/**
 * A name every file system accepts: each character outside [A-Za-z0-9._-] becomes "_", and a name
 * that would be empty, "." or ".." gets a leading "_", so it never leaves its directory.
 */
export const safeName = (text) => {
  const name = String(text ?? '').replace(UNSAFE, '_')
  return /^\.{0,2}$/.test(name) ? `_${name}` : name
}

/** The name an earlier session's event log gets when the next session starts. */
export const rotatedEventsFile = (sessionId) =>
  `session.${safeName(sessionId)}.ndjson`

const ROTATED = /^session\.(.+)\.ndjson$/

/** The session id in a rotated event log's name, or null for any other file. */
export const rotatedSessionIdOf = (fileName) =>
  ROTATED.exec(fileName)?.[1] ?? null

/** The directory of a function's invocation files, named after its key in serverless.yml. */
export const fnDirOf = (functionKey) => safeName(functionKey)

/** `<unix seconds>-<request id>.json`: names sort by start time. */
export const invocationFileName = ({ startedAtMs, requestId }) =>
  `${Math.floor(startedAtMs / 1000)}-${safeName(requestId)}.json`

const INVOCATION_FILE = /^(\d+)-(.+)\.json$/

/** `{ seconds, requestId }` from an invocation file's name, or null for any other file. */
export const parseInvocationFileName = (fileName) => {
  const match = INVOCATION_FILE.exec(fileName)
  return match ? { seconds: Number(match[1]), requestId: match[2] } : null
}

/**
 * An invocation file as records and results name it: relative to the service directory, with "/"
 * between segments on every platform (`fromRecordPath` turns it back into a host path). A reader
 * that listed the directory passes the `fnDir` it found instead of the function key.
 */
export const invocationRecordPath = ({
  functionKey,
  fnDir = fnDirOf(functionKey),
  fileName,
}) => [...DEV_DIR_SEGMENTS, FILES.invocations, fnDir, fileName].join('/')

/** The directory of a web app's request files, named after its key in serverless.yml. */
export const webAppDirOf = (webAppKey) => safeName(webAppKey)

/** `<unix seconds>-<request id>.json`, as an invocation file is named. */
export const requestFileName = invocationFileName
export const parseRequestFileName = parseInvocationFileName

/** A web request file as records and results name it (see `invocationRecordPath`). */
export const requestRecordPath = ({
  webAppKey,
  appDir = webAppDirOf(webAppKey),
  fileName,
}) => [...DEV_DIR_SEGMENTS, FILES.requests, appDir, fileName].join('/')

export const fromRecordPath = (serviceDir, recordPath) =>
  path.join(serviceDir, ...String(recordPath).split('/'))

/**
 * The shortest request id prefix a lookup accepts (an exact id of any length always matches): every
 * reader and the replay take it from here.
 */
export const REQUEST_ID_PREFIX_MIN = 8
