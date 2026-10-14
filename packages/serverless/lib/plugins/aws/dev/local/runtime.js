/**
 * The laptop half of Dev Mode: a Lambda Runtime API and a credentials endpoint on loopback, and one
 * handler process (a local worker) per Lambda execution environment. A worker starts on its
 * environment's first invocation, serves that environment's invocations one at a time and stays warm
 * between them, the way Lambda keeps an environment; after a code change it is replaced on the next
 * invocation, after the idle time it exits, and every worker is stopped when the session ends.
 *
 * `invoke(request)` is the only way an invocation reaches a worker:
 *  - functionKey: the function's key in serverless.yml
 *  - environmentId: the Lambda execution environment it came from (stable for that environment)
 *  - headers: the Lambda-Runtime-* headers of that environment's /next response
 *  - event: the /next response body (a Buffer)
 *  - environment: that environment's variables; required on its first invocation, and whenever
 *    present the credentials served to its worker are refreshed from them
 * It resolves with the worker's reply (see runtime-api.js), `{ kind: 'expired' }` when the deadline
 * passed before the invocation could start, or `{ kind: 'not_in_dev' }`; it never rejects. A
 * stream reply's body must be read. An invocation still running at its deadline ends there, as in
 * Lambda: its worker is killed and it gets Lambda's `Sandbox.Timedout` error (a stream gets it in
 * its trailers). By then Lambda has ended the invocation too, so the relay's answer for it is
 * only for the record. Showing an invocation is best effort: whatever the output throws is logged
 * at debug level and never reaches the invocation.
 */
import os from 'os'
import { randomBytes as nodeRandomBytes } from 'crypto'
import { processAlive } from './leftovers.js'
import { errorReply } from './replies.js'
import { openRuntimeResources } from './runtime-resources.js'
import { MAX_WORKERS, createWorkerPool } from './worker-pool.js'
import { createDispatch } from './dispatch.js'
import { REPLAY_ENVIRONMENT_ID } from './replay.js'

export const WORKER_IDLE_MS = 5 * 60_000
export const WORKER_STOP_GRACE_MS = 2_000
export { DEADLINE_GRACE_MS } from './dispatch.js'

export const createLocalRuntime = ({
  serverless,
  serviceDir,
  functions,
  output,
  logger,
  timers,
  now = Date.now,
  processRef = process,
  machineEnv = process.env,
  idleMs = WORKER_IDLE_MS,
  graceMs = WORKER_STOP_GRACE_MS,
  randomBytes = nodeRandomBytes,
  tmpRoot = os.tmpdir(),
  platform = process.platform,
  signalProcess = (target, name) => process.kill(target, name),
  pid = process.pid,
  isAlive = processAlive,
  // Whether a dev build built a function: its worker then runs the build's output.
  isBuilt = () => false,
  // The handler file a dev build named for a function it built (relative to .serverless/build), or
  // null.
  builtFile = () => null,
  maxWorkers = MAX_WORKERS,
}) => {
  // The temp directory, the Runtime API and the credentials endpoint, set as start() opens them.
  const resources = {}
  let stopping = null

  const debug = (text) => {
    try {
      logger.debug(text)
    } catch {
      // Nothing else to tell it with.
    }
  }
  /** Runs `fn`; a throw is logged at debug level and goes no further. */
  const guarded = (what, fn) => {
    try {
      return fn()
    } catch (error) {
      debug(`Dev Mode could not ${what}: ${error?.message ?? error}`)
      return undefined
    }
  }
  const emit = (name, details) =>
    guarded(`show an invocation's ${name}`, () => output[name](details))

  const pool = createWorkerPool({
    serverless,
    serviceDir,
    logger,
    timers,
    now,
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
    builtFile,
    maxWorkers,
  })
  const dispatchInvocation = createDispatch({
    functions,
    pool,
    timers,
    now,
    emit,
    guarded,
    debug,
    isRunning: () => !pool.isStopped() && Boolean(resources.api),
    maxWorkers,
  })

  const start = async () => {
    await openRuntimeResources(
      { tmpRoot, pid, isAlive, randomBytes, now, debug },
      resources,
    )
    processRef.on('exit', pool.killAll)
  }

  // The environment each function's latest invocation brought (its role credentials included),
  // so a replay runs with current credentials. Held in memory only, and dropped at stop. A
  // replay's own environment is not a newer one of the function.
  const latestEnvironments = new Map()

  const invoke = async (request) => {
    if (
      !stopping &&
      request?.functionKey &&
      request.environment &&
      typeof request.environment === 'object' &&
      request.environmentId !== REPLAY_ENVIRONMENT_ID
    ) {
      latestEnvironments.set(request.functionKey, request.environment)
    }
    try {
      return await dispatchInvocation(request)
    } catch (error) {
      debug(`Dev Mode could not run an invocation: ${error?.message ?? error}`)
      return errorReply(
        'Runtime.Unknown',
        `Dev Mode could not run this invocation: ${error?.message ?? error}`,
      )
    } finally {
      // A place it reserved and never used is given back.
      request?.slot?.release?.()
    }
  }

  const stop = () => {
    if (stopping) return stopping
    latestEnvironments.clear()
    pool.markStopped()
    stopping = (async () => {
      await pool.stopAll()
      await resources.close?.()
      processRef.removeListener?.('exit', pool.killAll)
    })()
    return stopping
  }

  return {
    start,
    invoke,
    /**
     * Reserves the handler process an invocation needs before it is accepted (see worker-pool.js):
     * `{ release() }`, given to `invoke` as `slot`, or null when every process is busy.
     */
    reserve: (request) => (pool.isStopped() ? null : pool.reserve(request)),
    reload: pool.reload,
    stop,
    workerCount: pool.size,
    /** The handler processes, with whether each is running an invocation. */
    workers: () => pool.list(),
    latestEnvironment: (functionKey) =>
      latestEnvironments.get(functionKey) ?? null,
    has: (functionKey) => functions.has(functionKey),
  }
}
