/**
 * The local workers: one handler process per function and Lambda execution environment, started
 * on that environment's first invocation, kept warm between invocations, replaced after a reload,
 * stopped after the idle time, and killed with everything it started when it ends. At most
 * MAX_WORKERS run at once: at the cap the one idle the longest stops to make room, and when every
 * one is busy a new environment's invocation is left to the deployed code.
 */
import {
  credentialsFrom,
  functionVariables,
  handlerEnvironment,
} from './environment.js'
import { colorsShown } from './invocation-output.js'
import { createLineSplitter } from './lines.js'
import { errorReply, exitReply } from './replies.js'

/**
 * The most handler processes a session runs at once, across its functions, starting ones
 * included. One idle process measured 67 MB (Node.js with DynamoDB, S3 and SQS SDK v3 clients), 77
 * MB under the TypeScript loader and 48 MB (Python with boto3 clients); real apps take about
 * 80-120 MB, so 24 is about 2-3 GB at worst. Development traffic needs far fewer (a page's
 * parallel calls, a queue trigger's first batches); a load test spills to the deployed code
 * instead of exhausting this machine.
 */
export const MAX_WORKERS = 24

/** Why an invocation was left to the deployed code when every handler process was busy. */
export const workersBusyMessage = (maxWorkers) =>
  `Dev Mode runs at most ${maxWorkers} handler process${maxWorkers === 1 ? '' : 'es'} at once, and ${maxWorkers === 1 ? 'it is' : 'all are'} busy.`

/** The place of an invocation whose environment already has a process, or is starting one. */
const NO_SLOT = Object.freeze({ release() {} })

/**
 * `resources` holds the runtime's opened `api`, `credentials` and `configFiles`; they exist only
 * once the runtime started, so they are read from it each time a worker needs them.
 */
