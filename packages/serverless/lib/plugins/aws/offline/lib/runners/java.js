import { spawn as nodeSpawn } from 'node:child_process'

import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { resolveClasspath as defaultResolveClasspath } from './java-classpath.js'
import { checkJavaVersion as defaultCheckJavaVersion } from './java-version-check.js'
import ServerlessError from '../../../../../serverless-error.js'

const NO_TIMEOUT_FALLBACK_MS = 365 * 24 * 60 * 60 * 1000
const RIC_MAIN_CLASS =
  'com.amazonaws.services.lambda.runtime.api.client.AWSLambda'

/**
 * @typedef {object} PoolEntry
 * @property {import('node:child_process').ChildProcessWithoutNullStreams} child
 * @property {'idle' | 'busy' | 'terminating'} state
 * @property {'invalidate' | 'terminate' | 'evict' | null} cancelReason
 * @property {NodeJS.Timeout | null} pendingTimeout
 * @property {string} classpath
 */

/**
 * Java child-process Lambda runner. Spawns a long-lived JVM per functionKey
 * running the official AWS Lambda Java Runtime Interface Client (RIC). The
 * RIC polls our `/runtime/{functionKey}/2018-06-01/runtime/invocation/...`
 * Hapi routes; we enqueue invocations into the shared queue that backs
 * those routes. The runner never touches the child's stdio for request /
 * response framing (only for log forwarding).
 *
 * The queue's pending/waiter rendezvous IS the readiness handshake: after
 * spawn we transition straight to `idle` and let the very next `enqueue()`
 * park until the RIC's first `/next` call drains it.
 *
 * Strictly pre-built artifact: the user's `package.artifact` must point at
 * an existing compiled JAR. The runner does NOT invoke `mvn` or `gradle`.
 *
 * @param {object} options
 * @param {number} options.idleEvictionMs
 * @param {string} options.runtimeApiBase  Full URL with scheme, e.g.
 *   `'http://localhost:3002/runtime'`. Stripped to `host:port/runtime/<fn>`
 *   for AWS_LAMBDA_RUNTIME_API per the RIC's convention.
 * @param {object} options.runtimeApiQueue  Shared invocation queue.
 * @param {object} [options.log]
 * @param {string} [options.servicePath]
 * @param {string} [options.javaCommand]  Defaults to `'java'`.
 * @param {Function} [options.spawnOverride]  Test seam.
 * @param {Function} [options.resolveClasspath]  Test seam.
 * @param {Function} [options.checkJavaVersion]  Test seam.
 *
 * @returns {{ invoke(args: object): Promise<unknown>, invalidate(functionKey: string): void, terminate(): Promise<void> }}
 */
