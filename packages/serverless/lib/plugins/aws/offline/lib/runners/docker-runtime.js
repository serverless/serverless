import { randomUUID } from 'node:crypto'
import path from 'node:path'

import ServerlessError from '../../../../../serverless-error.js'
import { buildLambdaRuntimeEnv } from './lambda-env.js'
import { resolveDockerCodeMount } from './docker-code-mount.js'
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
      })
      const javaOptsRaw = (process.env.JAVA_OPTS ?? '').trim()
      const javaToolOptionsEnv =
        javaOptsRaw && image.startsWith('public.ecr.aws/lambda/java:')
          ? { JAVA_TOOL_OPTIONS: javaOptsRaw }
          : {}
      const containerEnv = {
        ...lambdaEnv,
        ...(args.environment ?? {}),
        IS_OFFLINE: 'true',
        AWS_LAMBDA_RUNTIME_API: _apiBaseFor(functionKey),
        _HANDLER: handlerString,
        ...javaToolOptionsEnv,
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
      if (entry.pendingTimeout !== null) {
        clearTimeout(entry.pendingTimeout)
        entry.pendingTimeout = null
      }
      entry.state = 'terminating'
      entry.cancelReason = 'invalidate'
      pool.delete(functionKey)
      _rejectTerminated(functionKey)
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
