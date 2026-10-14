/**
 * `serverless dev --detach`: starts the session as a background process of its own and returns
 * once it is ready, failed, or still starting after DETACH_WAIT_MS. The session process is this
 * CLI again: the same Node.js, flags and arguments, minus --detach, --json, --approve and any
 * debugger flag, plus the internal --session-process. Its output goes to
 * .serverless/dev/session.log: to a file of its own at first (`session.log.<launcher pid>.tmp`),
 * which the process renames to session.log once it holds the directory, so a start that loses a
 * race to another one never replaces the winner's log. Until then the result names its own log,
 * and session.log once its own log is gone. A
 * session already on (or still starting) in this directory for the
 * same stage, region and functions is returned as it is. Nothing here sends a signal: the session
 * is reached through its files and its control endpoint, on every platform.
 */
import fs from 'fs'
import path from 'path'
import { spawn as nodeSpawn } from 'child_process'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import {
  progress as defaultProgress,
  style,
} from '@serverless/util/src/logger/index.js'
import * as out from '../attach/output.js'
import { refuseProtectedStage } from '../attach/session-preflight.js'
import { GLOBAL_TIMERS } from '../attach/session-support.js'
import { connectToSession } from '../control/client.js'
import { processAlive } from '../local/leftovers.js'
import { formatCursor } from '../state/cursor.js'
import {
  FILES,
  SESSION_LOG_ENV,
  devDirOf,
  ownLogFile,
  ownLogPidOf,
} from '../state/paths.js'
import {
  currentSessionId,
  followRecords,
  readSessionRecords,
} from '../state/read.js'
import { ensureRealDir } from '../state/real-dir.js'
import { readSession } from '../state/session-file.js'
import { sameScope, selectionOf } from '../state/session-state.js'
import {
  dryRunResult,
  findRunningSession,
  planSession,
  renderDryRun,
} from './dry-run.js'
import { durationText } from './duration.js'
import { envelope, errorResult, restoreAfterStopNext } from './envelope.js'
import { cliCommand, shownPath } from './cli-names.js'
import { endStatusOf } from './session-end.js'
import { statusModeTable, statusTableWorthShowing } from './status.js'
import {
  PRESENCE_POLL_MS,
  TOUCH_INTERVAL_MS,
  terminalOf,
  waitForRecord,
} from './wait.js'

/** Where a detached session writes its records and its output. */
const filesLine = ({ events_file: events, log_file: log }) =>
  `Events: ${events}${log ? ` · output: ${log}` : ''}`

export const DETACH_WAIT_MS = 100_000
/** How often the launcher looks for the session file its process writes. */
export const SESSION_FILE_POLL_MS = 200
export const LOG_TAIL_LINES = 20

const DROPPED = /^--(detach|json|approve|session-process)(=.*)?$/
const BOOLEAN_VALUE = /^(true|false)$/

/**
 * The session process's arguments: the launcher's, minus what only the launcher handles (in the
 * `--json`, `--json=…` and `--json true|false` forms alike), plus `--session-process` once.
 */
export const sessionProcessArgs = (args) => {
  const kept = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i])
    if (!DROPPED.test(arg)) {
      kept.push(args[i])
      continue
    }
    // `--json true`: the value after a bare flag goes with it.
    if (!arg.includes('=') && BOOLEAN_VALUE.test(String(args[i + 1] ?? ''))) {
      i += 1
    }
  }
  return [...kept, '--session-process']
}

/**
 * Node.js options without any debugger flag (`--inspect`, `--inspect-brk`, `--inspect-port <n>`,
 * `--inspect-wait=…`, …): the session process would fight the launcher for the port.
 */
const withoutInspect = (flags) => {
  const kept = []
  for (let i = 0; i < flags.length; i += 1) {
    const flag = String(flags[i])
    if (!flag.startsWith('--inspect')) {
      kept.push(flags[i])
      continue
    }
    // `--inspect-port 9229`: the port is the next argument.
    if (flag === '--inspect-port') i += 1
  }
  return kept
}

/** The session process's Node.js flags: the launcher's, without a debugger flag. */
export const sessionProcessExecArgv = (execArgv) => withoutInspect(execArgv)

/** The session process's environment: the launcher's, without a debugger flag in NODE_OPTIONS. */
export const sessionProcessEnv = (env) => {
  if (typeof env.NODE_OPTIONS !== 'string') return env
  const options = withoutInspect(env.NODE_OPTIONS.split(/\s+/).filter(Boolean))
  const { NODE_OPTIONS: _dropped, ...rest } = env
  return options.length ? { ...rest, NODE_OPTIONS: options.join(' ') } : rest
}

// A file of the session as it is reached from where the CLI runs, in the result and its lines.
const relative = (name) => shownPath(['.serverless', 'dev', name].join('/'))