export function createJavaRunner({
  idleEvictionMs,
  runtimeApiBase,
  runtimeApiQueue,
  log = {},
  servicePath = process.cwd(),
  javaCommand = 'java',
  spawnOverride,
  resolveClasspath = defaultResolveClasspath,
  checkJavaVersion = defaultCheckJavaVersion,
}) {
  if (!runtimeApiBase) {
    throw new Error('createJavaRunner: runtimeApiBase is required')
  }
  if (!runtimeApiQueue) {
    throw new Error('createJavaRunner: runtimeApiQueue is required')
  }

  const spawnFn = spawnOverride ?? nodeSpawn

  /** @type {Map<string, PoolEntry>} */
  const pool = new Map()

  // Race guard: terminate() may run between an _ensureEntry's await and
  // its return; the flag + inFlightSpawns Set prevent orphan children.
  let terminated = false
  /** @type {Set<Promise<unknown>>} */
  const inFlightSpawns = new Set()

  // Cache the JDK version check across functionKeys — same local JVM
  // regardless of how many functions we serve. First-invoke cost only.
  /** @type {Promise<{majorVersion: number|null, raw: string}> | null} */
  let cachedVersionCheck = null

  function _apiBaseFor(functionKey) {
    const trimmed = runtimeApiBase
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
    return `${trimmed}/${functionKey}`
  }

  function _forward(stream, functionKey, level) {
    if (!stream) return
    stream.on('data', (chunk) => {
      const text = chunk.toString().trimEnd()
      if (!text) return
      const emit = log?.[level]
      if (typeof emit === 'function') {
        emit(`[${functionKey}] ${text}`)
      }
    })
  }

  async function _ensureEntry(functionKey, args) {
    const existing = pool.get(functionKey)
    if (existing && existing.state !== 'terminating') {
      return existing
    }

    if (!cachedVersionCheck) {
      cachedVersionCheck = checkJavaVersion({
        javaCommand,
        declaredRuntime: args?.runtime,
        log,
      })
    }
    try {
      await cachedVersionCheck
    } catch (err) {
      cachedVersionCheck = null
      throw err
    }

    const { classpath } = await resolveClasspath({
      functionKey,
      artifactPath: args?.artifactPath,
    })

    if (terminated) {
      throw new ServerlessError(
        'Lambda runner terminated during invocation',
        'OFFLINE_WORKER_TERMINATED',
      )
    }

    const context = args?.context ?? {}
    const region = context.region ?? process.env.AWS_REGION ?? 'us-east-1'
    const functionName = context.functionName
    const memoryLimitInMB = String(context.memoryLimitInMB ?? 1024)
    const logGroupName = context.logGroupName ?? `/aws/lambda/${functionName}`
    const logStreamName = context.logStreamName ?? ''
    const handlerString = context.handler ?? ''

    const lambdaEnv = buildLambdaRuntimeEnv({
      functionName,
      memoryLimitInMB,
      invokedFunctionArn: context.invokedFunctionArn,
      logGroupName,
      logStreamName,
      handler: handlerString,
      region,
    })

    const apiBase = _apiBaseFor(functionKey)

    // JAVA_OPTS — Maven/Gradle/Tomcat convention. Whitespace-split, empty
    // entries dropped. Applied as JVM args BEFORE -cp.
    const javaOptsRaw = (process.env.JAVA_OPTS ?? '').trim()
    const extraJvmArgs = javaOptsRaw
      ? javaOptsRaw.split(/\s+/).filter(Boolean)
      : []

    const jvmArgs = [
      ...extraJvmArgs,
      '-cp',
      classpath,
      RIC_MAIN_CLASS,
      handlerString,
    ]

    const env = {
      ...process.env,
      ...lambdaEnv,
      ...(args.environment ?? {}),
      AWS_LAMBDA_RUNTIME_API: apiBase,
      _HANDLER: handlerString,
    }

    const child = spawnFn(javaCommand, jvmArgs, {
      cwd: servicePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    /** @type {PoolEntry} */
    const entry = {
      child,
      // State goes straight to `idle`; the queue's pending/waiter rendezvous
      // IS the readiness handshake. No 'spawning' state needed.
      state: 'idle',
      cancelReason: null,
      pendingTimeout: null,
      classpath,
    }

    _forward(child.stdout, functionKey, 'debug')
    // Java RIC and user-handler exceptions surface on stderr — log at
    // `error` level so stack traces are visible by default. (See M5d
    // code-review note about the dead `'error'` branch — now wired.)
    _forward(child.stderr, functionKey, 'error')

    child.on('exit', (code, signal) => {
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      if (entry.cancelReason !== null) {
        runtimeApiQueue.rejectAll(
          functionKey,
          new ServerlessError(
            'Lambda runner terminated during invocation',
            'OFFLINE_WORKER_TERMINATED',
          ),
        )
      } else {
        runtimeApiQueue.rejectAll(
          functionKey,
          new ServerlessError(
            `Lambda bootstrap for ${functionKey} exited unexpectedly ` +
              `(code=${code}, signal=${signal})`,
            'OFFLINE_WORKER_EXITED',
          ),
        )
      }
      entry.state = 'terminating'
    })

    child.on('error', (err) => {
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      runtimeApiQueue.rejectAll(functionKey, err)
      entry.state = 'terminating'
      if (typeof log?.error === 'function') {
        log.error(`[${functionKey}] Java runtime spawn error: ${err.message}`)
      }
    })

    pool.set(functionKey, entry)
    return entry
  }

  function _scheduleIdleEviction(functionKey, entry) {
    if (idleEvictionMs == null || idleEvictionMs <= 0) return
    if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
    }
    entry.pendingTimeout = setTimeout(() => {
      entry.pendingTimeout = null
      if (entry.state !== 'idle') return
      entry.state = 'terminating'
      entry.cancelReason = 'evict'
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      try {
        entry.child.kill('SIGTERM')
      } catch {
        // ignore — child may already be gone
      }
    }, idleEvictionMs)
  }

  return {
    async invoke(args) {
      const { functionKey } = args
      if (terminated) {
        throw new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        )
      }
      const spawnPromise = _ensureEntry(functionKey, args)
      inFlightSpawns.add(spawnPromise)
      let entry
      try {
        entry = await spawnPromise
      } finally {
        inFlightSpawns.delete(spawnPromise)
      }

      if (entry.state === 'terminating') {
        throw new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        )
      }

      entry.state = 'busy'
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }

      const invocation = runtimeApiQueue.enqueue(functionKey, {
        payload: args.event,
        timeoutMs: args.timeoutMs ?? NO_TIMEOUT_FALLBACK_MS,
        invokedFunctionArn: args.context?.invokedFunctionArn ?? '',
      })

      try {
        return await invocation
      } finally {
        if (pool.get(functionKey) === entry && entry.state !== 'terminating') {
          entry.state = 'idle'
          _scheduleIdleEviction(functionKey, entry)
        }
      }
    },

    invalidate(functionKey) {
      const entry = pool.get(functionKey)
      if (!entry) return
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      entry.state = 'terminating'
      entry.cancelReason = 'invalidate'
      pool.delete(functionKey)
      runtimeApiQueue.rejectAll(
        functionKey,
        new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        ),
      )
      try {
        entry.child.kill('SIGTERM')
      } catch {
        // ignore
      }
    },

    async terminate() {
      terminated = true
      await Promise.allSettled(inFlightSpawns)

      const exits = []
      for (const [functionKey, entry] of pool.entries()) {
        if (entry.pendingTimeout !== null) {
          clearTimeout(entry.pendingTimeout)
          entry.pendingTimeout = null
        }
        entry.state = 'terminating'
        entry.cancelReason = 'terminate'
        runtimeApiQueue.rejectAll(
          functionKey,
          new ServerlessError(
            'Lambda runner terminated during invocation',
            'OFFLINE_WORKER_TERMINATED',
          ),
        )
        exits.push(
          new Promise((resolve) => {
            if (entry.child.exitCode !== null || entry.child.signalCode) {
              resolve()
              return
            }
            entry.child.once('exit', () => resolve())
            entry.child.once('error', () => resolve())
          }),
        )
        try {
          entry.child.kill('SIGTERM')
        } catch {
          // ignore
        }
      }
      pool.clear()
      await Promise.all(exits)
    },
  }
}
