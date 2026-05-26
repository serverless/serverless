import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { runtimeToImage } from './java-image.js'
import ServerlessError from '../../../../../serverless-error.js'

const NO_TIMEOUT_FALLBACK_MS = 365 * 24 * 60 * 60 * 1000
const CONTAINER_NAME_PREFIX = 'serverless-offline-java-'

/**
 * @typedef {object} PoolEntry
 * @property {import('dockerode').Container} container
 * @property {'idle' | 'busy' | 'terminating'} state
 * @property {'invalidate' | 'terminate' | 'evict' | null} cancelReason
 * @property {NodeJS.Timeout | null} pendingTimeout
 * @property {string} image
 * @property {string} containerName
 */

/**
 * Java child-process Lambda runner backed by `public.ecr.aws/lambda/java`
 * containers. Spawns a long-lived container per functionKey; the
 * container's built-in RIC polls our Runtime API endpoints exposed by
 * the aws-api-server. The runner only enqueues invocations into the
 * shared queue — request/response framing is HTTP, not stdio.
 *
 * The queue's pending/waiter rendezvous IS the readiness handshake:
 * after `container.start()` we transition straight to `idle` and let the
 * very next `enqueue()` park until the RIC's first /next poll drains it.
 * No separate `'spawning'` state needed.
 *
 * @param {object} options
 * @param {number} options.idleEvictionMs
 * @param {string} options.runtimeApiBase  Full URL with scheme, e.g.
 *   `http://0.0.0.0:3002/runtime`. The runner swaps the host portion to
 *   `host.docker.internal` when assembling each container's
 *   AWS_LAMBDA_RUNTIME_API env value (so the container can reach the
 *   host across Docker's network boundary).
 * @param {object} options.runtimeApiQueue  Shared invocation queue.
 * @param {object} options.dockerClient    `DockerClient` from @serverless/util.
 * @param {function} options.ensureImageReady  Image-readiness check.
 * @param {object} [options.log]
 * @param {string} [options.servicePath]
 * @param {(opts: object) => Promise<object>} [options.createContainerOverride]
 *   Test seam. Receives the full createContainer options object; returns a
 *   Container-shaped object.
 *
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createJavaRunner({
  idleEvictionMs,
  runtimeApiBase,
  runtimeApiQueue,
  dockerClient,
  ensureImageReady,
  log = {},
  servicePath = process.cwd(),
  createContainerOverride,
}) {
  if (!runtimeApiBase) {
    throw new Error('createJavaRunner: runtimeApiBase is required')
  }
  if (!runtimeApiQueue) {
    throw new Error('createJavaRunner: runtimeApiQueue is required')
  }
  if (!dockerClient) {
    throw new Error('createJavaRunner: dockerClient is required')
  }
  if (!ensureImageReady) {
    throw new Error('createJavaRunner: ensureImageReady is required')
  }

  /** @type {Map<string, PoolEntry>} */
  const pool = new Map()

  // Race guard: terminate() may run between _ensureEntry's awaits and
  // its return; this flag + the inFlightSpawns Set prevent orphan
  // containers from outliving shutdown.
  let terminated = false
  /** @type {Set<Promise<unknown>>} */
  const inFlightSpawns = new Set()

  /**
   * Build the `AWS_LAMBDA_RUNTIME_API` env value for a container. The
   * container reaches our awsApiPort via `host.docker.internal`, which
   * resolves to the host across Docker's network boundary thanks to
   * `--add-host=host.docker.internal:host-gateway` (set in HostConfig
   * below). We swap whatever host is in `runtimeApiBase` (typically
   * `0.0.0.0` or `localhost`) for `host.docker.internal`.
   */
  function _apiBaseFor(functionKey) {
    // Strip scheme + trailing slash, replace host with host.docker.internal.
    // runtimeApiBase looks like 'http://0.0.0.0:3002/runtime'.
    const url = new URL(runtimeApiBase)
    return `host.docker.internal:${url.port}${url.pathname.replace(/\/$/, '')}/${functionKey}`
  }

  async function _ensureEntry(functionKey, args) {
    const existing = pool.get(functionKey)
    if (existing && existing.state !== 'terminating') {
      return existing
    }

    if (!args?.artifactPath) {
      throw new ServerlessError(
        `Java artifact not declared for function ${functionKey}. ` +
          `Set "package.artifact" to your compiled JAR ` +
          `(e.g. "target/${functionKey}-1.0.jar") and run "mvn package" ` +
          `before "sls offline".`,
        'OFFLINE_JAVA_ARTIFACT_MISSING',
      )
    }

    const image = runtimeToImage(args.runtime)
    // Image was pre-pulled at boot; this is a fast cache check.
    await ensureImageReady({ dockerClient, image, log })

    if (terminated) {
      throw new ServerlessError(
        'Lambda runner terminated during invocation',
        'OFFLINE_WORKER_TERMINATED',
      )
    }

    const artifactDir = path.dirname(args.artifactPath)
    const context = args.context ?? {}
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

    // JAVA_OPTS → JAVA_TOOL_OPTIONS inside the container. The JVM picks
    // up JAVA_TOOL_OPTIONS automatically; we can't pass extra CLI args
    // to the in-container java process from Docker's outside.
    const javaOptsRaw = (process.env.JAVA_OPTS ?? '').trim()
    const javaToolOptionsEnv = javaOptsRaw
      ? { JAVA_TOOL_OPTIONS: javaOptsRaw }
      : {}

    const containerEnv = {
      ...lambdaEnv,
      ...(args.environment ?? {}),
      AWS_LAMBDA_RUNTIME_API: apiBase,
      _HANDLER: handlerString,
      ...javaToolOptionsEnv,
    }

    const containerName = `${CONTAINER_NAME_PREFIX}${functionKey}-${randomUUID()}`

    const createOpts = {
      Image: image,
      name: containerName,
      Cmd: [handlerString],
      Env: Object.entries(containerEnv).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        AutoRemove: true,
        // The AWS Lambda Java image classpath includes `/var/task/lib/*`
        // for JAR dependencies; mounting the artifact directory there
        // puts the user's compiled JAR on the classpath. Mounting at
        // `/var/task` instead drops the JAR off the classpath (only
        // loose .class files at /var/task/ are picked up there) and
        // surfaces as ClassNotFoundException.
        Binds: [`${artifactDir}:/var/task/lib:ro`],
        ExtraHosts: ['host.docker.internal:host-gateway'],
      },
    }

    const docker = dockerClient.getDockerodeClient()
    const createContainerFn =
      createContainerOverride ?? ((opts) => docker.createContainer(opts))

    /** @type {import('dockerode').Container} */
    const container = await createContainerFn(createOpts)

    // Attach BEFORE start so we capture early container output (JIT
    // warnings, class-load errors). Docker holds output until a consumer
    // is attached. demuxStream splits the multiplexed protocol Docker
    // uses into stdout / stderr.
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    })
    const stdoutSink = makeLineForwarder(functionKey, 'debug')
    const stderrSink = makeLineForwarder(functionKey, 'error')
    docker.modem.demuxStream(stream, stdoutSink, stderrSink)

    await container.start()

    /** @type {PoolEntry} */
    const entry = {
      container,
      // Straight to idle — the queue's pending/waiter rendezvous IS the
      // readiness handshake. No 'spawning' state.
      state: 'idle',
      cancelReason: null,
      pendingTimeout: null,
      image,
      containerName,
    }

    // container.wait() resolves with { StatusCode } on exit. Drives the
    // same handleExit / handleError paths as a child-process runner's
    // child.on('exit') + child.on('error') would.
    container
      .wait()
      .then(({ StatusCode }) => _handleExit(functionKey, entry, StatusCode))
      .catch((err) => _handleError(functionKey, entry, err))

    pool.set(functionKey, entry)
    return entry
  }

  function makeLineForwarder(functionKey, level) {
    // demuxStream returns Writable-like sinks; we get raw chunks here.
    return {
      write(chunk) {
        const text = chunk.toString().trimEnd()
        if (!text) return
        if (typeof log?.[level] === 'function') {
          log[level](`[${functionKey}] ${text}`)
        }
      },
    }
  }

  function _handleExit(functionKey, entry, statusCode) {
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
          `Lambda container for ${functionKey} exited unexpectedly ` +
            `(StatusCode=${statusCode})`,
          'OFFLINE_WORKER_EXITED',
        ),
      )
    }
    entry.state = 'terminating'
  }

  function _handleError(functionKey, entry, err) {
    // AutoRemove: true causes the daemon to remove the container as soon
    // as it exits. dockerode's container.wait() then frequently rejects
    // with `(HTTP code 404) no such container`. Treat that as a clean
    // exit (StatusCode 0) — the cancelReason branch below routes the
    // rejection correctly for invalidate/terminate paths.
    const statusCode = err?.statusCode ?? err?.status
    const message = String(err?.message ?? err ?? '')
    if (statusCode === 404 || /no such container/i.test(message)) {
      _handleExit(functionKey, entry, 0)
      return
    }

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
      runtimeApiQueue.rejectAll(functionKey, err)
      if (typeof log?.error === 'function') {
        log.error(
          `[${functionKey}] Java container error: ${err.message ?? err}`,
        )
      }
    }
    entry.state = 'terminating'
  }

  function _scheduleIdleEviction(functionKey, entry) {
    if (idleEvictionMs == null || idleEvictionMs <= 0) return
    if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
    }
    entry.pendingTimeout = setTimeout(async () => {
      entry.pendingTimeout = null
      if (entry.state !== 'idle') return
      entry.state = 'terminating'
      entry.cancelReason = 'evict'
      if (pool.get(functionKey) === entry) {
        pool.delete(functionKey)
      }
      try {
        await entry.container.stop({ t: 5 })
      } catch {
        // Container may already be gone — ignore.
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
      // Fire-and-forget; exit handler also runs.
      entry.container.stop({ t: 5 }).catch(() => {})
    },

    async terminate() {
      terminated = true
      await Promise.allSettled(inFlightSpawns)

      const stops = []
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
        // stop() resolves when the daemon accepts the request — not when
        // the container has exited. Await wait() too so the container's
        // wait() continuation can't fire AFTER terminate() resolves and
        // call rejectAll on a torn-down queue.
        stops.push(
          Promise.all([
            entry.container.stop({ t: 5 }).catch(() => {}),
            entry.container.wait().catch(() => {}),
          ]),
        )
      }
      pool.clear()
      await Promise.all(stops)
    },
  }
}