export const createWorkerPool = ({
  serverless,
  serviceDir,
  logger,
  timers,
  now = Date.now,
  machineEnv,
  idleMs,
  graceMs,
  randomBytes,
  platform,
  signalProcess,
  emit,
  guarded,
  debug,
  resources,
  isBuilt,
  builtFile = () => null,
  maxWorkers = MAX_WORKERS,
}) => {
  // Workers that take new invocations, by function and environment.
  const workers = new Map()
  // Every worker whose process has not exited yet, including ones being replaced.
  const live = new Set()
  // Workers being started: a second invocation for the same environment waits for the same one.
  const starting = new Map()
  // Bumped by every reload of a function: a worker prepared before the bump runs old code.
  const generations = new Map()
  const warned = new Set()
  let stopped = false
  // Places reserved for processes not started yet (see reserve).
  let reserved = 0
  // Counts the workers going idle, to rank them by when they did: a clock reads the same for
  // two that go idle within one millisecond.
  let idleCount = 0

  const generationOf = (functionKey) => generations.get(functionKey) ?? 0
  const isStale = (worker) =>
    worker.stale || worker.generation !== generationOf(worker.functionKey)

  /**
   * Signals a worker. On POSIX the adapters start every worker as the leader of its own process
   * group, so a terminal's Ctrl+C reaches only the CLI, and the whole group is signalled: whatever
   * the handler started goes with it, as it would with its Lambda execution environment. Windows
   * has no process groups to signal: there only the worker itself is.
   */
  const signal = (worker, name) => {
    const pid = worker.child?.pid
    if (platform !== 'win32' && Number.isInteger(pid) && pid > 0) {
      try {
        signalProcess(-pid, name)
        return
      } catch {
        // Not a group leader, or the group is gone: the worker alone.
      }
    }
    try {
      worker.child?.kill(name)
    } catch {
      // Already gone.
    }
  }
  /** Once a worker has exited, what its handler started and left running goes too. */
  const killLeftovers = (worker) => {
    const pid = worker.child?.pid
    if (platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return
    try {
      signalProcess(-pid, 'SIGKILL')
    } catch {
      // Nothing left.
    }
  }

  const killAll = () => {
    for (const worker of live) signal(worker, 'SIGKILL')
  }

  const lines = (worker, name) => {
    const stream = worker.child[name]
    if (!stream) return
    stream.setEncoding('utf8')
    const splitter = createLineSplitter({
      timers,
      // A line is told under the invocation that was running when its first part was written,
      // not one that started before a partial line was shown.
      context: () => worker.logRequestId,
      onLine: (text, requestId) =>
        emit('log', {
          functionKey: worker.functionKey,
          requestId,
          text,
        }),
    })
    worker.outputs.push(splitter)
    stream.on('data', (chunk) =>
      guarded('show the output of a local worker', () => splitter.push(chunk)),
    )
    stream.on('end', () => splitter.end())
  }

  const onExit = (worker, { code = null, signal = null, error = null }) => {
    if (worker.exited) return
    worker.exited = true
    killLeftovers(worker)
    // Output still waiting for its newline is shown now, and no flush timer outlives the worker.
    for (const output of worker.outputs) output.end()
    live.delete(worker)
    if (workers.get(worker.key) === worker) workers.delete(worker.key)
    timers.clearTimeout(worker.idleTimer)
    worker.idleTimer = null
    timers.clearTimeout(worker.killTimer)
    worker.killTimer = null
    if (worker.requestId && !worker.stopping) {
      emit('workerExited', {
        functionKey: worker.functionKey,
        requestId: worker.requestId,
        code,
        signal,
      })
    }
    const kind = worker.started ? 'error' : 'init_error'
    // Each waiting invocation is told under its own request id, including one queued behind the
    // invocation that ended the worker.
    const replyFor = (item) =>
      error
        ? errorReply(
            'Runtime.Unknown',
            `Dev Mode could not run the local worker for ${worker.functionKey}: ${error.message}`,
            kind,
          )
        : exitReply({
            requestId:
              item?.requestId ??
              worker.requestId ??
              worker.logRequestId ??
              'unknown',
            code,
            signal,
            kind,
          })
    // Failing first settles the waiting invocations with the exit; closing alone would tell them
    // only that the worker stopped.
    worker.channel.fail(replyFor)
    worker.channel.close()
    resources.credentials?.unregister(worker.workerId)
    worker.resolveExit()
  }

  const startWorker = async (fn, request, key, start = {}) => {
    const generation = generationOf(fn.key)
    const prepared = await fn.adapter.prepare({
      serverless,
      functionKey: fn.key,
      functionConfig: fn.config ?? {},
      serviceDir,
      built: isBuilt(fn.key),
      builtFile: builtFile(fn.key),
    })
    if (stopped) throw new Error('Dev Mode is stopping')
    for (const warning of prepared.warnings ?? []) {
      if (warned.has(warning)) continue
      warned.add(warning)
      logger.warning(warning)
    }
    const workerId = randomBytes(32).toString('hex')
    const channel = resources.api.channel(workerId)
    const registration = resources.credentials.register(workerId)
    const worker = {
      key,
      functionKey: fn.key,
      workerId,
      channel,
      registration,
      generation,
      child: null,
      pending: 0,
      stale: false,
      stopping: false,
      exited: false,
      started: false,
      firstInvocation: true,
      requestId: null,
      logRequestId: null,
      idleTimer: null,
      killTimer: null,
      spawnedAt: null,
      initMs: undefined,
      // When it last went idle, as idleCount then: lower went idle earlier (null while it has an
      // invocation, or before its first).
      idleOrder: null,
      // Reservations of its environment waiting for their acceptance (see reserve).
      holds: 0,
      // The reserved place it stops for once that place is used (see reserve).
      evictFor: null,
      outputs: [],
    }
    worker.exitPromise = new Promise((resolve) => {
      worker.resolveExit = resolve
    })
    try {
      registration.update(credentialsFrom(request.environment))
      // The deployed configuration's variables, and only Lambda's own values from the invocation.
      const { variables, ignored } = functionVariables({
        deployed: fn.deployedVariables,
        offered: request.environment,
        known: fn.lambdaValues,
      })
      if (ignored.length) {
        debug(
          `Dev Mode did not apply ${ignored.join(', ')} from an invocation of ${fn.key}: a handler on this machine runs with the deployed configuration's variables`,
        )
      }
      const { env, dropped } = handlerEnvironment({
        machine: machineEnv,
        forwarded: variables,
        adapter: prepared.env,
        nodeOptionsAppend: prepared.nodeOptionsAppend,
        credentials: registration,
        configFiles: resources.configFiles,
        runtimeApi: channel.address,
        taskRoot: prepared.codeRoot,
        serviceDir,
        handler: fn.config?.handler,
      })
      if (dropped.length) {
        debug(
          `Dev Mode applies only the runtime settings and the service directory preloads of the NODE_OPTIONS of ${fn.key} on this machine; left out: ${dropped.join(', ')}`,
        )
      }
      worker.spawnedAt = now()
      worker.child = fn.adapter.start({
        local: fn.local,
        prepared,
        env,
        // The handler's logged objects are coloured as the CLI's own output is.
        colors: colorsShown(),
        deployedRuntime: fn.runtime,
        serviceDir,
      })
    } catch (error) {
      channel.close()
      resources.credentials.unregister(workerId)
      throw error
    }
    live.add(worker)
    start.live = true
    lines(worker, 'stdout')
    lines(worker, 'stderr')
    worker.child.on('exit', (code, signal) => onExit(worker, { code, signal }))
    worker.child.on('error', (error) => {
      debug(
        `Dev Mode could not run the local worker for ${fn.key}: ${error.message}`,
      )
      onExit(worker, { error })
    })
    // A start every waiter gave up on is never handed to a later invocation.
    if (!start.abandoned) workers.set(key, worker)
    return worker
  }

  const keyOf = (functionKey, environmentId) =>
    `${functionKey}\u0000${environmentId}`

  /**
   * The processes that count toward MAX_WORKERS: running ones (except one chosen to make room,
   * which stops when the place it gave up is used), starting ones, and reserved places.
   */
  const occupied = () => {
    let count = reserved
    for (const worker of live) {
      if (!worker.stopping && !worker.evictFor) count += 1
    }
    for (const start of starting.values()) if (!start.live) count += 1
    return count
  }

  /**
   * The process idle the longest that nothing holds: not running or about to run an invocation
   * (`holds`, see reserve), not chosen already, and past its first invocation.
   */
  const oldestIdle = () => {
    let oldest = null
    for (const worker of workers.values()) {
      if (
        worker.pending > 0 ||
        worker.stopping ||
        worker.idleOrder === null ||
        worker.holds > 0 ||
        worker.evictFor
      ) {
        continue
      }
      if (!oldest || worker.idleOrder < oldest.idleOrder) oldest = worker
    }
    return oldest
  }

  /** Stops an idle process to make room; its environment gets a new one on its next invocation. */
  const evict = (worker) => {
    debug(
      `Dev Mode stopped the idle local worker of ${worker.functionKey} to start another (at most ${maxWorkers} at once)`,
    )
    stopWorker(worker)
  }

  /** Room for a process that starts now: there is some, or the process idle the longest stops. */
  const makeRoomNow = () => {
    if (occupied() < maxWorkers) return true
    const oldest = oldestIdle()
    if (!oldest) return false
    evict(oldest)
    return true
  }

  /**
   * Reserves what an invocation of `functionKey` from `environmentId` needs, before it is
   * accepted: `{ release() }`, or null when every process is busy.
   * - An environment with a process holds it: no other reservation can stop it while the
   *   acceptance travels.
   * - An environment starting one needs nothing more.
   * - Otherwise a place is reserved. At the cap, the process idle the longest is chosen to make
   *   room, but stops only when the place is used (workerFor): an acceptance that is not sent
   *   stops nothing.
   */
  const reserve = ({ functionKey, environmentId }) => {
    const key = keyOf(functionKey, environmentId)
    const existing = workers.get(key)
    if (existing && !existing.stopping) {
      existing.holds = (existing.holds ?? 0) + 1
      // Chosen to make room for another place: it stays, and that place looks for room again.
      if (existing.evictFor) {
        existing.evictFor.target = null
        existing.evictFor = null
      }
      let held = true
      return {
        release() {
          if (!held) return
          held = false
          existing.holds -= 1
        },
      }
    }
    if (starting.has(key)) return NO_SLOT
    let target = null
    if (occupied() >= maxWorkers) {
      target = oldestIdle()
      if (!target) return null
    }
    reserved += 1
    const place = {
      place: true,
      held: true,
      target,
      release() {
        if (!place.held) return
        place.held = false
        reserved -= 1
        if (place.target?.evictFor === place) place.target.evictFor = null
        place.target = null
      },
    }
    if (target) target.evictFor = place
    return place
  }

  /**
   * The worker for an invocation, as `{ start, promise }`: `promise` resolves `{ worker, created }`,
   * `{ missing: true }`, or `{ busy: true }` when every process is busy; `start` is the worker
   * start the invocation waits on, if any. A start is shared by every invocation of its environment
   * that arrives while it runs (`waiters`); one that every waiter gave up on is `abandoned` and
   * never handed out. `slot` is what reserve gave it.
   */
  const workerFor = (fn, environmentId, request, slot) => {
    const key = keyOf(fn.key, environmentId)
    const existing = workers.get(key)
    if (existing) {
      slot?.release()
      return { promise: Promise.resolve({ worker: existing, created: false }) }
    }
    const pending = starting.get(key)
    if (pending) {
      slot?.release()
      pending.waiters += 1
      return {
        start: pending,
        promise: pending.promise.then((worker) => ({ worker, created: false })),
      }
    }
    if (!request.environment) {
      slot?.release()
      return { promise: Promise.resolve({ missing: true }) }
    }
    // A reserved place becomes the start's, and the process chosen to make room for it stops
    // now. Without a place (a replay, or a process that went away since the reservation), the
    // start needs room of its own.
    const target = slot?.place ? slot.target : null
    slot?.release()
    if (target && !target.stopping && target.pending === 0) evict(target)
    else if (!makeRoomNow()) return { promise: Promise.resolve({ busy: true }) }
    const start = { key, waiters: 1, abandoned: false, live: false }
    start.promise = startWorker(fn, request, key, start)
    starting.set(key, start)
    const done = () => {
      if (starting.get(key) === start) starting.delete(key)
    }
    start.promise.then(done, done)
    return {
      start,
      promise: start.promise.then((worker) => ({ worker, created: true })),
    }
  }

  /**
   * An invocation stopped waiting for its worker's start (its deadline passed). When no other
   * invocation waits on that start, the start is abandoned: later invocations start their own
   * worker, and this one is ended as soon as it exists. Otherwise it serves the others.
   */
  const leaveStart = (start, promise) => {
    promise.catch(() => {})
    if (!start) return
    start.waiters -= 1
    if (start.waiters > 0) return
    start.abandoned = true
    if (starting.get(start.key) === start) starting.delete(start.key)
    promise
      .then((late) => {
        if (late?.worker && !late.worker.started) killWorker(late.worker)
      })
      .catch(() => {})
  }

  const stopWorker = (worker) => {
    if (worker.exited) return Promise.resolve()
    if (!worker.stopping) {
      worker.stopping = true
      if (workers.get(worker.key) === worker) workers.delete(worker.key)
      timers.clearTimeout(worker.idleTimer)
      worker.idleTimer = null
      signal(worker, 'SIGTERM')
      worker.killTimer = timers.setTimeout(() => {
        worker.killTimer = null
        signal(worker, 'SIGKILL')
      }, graceMs)
    }
    return worker.exitPromise
  }

  /**
   * Ends a worker at once, the way Lambda ends an execution environment whose invocation timed
   * out: no grace, nothing it started survives, and its environment's next invocation starts a new
   * worker. Its credentials stop being served right away.
   */
  const killWorker = (worker) => {
    if (worker.exited) return
    worker.stopping = true
    worker.stale = true
    if (workers.get(worker.key) === worker) workers.delete(worker.key)
    timers.clearTimeout(worker.idleTimer)
    worker.idleTimer = null
    resources.credentials?.unregister(worker.workerId)
    signal(worker, 'SIGKILL')
  }

  /** A worker no later invocation is handed; it runs on until it exits. */
  const forgetWorker = (worker) => {
    if (workers.get(worker.key) === worker) workers.delete(worker.key)
  }

  /**
   * An invocation was handed `worker`: it is no longer idle, its credentials are the ones this
   * invocation's environment sent (a worker it did not just create may hold older ones), and
   * log lines belong to this invocation unless another one runs in the worker (a queued one takes
   * them over when it starts). Returns whether this is the worker's first invocation.
   */
  const beginInvocation = (worker, { requestId, environment, created }) => {
    if (!created && environment) {
      worker.registration.update(credentialsFrom(environment))
    }
    timers.clearTimeout(worker.idleTimer)
    worker.idleTimer = null
    if (worker.pending === 0) worker.logRequestId = requestId
    worker.pending += 1
    worker.idleOrder = null
    const first = worker.firstInvocation
    worker.firstInvocation = false
    return first
  }

  /**
   * The worker took the invocation from its Runtime API: it is running, and its log lines are this
   * invocation's. A new worker's init time ends here.
   */
  const markStarted = (worker, { requestId, startedAt, newWorker }) => {
    worker.started = true
    worker.requestId = requestId
    worker.logRequestId = requestId
    if (newWorker) worker.initMs = startedAt - worker.spawnedAt
  }

  /**
   * The invocation ended in `worker`. A worker whose handler could not load (`initError`) is on
   * its way out: the next invocation starts anew.
   */
  const endInvocation = (worker, { requestId, initError }) => {
    if (worker.requestId === requestId) worker.requestId = null
    worker.pending -= 1
    if (initError) {
      worker.stale = true
      forgetWorker(worker)
    }
  }

  const afterInvocation = (worker) => {
    if (stopped || worker.stopping || worker.exited || worker.pending > 0) {
      return
    }
    if (isStale(worker)) {
      stopWorker(worker)
      return
    }
    timers.clearTimeout(worker.idleTimer)
    idleCount += 1
    worker.idleOrder = idleCount
    worker.idleTimer = timers.setTimeout(() => {
      worker.idleTimer = null
      debug(`Dev Mode stopped the idle local worker of ${worker.functionKey}`)
      stopWorker(worker)
    }, idleMs)
  }

  const reload = (functionKeys) => {
    const keys = new Set(functionKeys)
    for (const key of keys) generations.set(key, generationOf(key) + 1)
    for (const worker of [...workers.values()]) {
      if (!keys.has(worker.functionKey) || worker.pending > 0) continue
      stopWorker(worker)
    }
  }

  return {
    reserve,
    workerFor,
    leaveStart,
    killWorker,
    stopWorker,
    forgetWorker,
    beginInvocation,
    markStarted,
    endInvocation,
    afterInvocation,
    reload,
    stopAll: () => Promise.all([...live].map(stopWorker)),
    killAll,
    size: () => workers.size,
    /** The handler processes: their function, pid and whether one is running an invocation. */
    list: () =>
      [...live].map((worker) => ({
        functionKey: worker.functionKey,
        pid: worker.child?.pid ?? null,
        busy: worker.pending > 0,
      })),
    isStopped: () => stopped,
    markStopped: () => {
      stopped = true
    },
  }
}
