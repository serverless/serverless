import { randomUUID } from 'node:crypto'
import path from 'node:path'

import ServerlessError from '../../../../../serverless-error.js'
import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { resolveDockerCodeMount } from './docker-code-mount.js'
import { buildLayerMount, layerEnvFor } from './layers/layer-mounts.js'
import {
  architectureToDockerPlatform,
  architectureToGoArch,
  runtimeToDockerImage,
} from './docker-runtime-image.js'
import { ensureBuilt } from './go-builder.js'

const NO_TIMEOUT_FALLBACK_MS = 365 * 24 * 60 * 60 * 1000
const CONTAINER_NAME_PREFIX = 'serverless-offline-docker-'

export { CONTAINER_NAME_PREFIX }

/**
 * @param {object} options
 * @param {number} options.idleEvictionMs
 * @param {string} options.runtimeApiBase
 * @param {object} options.runtimeApiQueue
 * @param {object} options.dockerClient
 * @param {function} options.ensureImageReady
 * @param {string} [options.servicePath]
 * @param {object} [options.log]
 * @param {string} [options.dockerHost]
 * @param {string | null} [options.dockerHostServicePath]
 * @param {string | null} [options.dockerNetwork]
 * @param {boolean} [options.dockerReadOnly]
 * @param {(opts: object) => Promise<object>} [options.createContainerOverride]
 * @returns {{ invoke(args: object): Promise<unknown>, invalidate(functionKey: string): void, terminate(): Promise<void> }}
 */