export const runDetach = async ({
  serverless,
  provider,
  options = {},
  logger,
  deps = {},
}) => {
  const {
    fs: fsRef = fs,
    spawn = nodeSpawn,
    timers = GLOBAL_TIMERS,
    now = Date.now,
    connect = connectToSession,
    find = findRunningSession,
    follow = followRecords,
    read = readSessionRecords,
    plan = planSession,
    confirm = (question) => logger.confirm(question),
    isAlive = processAlive,
    execPath = process.execPath,
    execArgv = process.execArgv,
    argv = process.argv,
    cwd = process.cwd(),
    env = process.env,
    waitMs = DETACH_WAIT_MS,
    presenceMs = PRESENCE_POLL_MS,
    progress = defaultProgress,
  } = deps
  const spinner = progress.get('main')
  const serviceDir = serverless.serviceDir
  const dir = devDirOf(serviceDir)
  const scope = {
    stage: provider.getStage(),
    region: provider.getRegion(),
    selection: selectionOf(options),
  }
  const started = now()
  const left = () => Math.max(0, waitMs - (now() - started))
  const pause = (ms) =>
    new Promise((resolve) => timers.setTimeout(resolve, Math.max(1, ms)))
  // The spinner goes before the result's lines.
  const done = (fields, human = fields.message) => {
    spinner.remove()
    return { result: envelope(fields), human }
  }
  // The log the session process writes to: its own until it holds the directory; none once a
  // spawn failed.
  let logName = FILES.log
  const files = {
    log_file: relative(FILES.log),
    events_file: relative(FILES.events),
  }
  const useLog = (name) => {
    logName = name
    if (name) files.log_file = relative(name)
    else delete files.log_file
  }
  const logTail = () => {
    if (!logName) return []
    try {
      return fsRef
        .readFileSync(path.join(dir, logName), 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .slice(-LOG_TAIL_LINES)
    } catch {
      return []
    }
  }
  const readRecord = () =>
    Promise.resolve()
      .then(() => readSession({ dir, fs: fsRef }))
      .catch(() => null)
  /**
   * The session running here: one that answers on its control endpoint (`client`), or one that
   * `findRunningSession` finds live without a client (still starting, with `control: null` and
   * its process alive). Null when there is none: a record whose process is gone, or whose endpoint
   * does not answer, is stale, and the session process replaces it.
   */
  const findRunning = async () => {
    const client = await connect({ serviceDir, fs: fsRef, isAlive, timers })
    if (client) {
      const answer = await Promise.resolve()
        .then(() => client.status())
        .catch(() => null)
      // An endpoint that answers health but not status is checked again below, as a record.
      if (answer?.status === 200) {
        return { record: client.record, client, status: answer.body }
      }
    }
    const running = await find({ serviceDir, fs: fsRef, isAlive, timers })
    return running
      ? { record: running.record, client: null, status: null }
      : null
  }
  const sessionGone = (record) => async () => {
    const current = await readRecord()
    return (
      !current ||
      current.session_id !== record.session_id ||
      !isAlive(Number(current.pid))
    )
  }
  const untilReady = (record, gone) =>
    waitForRecord({
      dir,
      sessionId: record.session_id,
      afterSeq: 0,
      match: (candidate) => candidate.type === 'session.ready',
      timeoutMs: left(),
      gone,
      deps: {
        fs: fsRef,
        timers,
        follow,
        read,
        presenceMs,
        touchMs: TOUCH_INTERVAL_MS,
      },
    })

  const timedOut = (record) => {
    const fields = {
      status: 'timeout',
      reason: 'timeout',
      message: `Dev Mode is still starting after ${durationText(waitMs)}; it goes on in the background.`,
      ...(record && {
        session_id: record.session_id,
        pid: record.pid,
        state: 'starting',
      }),
      ...files,
      next: [
        {
          command: cliCommand('dev wait --for ready'),
          when: 'to wait until it is ready',
        },
        {
          command: cliCommand('dev stop'),
          when: 'to stop it and restore your functions',
        },
      ],
    }
    // Where its output goes: a start that is still going may be failing.
    return done(fields, [
      ['notice', fields.message],
      ['blankLine'],
      ['aside', filesLine(fields)],
      [
        'aside',
        `Next: "${cliCommand('dev wait --for ready')}" waits until it is ready; "${cliCommand('dev stop')}" restores your functions and ends the session.`,
      ],
    ])
  }
  const startFailed = ({ code, signal, error } = {}) => {
    const how =
      code !== null && code !== undefined
        ? ` (exit code ${code})`
        : signal
          ? ` (${signal})`
          : ''
    const message = error
      ? `Dev Mode could not start its session process (${error.message}).`
      : `The Dev Mode session process ended before it was ready${how}. Its output is in ${files.log_file}.`
    return done(
      { status: 'error', reason: 'detach_failed', message, ...files },
      [message, ...logTail()].join('\n'),
    )
  }
  // The `session.ended` the session writes right after its `session.failed`, or null.
  const endedAfter = async (end) => {
    if (end.type === 'session.ended') return end
    try {
      return (
        (await read({ dir, sessionId: end.session_id, fs: fsRef })).find(
          (record) =>
            record.type === 'session.ended' &&
            record.session_id === end.session_id,
        ) ?? null
      )
    } catch {
      return null
    }
  }
  /**
   * A start that ended before it was ready, reported as `dev wait --for ended` reports that end:
   * a failed start with its own reason and the status that reason has, a function it could not
   * restore as `restore_incomplete`. A session that ended cleanly before it was ready (a
   * `dev stop` while it started), or a process that went without its end, is `detach_failed`.
   */
  const failedStart = async (end, record, exit) => {
    // A session process that could not open its control endpoint never started.
    if (end?.reason === 'control_unavailable') {
      return done(
        {
          status: 'error',
          reason: 'detach_failed',
          message: end.message,
          session_id: record.session_id,
          pid: record.pid,
          state: 'failed',
          ...files,
          cursor: formatCursor(end.session_id, end.seq),
        },
        [end.message, ...logTail()].join('\n'),
      )
    }
    const fields = end ? endStatusOf(end, await endedAfter(end), record) : null
    if (!fields || fields.status === 'ok') return startFailed(exit ?? {})
    const result = {
      ...fields,
      session_id: record.session_id,
      pid: record.pid,
      state: 'failed',
      ...files,
      cursor: formatCursor(end.session_id, end.seq),
    }
    return done(
      result,
      [
        result.message,
        ...(result.next ?? []).map(
          (next) => `Run "${next.command}" ${next.when}.`,
        ),
        ...logTail(),
      ].join('\n'),
    )
  }
  /**
   * The records of the session in the current event log when its `session.starting` names `pid`,
   * starting with that record; null otherwise.
   */
  const ownSessionRecords = async (pid) => {
    try {
      const sessionId = currentSessionId({ dir, fs: fsRef })
      if (!sessionId) return null
      const records = await read({ dir, sessionId, fs: fsRef })
      const starting = records.findIndex(
        (item) => item.type === 'session.starting',
      )
      return starting >= 0 && records[starting].pid === pid
        ? records.slice(starting)
        : null
    } catch {
      return null
    }
  }
  const report = ({ record, status }, alreadyRunning) => {
    const functions = status?.functions ?? []
    const kept = alreadyRunning
      ? out.keptSettingsLine({ record, options })
      : null
    const fields = {
      status: 'ok',
      ...(alreadyRunning && { already_running: true }),
      ...(kept && { message: kept }),
      session_id: record.session_id,
      pid: record.pid,
      state: status?.state ?? record.state,
      log_file: record.log_file ? relative(record.log_file) : null,
      events_file: relative(record.events_file ?? FILES.events),
      cursor: status?.cursor,
      functions,
    }
    const devCount = functions.filter((fn) => fn.mode === 'dev').length
    const lines = [
      alreadyRunning
        ? ['notice', out.alreadyRunningLine(record)]
        : [
            'success',
            `Dev Mode on in the background · ${devCount} of ${out.functionsWord(functions.length)} ${style.aside(`(session ${record.session_id}, pid ${record.pid})`)}`,
          ],
      ...(kept ? [['notice', kept]] : []),
      ...(statusTableWorthShowing(functions)
        ? [['blankLine'], ['notice', statusModeTable(functions)]]
        : []),
      ['blankLine'],
      ['aside', filesLine(fields)],
      [
        'aside',
        `Next: "${cliCommand('dev wait --for invocation')}" waits for an invocation; "${cliCommand('dev stop')}" restores your functions and ends the session.`,
      ],
    ]
    return done(fields, lines)
  }
  const existing = async (running) => {
    const { record } = running
    if (record.control_unavailable && !record.control?.url) {
      return done({
        status: 'error',
        reason: 'session_running',
        message: out.sessionUnreachableLine(record),
        session_id: record.session_id,
        pid: record.pid,
        state: record.state,
        next: [restoreAfterStopNext(record)],
      })
    }
    if (!sameScope(record, scope) || record.state === 'stopping') {
      const stopping = sameScope(record, scope)
      return done({
        status: 'error',
        reason: 'session_running',
        message: stopping
          ? out.sessionStoppingLine(record)
          : out.sessionRunningLine(record),
        session_id: record.session_id,
        pid: record.pid,
        state: record.state,
        next: [stopping ? out.SESSION_STOPPING_NEXT : out.SESSION_RUNNING_NEXT],
      })
    }
    if (record.state === 'starting') {
      const outcome = await untilReady(record, sessionGone(record))
      if (outcome.timedOut) return timedOut(record)
      if (outcome.error) throw outcome.error
      if (!outcome.record) return failedStart(outcome.ended, record)
      return report((await findRunning()) ?? running, true)
    }
    return report(running, true)
  }

  try {
    // Before the session process starts, so a refused stage leaves no log behind.
    refuseProtectedStage(scope.stage)
    const running = await findRunning()
    if (running) return await existing(running)

    if (options.approve) {
      if (!logger.isInteractive()) {
        return done({
          status: 'action_required',
          reason: 'approval_needs_terminal',
          user_action_required: true,
          message:
            '--approve needs a person at an interactive terminal to confirm the changes before Dev Mode starts in the background. Nothing was changed. Run the command in a terminal, or without --approve.',
        })
      }
      const planned = await plan({ serverless, provider, options })
      for (const [level, text] of renderDryRun(planned)) logger[level](text)
      if (planned.preflight.some((check) => !check.ok)) {
        const result = dryRunResult(planned)
        return { result, human: result.message }
      }
      let approved = false
      try {
        approved = await confirm({ message: 'Continue?', initial: true })
      } catch {
        approved = false
      }
      if (!approved) {
        // No session exists, so the result has no session fields.
        return done({
          status: 'ok',
          state: 'off',
          message: 'Nothing was changed.',
        })
      }
    }

    ensureRealDir({ dir, fs: fsRef })
    // The own logs of earlier starts whose launcher is gone; one whose launcher runs is its own.
    for (const name of fsRef.readdirSync(dir)) {
      const pid = ownLogPidOf(name)
      if (pid !== null && pid !== process.pid && !isAlive(pid)) {
        fsRef.rmSync(path.join(dir, name), { force: true })
      }
    }
    // A new file each start, so it is owner-only even when an older one was not.
    const ownName = ownLogFile(process.pid)
    const ownLog = path.join(dir, ownName)
    fsRef.rmSync(ownLog, { force: true })
    const logFd = fsRef.openSync(ownLog, 'wx', 0o600)
    useLog(ownName)
    // Nothing ran: no log is kept, and none is named.
    const dropLog = () => {
      fsRef.rmSync(ownLog, { force: true })
      useLog(null)
    }
    let child
    try {
      child = spawn(
        execPath,
        [
          ...sessionProcessExecArgv(execArgv),
          argv[1],
          ...sessionProcessArgs(argv.slice(2)),
        ],
        {
          cwd,
          env: { ...sessionProcessEnv(env), [SESSION_LOG_ENV]: ownName },
          detached: true,
          windowsHide: true,
          stdio: ['ignore', logFd, logFd],
        },
      )
    } catch (error) {
      dropLog()
      return startFailed({ error })
    } finally {
      fsRef.closeSync(logFd)
    }
    let exit = null
    child.once('exit', (code, signal) => {
      exit = { code, signal }
    })
    child.once('error', (error) => {
      exit = { error }
    })
    child.unref()
    spinner.notice('Starting Dev Mode in the background')

    // The session file the process writes names its pid. A spawn that failed has no pid: its
    // 'error' comes on a later tick, so every look that finds nothing waits on a timer.
    let record = null
    while (!record && !exit && left() > 0) {
      const current = await readRecord()
      if (Number.isInteger(child.pid) && current?.pid === child.pid) {
        record = current
      } else {
        await pause(Math.min(SESSION_FILE_POLL_MS, left()))
      }
    }
    if (!record) {
      // Not holding the directory yet: its output is in its own log, which the result names.
      if (!exit) return timedOut(null)
      // It never ran, so it found no other session either.
      if (exit.error) {
        dropLog()
        return startFailed(exit)
      }
      // It held the directory (its log is session.log now) and left between two looks: a start
      // that fails without a call to AWS ends within milliseconds. Its records tell how it ended.
      if (!fsRef.existsSync(ownLog)) {
        useLog(FILES.log)
        const own = await ownSessionRecords(child.pid)
        if (own?.some((item) => item.type === 'session.ended')) {
          return await failedStart(terminalOf(own), own[0], exit)
        }
      }
      // The process may have found a session that started in the meantime, and left: that
      // session's log stays.
      const other = await findRunning()
      if (other) {
        dropLog()
        return await existing(other)
      }
      return startFailed(exit)
    }
    // It holds the directory: it has taken its log over as session.log.
    useLog(FILES.log)
    const outcome = await untilReady(record, async () => exit !== null)
    if (outcome.record) {
      // Ready: the control endpoint answers with its status and function list.
      const ready = await findRunning()
      return ready ? report(ready, false) : startFailed(exit ?? {})
    }
    if (outcome.timedOut) return timedOut(record)
    if (outcome.error) throw outcome.error
    return await failedStart(outcome.ended, record, exit)
  } catch (error) {
    return done(errorResult(error))
  }
}
