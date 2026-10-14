/**
 * `session.json`: one running session per service directory. A start claims the file by creating
 * it exclusively (`wx`), so of two starts racing only one gets it. A file that is already there
 * belongs to a live session when its process runs and, once its control endpoint listens, that
 * endpoint answers with its session id within HEALTH_TIMEOUT_MS. Otherwise the file is stale (a
 * session that was killed): it is set aside, checked to be the stale one, removed, and the claim
 * is tried once more. The session deletes the file, and `control.token` with it, when it ends.
 */
import nodeFs from 'fs'
import path from 'path'
import { FILES } from './paths.js'
import {
  ensureRealDir,
  isRegularFile,
  temporaryNameOf,
  writeNewFile,
} from './real-dir.js'
import { processAlive } from '../local/leftovers.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'

export const HEALTH_TIMEOUT_MS = 2_000
/**
 * How long after its claim (`started_at`) a record without a control endpoint counts as a session
 * that is still starting. The endpoint opens right after the claim, before any AWS call (only a
 * local listen and the token file stand between them, milliseconds on a normal machine); a
 * minute covers a machine under heavy load. Past it the record is stale: its pid may name another
 * process by now.
 */
export const START_GRACE_MS = 60_000
// A record is written right after its file is created; a reader that comes in between waits for it.
export const WRITTEN_WAIT_MS = 1_000
const WRITTEN_POLL_MS = 50

const sessionPathOf = (dir) => path.join(dir, FILES.session)
const tokenPathOf = (dir) => path.join(dir, FILES.token)
const lockPathOf = (dir) => path.join(dir, FILES.lock)

/** How old a lock is before it counts as left by a process that died holding it. */
export const LOCK_STALE_MS = 2_000
/**
 * How long a step waits for the lock another process holds (each holds it for a few file calls).
 * Longer than LOCK_STALE_MS, so a lock left by a process that died a moment ago is taken over
 * rather than reported as held.
 */
const LOCK_WAIT_MS = LOCK_STALE_MS + 1_000
const LOCK_POLL_MS = 5
const pause = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Runs `step` holding `session.lock`, created with `wx` like the session file itself, so that
 * checking whose the session file is and changing it are one step for every start and session in
 * this directory. A lock older than LOCK_STALE_MS belongs to a process that died holding it and is
 * taken over: it is moved aside first, and put back when it turns out to be a fresh one (another
 * process took it over in between), by a rename where a hard link cannot be made. Throws with
 * `reason: 'session_running'` when the lock stays held past LOCK_WAIT_MS.
 *
 * One window stays open, as in removeStale: when a third process takes the free place while a
 * fresh lock is set aside, the fresh one cannot go back, and both holders run their step.
 */
const withLock = (fs, dir, step, now = Date.now) => {
  const lock = lockPathOf(dir)
  const deadline = now() + LOCK_WAIT_MS
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx', 0o600))
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    try {
      if (now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) {
        const aside = temporaryNameOf(lock)
        fs.renameSync(lock, aside)
        if (now() - fs.statSync(aside).mtimeMs <= LOCK_STALE_MS) {
          try {
            fs.linkSync(aside, lock)
          } catch (error) {
            // Taken again meanwhile (EEXIST): that holder keeps it. Otherwise it goes back as is.
            if (error.code !== 'EEXIST') fs.renameSync(aside, lock)
          }
        }
        fs.rmSync(aside, { force: true })
        continue
      }
    } catch {
      // Released or taken over meanwhile: try again.
      continue
    }
    if (now() >= deadline) {
      throw Object.assign(
        new Error(
          `Dev Mode could not take ${lock}: another Dev Mode start or session in this directory keeps holding it.`,
        ),
        { code: 'ELOCKED', reason: 'session_running' },
      )
    }
    pause(LOCK_POLL_MS)
  }
  try {
    return step()
  } finally {
    fs.rmSync(lock, { force: true })
  }
}

const parseRecord = (text) => {
  try {
    const record = JSON.parse(text)
    return record &&
      typeof record === 'object' &&
      typeof record.session_id === 'string'
      ? record
      : null
  } catch {
    return null
  }
}

/**
 * `{ exists, record }`: record is null for a file that is not a session record (yet), and for
 * anything that is not a regular file (a link is never read through: it is stale).
 */