export function createDockerRuntimeRunner({
  idleEvictionMs,
  runtimeApiBase,
  runtimeApiQueue,
  dockerClient,
  ensureImageReady,
  servicePath = process.cwd(),
  log = {},
  dockerHost = 'host.docker.internal',
  dockerHostServicePath = null,
  dockerNetwork = null,
  dockerReadOnly = true,
  createContainerOverride,
}) {
  if (!runtimeApiBase) {
    throw new Error('createDockerRuntimeRunner: runtimeApiBase is required')
  }
  if (!runtimeApiQueue) {
    throw new Error('createDockerRuntimeRunner: runtimeApiQueue is required')
  }
  if (!dockerClient) {
    throw new Error('createDockerRuntimeRunner: dockerClient is required')
  }
  if (!ensureImageReady) {
    throw new Error('createDockerRuntimeRunner: ensureImageReady is required')
  }

  const pool = new Map()
  let terminated = false
  const inFlightSpawns = new Set()
  const inFlightSpawnsByFunction = new Map()

  function _apiBaseFor(functionKey) {
    const url = new URL(runtimeApiBase)
    return `${dockerHost}:${url.port}${url.pathname.replace(/\/$/, '')}/${functionKey}`
  }

  /**
   * Rewrite the offline emulator endpoint so it is reachable from inside the
   * container. The facade hands us a host-loopback URL (e.g.
   * `http://localhost:<awsApiPort>`); a container cannot reach the host's
   * loopback, so the host is swapped to the docker gateway (`dockerHost`,
   * default `host.docker.internal`) — the same mapping `_apiBaseFor` applies to
   * the runtime API. Returns `undefined` when no endpoint was supplied so
   * `AWS_ENDPOINT_URL` is left unset.
   *
   * @param {string | undefined} endpointUrl
   * @returns {string | undefined}
   */
  function _containerEndpointUrl(endpointUrl) {
    if (typeof endpointUrl !== 'string' || endpointUrl.length === 0) {
      return undefined
    }
    try {
      const url = new URL(endpointUrl)
      url.hostname = dockerHost
      return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`
    } catch {
      return endpointUrl
    }
  }

  async function _resolveArgsForDocker(args) {
    if (/^java\d+(\.al2)?$/.test(args.runtime ?? '') && !args.artifactPath) {
      throw new ServerlessError(
        `Java artifact not declared for function ${args.functionKey}. ` +
          `Set "package.artifact" to your compiled JAR ` +
          `(e.g. "target/${args.functionKey}-1.0.jar") and run "mvn package" ` +
          `before "sls offline".`,
        'OFFLINE_JAVA_ARTIFACT_MISSING',
      )
    }

    if (
      /^provided\.(al2|al2023)$/.test(args.runtime ?? '') &&
      !args.artifactPath
    ) {
      const sourceDir = path.dirname(args.handlerPath)
      const buildCacheRoot = path.join(
        servicePath,
        '.serverless-offline',
        'docker-builds',
      )
      const { binaryPath } = await ensureBuilt({
        functionKey: args.functionKey,
        sourceDir,
        sourceFile: args.handlerPath,
        servicePath,
        buildCacheRoot,
        env: {
          ...process.env,
          CGO_ENABLED: '0',
          GOOS: 'linux',
          GOARCH: architectureToGoArch(args.architecture),
        },
        binaryName: 'bootstrap',
      })
      return { ...args, artifactPath: binaryPath }
    }
    return args
  }

  async function _ensureEntry(functionKey, originalArgs) {
    const existing = pool.get(functionKey)
    if (existing && existing.state !== 'terminating') return existing
    const inFlightForFunction = inFlightSpawnsByFunction.get(functionKey)
    if (inFlightForFunction) return inFlightForFunction

    const spawnPromise = (async () => {
      const args = await _resolveArgsForDocker(originalArgs)
      const image = runtimeToDockerImage(args.runtime, args.artifactPath)
      const platform = architectureToDockerPlatform(args.architecture)
      await ensureImageReady({ dockerClient, image, platform, log })

      if (terminated) {
        throw new ServerlessError(
          'Lambda runner terminated during invocation',
          'OFFLINE_WORKER_TERMINATED',
        )
      }

      const context = args.context ?? {}
      const region = context.region ?? process.env.AWS_REGION ?? 'us-east-1'
      const functionName = context.functionName ?? functionKey
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
        // Offline-runtime SDK targeting — same fields the host runners forward,
        // so a Dockerized handler's AWS SDK client hits the local emulator with
        // placeholder credentials (and the synthetic authorizer under --noAuth).
        // The endpoint host is rewritten to the docker gateway so it resolves
        // from inside the container. IS_OFFLINE is set once below (authoritative
        // over user environment), so it is intentionally not passed here.
        endpointUrl: _containerEndpointUrl(context.endpointUrl),
        accessKeyId: context.accessKeyId,
        secretAccessKey: context.secretAccessKey,
        authorizer: context.authorizer,
      })
      const javaOptsRaw = (process.env.JAVA_OPTS ?? '').trim()
      const javaToolOptionsEnv =
        javaOptsRaw && image.startsWith('public.ecr.aws/lambda/java:')
          ? { JAVA_TOOL_OPTIONS: javaOptsRaw }
          : {}
      const layerOptDir = args.layers?.optDir ?? null
      const layerMount = layerOptDir
        ? buildLayerMount({
            optDir: layerOptDir,
            servicePath,
            dockerHostServicePath,
          })
        : null
      const layerEnv = layerOptDir ? layerEnvFor(args.runtime) : {}
      const containerEnv = {
        ...lambdaEnv,
        ...(args.environment ?? {}),
        IS_OFFLINE: 'true',
        AWS_LAMBDA_RUNTIME_API: _apiBaseFor(functionKey),
        _HANDLER: handlerString,
        ...javaToolOptionsEnv,
      }
      if (layerEnv.NODE_PATH_PREFIX) {
        containerEnv.NODE_PATH = containerEnv.NODE_PATH
          ? `${layerEnv.NODE_PATH_PREFIX}:${containerEnv.NODE_PATH}`
          : layerEnv.NODE_PATH_PREFIX
      }
      const { mounts } = await resolveDockerCodeMount({
        functionKey,
        runtime: args.runtime,
        artifactPath: args.artifactPath,
        handlerPath: args.handlerPath,
        codeDir: args.codeDir,
        servicePath,
        dockerHostServicePath,
        dockerReadOnly,
        layerMounts: layerMount ? [layerMount] : [],
      })
      const containerName = `${CONTAINER_NAME_PREFIX}${functionKey}-${randomUUID()}`
      const hostConfig = {
        AutoRemove: true,
        Binds: mounts.map((mount) => mount.bind),
        ExtraHosts: ['host.docker.internal:host-gateway'],
      }
      if (dockerNetwork) hostConfig.NetworkMode = dockerNetwork

      const createOpts = {
        Image: image,
        name: containerName,
        Cmd: [handlerString],
        Env: Object.entries(containerEnv).map(([k, v]) => `${k}=${v}`),
        HostConfig: hostConfig,
        platform,
      }
      if (/^provided\.(al2|al2023)$/.test(args.runtime ?? '')) {
        createOpts.Entrypoint = ['/var/task/bootstrap']
        createOpts.Cmd = []
      }

      const docker = dockerClient.getDockerodeClient()
      const createContainerFn =
        createContainerOverride ?? ((opts) => docker.createContainer(opts))
      const container = await createContainerFn(createOpts)

      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      })
      const stdoutSink = makeLineForwarder(functionKey, 'debug')
      const stderrSink = makeLineForwarder(functionKey, 'error')
      docker.modem.demuxStream(stream, stdoutSink, stderrSink)

      await container.start()

      const entry = {
        container,
        state: 'idle',
        activeInvocations: 0,
        cancelReason: null,
        pendingTimeout: null,
        image,
        containerName,
      }

      container
        .wait()
        .then(({ StatusCode }) => _handleExit(functionKey, entry, StatusCode))
        .catch((err) => _handleError(functionKey, entry, err))

      pool.set(functionKey, entry)
      return entry
    })()
    inFlightSpawnsByFunction.set(functionKey, spawnPromise)
    try {
      return await spawnPromise
    } finally {
      if (inFlightSpawnsByFunction.get(functionKey) === spawnPromise) {
        inFlightSpawnsByFunction.delete(functionKey)
      }
    }
  }

  function makeLineForwarder(functionKey, level) {
    return {
      write(chunk) {
        const text = chunk.toString().trimEnd()
        if (!text) return
        const effectiveLevel = terminated ? 'debug' : level
        if (typeof log?.[effectiveLevel] === 'function') {
          log[effectiveLevel](`[${functionKey}] ${text}`)
        }
      },
    }
  }

  function _rejectTerminated(functionKey) {
    runtimeApiQueue.rejectAll(
      functionKey,
      new ServerlessError(
        'Lambda runner terminated during invocation',
        'OFFLINE_WORKER_TERMINATED',
      ),
    )
  }

  function _handleExit(functionKey, entry, statusCode) {
    if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
      entry.pendingTimeout = null
    }
    if (pool.get(functionKey) === entry) pool.delete(functionKey)
    if (entry.cancelReason !== null) {
      _rejectTerminated(functionKey)
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
    if (pool.get(functionKey) === entry) pool.delete(functionKey)
    if (entry.cancelReason !== null) {
      _rejectTerminated(functionKey)
    } else {
      runtimeApiQueue.rejectAll(functionKey, err)
      if (typeof log?.error === 'function') {
        log.error(
          `[${functionKey}] Lambda container error: ${err.message ?? err}`,
        )
      }
    }
    entry.state = 'terminating'
  }

  /**
   * Stop a specific pool entry's container and drop it from the pool. Shared
   * by `invalidate()` and the per-invocation timeout path. Idempotent: the
   * container `wait()` handler also cleans up, and a re-call on an
   * already-terminating entry is a no-op.
   *
   * @param {string} functionKey
   * @param {object} entry  The exact entry to stop (not a key lookup) so a
   *   timeout for a since-swapped entry can't take down its replacement.
   * @param {'invalidate' | 'terminate' | 'evict'} reason
   */
  function _terminateEntry(functionKey, entry, reason) {
    if (entry.state === 'terminating') return
    if (entry.pendingTimeout !== null) {
      clearTimeout(entry.pendingTimeout)
      entry.pendingTimeout = null
    }
    entry.state = 'terminating'
    entry.cancelReason = reason
    if (pool.get(functionKey) === entry) pool.delete(functionKey)
    _rejectTerminated(functionKey)
    entry.container.stop({ t: 5 }).catch(() => {})
  }

  function _scheduleIdleEviction(functionKey, entry) {
    if (idleEvictionMs == null || idleEvictionMs <= 0) return
    if (entry.pendingTimeout !== null) clearTimeout(entry.pendingTimeout)
    entry.pendingTimeout = setTimeout(async () => {
      entry.pendingTimeout = null
      if (entry.state !== 'idle') return
      entry.state = 'terminating'
      entry.cancelReason = 'evict'
      if (pool.get(functionKey) === entry) pool.delete(functionKey)
      try {
        await entry.container.stop({ t: 5 })
      } catch {
        // Container may already be gone.
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
      entry.activeInvocations += 1
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }

      const invocation = runtimeApiQueue.enqueue(functionKey, {
        payload: args.event,
        timeoutMs: args.timeoutMs ?? NO_TIMEOUT_FALLBACK_MS,
        invokedFunctionArn: args.context?.invokedFunctionArn ?? '',
        // Real Lambda kills the sandbox on timeout. Stop THIS container so
        // the next invoke creates a fresh one rather than reusing a container
        // still running the timed-out handler.
        onTimeout: () => _terminateEntry(functionKey, entry, 'invalidate'),
      })

      try {
        return await invocation
      } finally {
        entry.activeInvocations = Math.max(0, entry.activeInvocations - 1)
        if (pool.get(functionKey) === entry && entry.state !== 'terminating') {
          if (entry.activeInvocations === 0) {
            entry.state = 'idle'
            _scheduleIdleEviction(functionKey, entry)
          }
        }
      }
    },

    invalidate(functionKey) {
      const entry = pool.get(functionKey)
      if (!entry) return
      _terminateEntry(functionKey, entry, 'invalidate')
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
        _rejectTerminated(functionKey)
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