const readState = (fs, file) => {
  let text
  try {
    if (!fs.lstatSync(file).isFile()) return { exists: true, record: null }
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, record: null }
    throw error
  }
  return { exists: true, record: parseRecord(text) }
}

/** The session record in `dir`, or null when there is none. */
export const readSession = ({ dir, fs = nodeFs }) =>
  readState(fs, sessionPathOf(dir)).record

const recordText = (record) => `${JSON.stringify(record, null, 2)}\n`

/** Creates the file only when it does not exist; returns false when it does. */
const createExclusive = (fs, file, text) => {
  let fd
  try {
    fd = fs.openSync(file, 'wx', 0o600)
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    fs.writeSync(fd, text)
  } finally {
    fs.closeSync(fd)
  }
  return true
}

/**
 * Replaces a file at once: readers see the old content or the new one, never a part. The new
 * content goes to a new file under a name nobody can predict first.
 */
const replaceFile = (fs, file, text) => {
  const temporary = temporaryNameOf(file)
  try {
    writeNewFile(fs, temporary, text)
    fs.renameSync(temporary, file)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
}

/**
 * Whether a record without a control endpoint belongs to a session that is still starting: its
 * state is `starting`, it has not recorded that its endpoint could not open
 * (`control_unavailable`), and it was claimed less than START_GRACE_MS ago. Any other such record
 * names a session Dev Mode cannot identify: it is never signalled and never waited for.
 */
export const isStartingRecord = (record, nowMs = Date.now()) => {
  if (!record || record.control?.url || record.control_unavailable) return false
  if (record.state !== 'starting') return false
  const age = nowMs - Date.parse(record.started_at)
  return Number.isFinite(age) && Math.abs(age) < START_GRACE_MS
}

/**
 * Whether the session `record` names is running: its process is alive and, once the record names
 * a control endpoint, `health({ record })` answers with the record's session id within
 * `timeoutMs`. A record without an endpoint counts while it is starting (isStartingRecord), and
 * for as long as its process runs when it recorded that its endpoint could not open
 * (`control_unavailable`): such a session can be reached by nothing, so it is never replaced.
 */
export const isSessionLive = async ({
  record,
  isAlive = processAlive,
  // This process: a record that names it belongs to a session that is gone (a container or CI
  // runner that gives every run the same pid), never to one that is running.
  selfPid = process.pid,
  health,
  timeoutMs = HEALTH_TIMEOUT_MS,
  timers = GLOBAL_TIMERS,
  now = Date.now,
}) => {
  const pid = Number(record?.pid)
  if (!record || pid === selfPid || !isAlive(pid)) return false
  if (!record.control?.url) {
    return (
      record.control_unavailable === true || isStartingRecord(record, now())
    )
  }
  if (!health) return true
  let timer
  try {
    const answer = await Promise.race([
      Promise.resolve()
        .then(() => health({ record }))
        .catch(() => null),
      new Promise((resolve) => {
        timer = timers.setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
    return answer?.session_id === record.session_id
  } finally {
    timers.clearTimeout(timer)
  }
}

/**
 * Removes the stale session file whose record named `staleId` (null: a file without a record).
 * The file is first moved aside, so a session that claimed the place in the meantime is never
 * removed: its file is put back. Returns nothing; the caller tries its claim again.
 *
 * One window stays open: when a third start creates the file while a claimed one is set aside,
 * the claimed file cannot go back. That session then finds the file is not its own at its next
 * update or release (`stillOurs`), so it never rewrites or deletes the other session's file; it
 * keeps running without a record of its own.
 */
const removeStale = (fs, dir, staleId) => {
  const file = sessionPathOf(dir)
  const aside = `${file}.stale-${process.pid}-${Date.now()}`
  try {
    fs.renameSync(file, aside)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  const moved = readState(fs, aside).record
  if ((moved?.session_id ?? null) === staleId) {
    fs.rmSync(aside, { force: true })
    // The stale session's token goes, unless another start claimed the place since the move: the
    // token is then (or is about to be) that start's own, and its own start replaces a stale one.
    if (!fs.existsSync(file)) fs.rmSync(tokenPathOf(dir), { force: true })
    return
  }
  // Another start claimed the place between the check and the move: its file goes back.
  try {
    fs.linkSync(aside, file)
  } catch (error) {
    if (error.code !== 'EEXIST') fs.renameSync(aside, file)
  } finally {
    fs.rmSync(aside, { force: true })
  }
}

const claimError = (dir) =>
  Object.assign(
    new Error(
      `Dev Mode could not claim ${path.join(dir, FILES.session)}: another start keeps replacing it.`,
    ),
    { reason: 'session_running' },
  )

/**
 * Claims `dir` for the session `record`. Resolves `{ claimed: true, record, update(patch),
 * release() }`, or `{ claimed: false, existing }` with the live session's record. A stale file
 * is replaced inside the call; a claim that loses the place twice to other starts throws with
 * `reason: 'session_running'`. `health` asks a session's control endpoint (see isSessionLive).
 * `writtenWaitMs` is how long a file without its record yet is waited for before it is stale.
 */
export const claimSession = async ({
  dir,
  record,
  isAlive = processAlive,
  health,
  fs = nodeFs,
  timers = GLOBAL_TIMERS,
  timeoutMs = HEALTH_TIMEOUT_MS,
  writtenWaitMs = WRITTEN_WAIT_MS,
  selfPid = process.pid,
  now = Date.now,
}) => {
  const file = sessionPathOf(dir)
  ensureRealDir({ dir, fs })
  const sleep = (ms) =>
    new Promise((resolve) => {
      timers.setTimeout(resolve, ms)
    })
  const readWritten = async () => {
    for (let waited = 0; ; waited += WRITTEN_POLL_MS) {
      const state = readState(fs, file)
      if (!state.exists || state.record || waited >= writtenWaitMs) {
        return state
      }
      await sleep(Math.min(WRITTEN_POLL_MS, writtenWaitMs - waited))
    }
  }
  for (let attempt = 1; ; attempt += 1) {
    if (
      withLock(fs, dir, () => createExclusive(fs, file, recordText(record)))
    ) {
      return claimed({ fs, dir, record })
    }
    const state = await readWritten()
    // Removed between the create and the read: the place is free again.
    if (!state.exists) {
      if (attempt === 2) throw claimError(dir)
      continue
    }
    if (
      await isSessionLive({
        record: state.record,
        isAlive,
        selfPid,
        health,
        timeoutMs,
        timers,
        now,
      })
    ) {
      return { claimed: false, existing: state.record }
    }
    if (attempt === 2) throw claimError(dir)
    withLock(fs, dir, () =>
      removeStale(fs, dir, state.record?.session_id ?? null),
    )
  }
}

const claimed = ({ fs, dir, record }) => {
  const file = sessionPathOf(dir)
  let current = record
  let released = false
  const stillOurs = () =>
    readState(fs, file).record?.session_id === record.session_id
  return {
    claimed: true,
    get record() {
      return current
    },
    /** Merges `patch` into the record and rewrites the file; returns false when it could not. */
    update(patch) {
      if (released) return false
      current = { ...current, ...patch }
      try {
        // Checked and written under the lock: a start that claims the place waits for it.
        return withLock(fs, dir, () => {
          if (!stillOurs()) return false
          replaceFile(fs, file, recordText(current))
          return true
        })
      } catch {
        return false
      }
    },
    /** Deletes the token and the record (only while the record is still this session's). */
    release() {
      if (released) return
      released = true
      try {
        withLock(fs, dir, () => {
          if (!stillOurs()) return
          fs.rmSync(tokenPathOf(dir), { force: true })
          fs.rmSync(file, { force: true })
        })
      } catch {
        // A file left behind is stale by definition: the next start replaces it.
      }
    },
  }
}

/** Writes the control token: 64 hex characters, no newline, readable by its owner only. */
export const writeToken = ({ dir, token, fs = nodeFs }) => {
  const file = tokenPathOf(dir)
  ensureRealDir({ dir, fs })
  // A file left by an earlier session keeps its mode; start from a new one.
  fs.rmSync(file, { force: true })
  writeNewFile(fs, file, token)
}

/** The control token, or null when there is none. */
export const readToken = ({ dir, fs = nodeFs }) => {
  try {
    if (!isRegularFile(fs, tokenPathOf(dir))) return null
    return fs.readFileSync(tokenPathOf(dir), 'utf8').trim() || null
  } catch {
    return null
  }
}
