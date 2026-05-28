import { createGoRunner } from './go.js'
import { createDockerRuntimeRunner } from './docker-runtime.js'
import { createInProcessRunner } from './in-process.js'
import { createJavaRunner } from './java.js'
import { createPythonRunner } from './python.js'
import { createRubyRunner } from './ruby.js'
import { createWorkerThreadRunner } from './worker-thread.js'
import { isDockerSupportedRuntime } from './docker-runtime-image.js'

/**
 * Resolve the runner kind for an invoke args object.
 *
 * Most runtimes map 1:1: `java21` → `java`, `go1.x` → `go`, `python3.11`
 * → `python`. The `provided.al2` family is ambiguous (used by Go's
 * compiled `bootstrap` binary AND Java's GraalVM native-image AND Java
 * with the RIC), so we disambiguate via the user's `package.artifact`
 * extension: `.jar` → Java; everything else → Go.
 *
 * Pure function; exported only for direct unit testing if needed.
 *
 * @param {object} args  Full invoke args; reads `runtime` and `artifactPath`.
 * @param {boolean} useInProcess
 * @param {boolean} useDocker
 * @returns {'docker' | 'python' | 'ruby' | 'go' | 'java' | 'in-process' | 'worker-thread'}
 */
function _resolveRunnerKind(args, useInProcess, useDocker) {
  const runtime = args?.runtime ?? ''
  if (useDocker && isDockerSupportedRuntime(runtime, args?.artifactPath)) {
    return 'docker'
  }
  if (/^python\d+\.\d+$/.test(runtime)) return 'python'
  if (/^ruby\d+\.\d+$/.test(runtime)) return 'ruby'
  if (/^go\d+\.x?$/.test(runtime)) return 'go'
  if (/^java\d+(\.al2)?$/.test(runtime)) return 'java'
  if (runtime === 'provided.al') return 'go'
  if (/^provided\.(al2|al2023)$/.test(runtime)) {
    const artifactPath = args?.artifactPath ?? ''
    return artifactPath.endsWith('.jar') ? 'java' : 'go'
  }
  return useInProcess ? 'in-process' : 'worker-thread'
}

/**
 * Build a runtime-aware composite runner.
 *
 * The composite holds up to three live sub-runners (in-process,
 * worker-thread, python), each created lazily on the first invoke that
 * needs them. `invoke()` reads `args.runtime`, resolves a kind, and
 * routes to (or lazily creates) the matching sub-runner. `invalidate()`
 * fans out to every live sub-runner; `terminate()` shuts them all down
 * and waits.
 *
 * After `terminate()` returns the composite still accepts new invokes —
 * a fresh sub-runner is spawned on demand. This matches the existing
 * worker-thread runner's contract and keeps the boot-time wiring point
 * (a single `createRunner` call) independent of process lifecycle.
 *
 * The in-process runner trades isolation + hot-reload for lower per-
 * invocation overhead and direct stack traces, and is opt-in via the
 * `--useInProcess` CLI flag (or `offline.useInProcess: true` in YAML).
 * The Python AND Ruby runners are selected purely by the function's
 * runtime — the `useInProcess` flag has no effect for non-Node
 * functions. Future runtimes (go, java) drop in as single-line additions
 * to `_resolveRunnerKind` plus their `createXRunner`.
 *
 * Unit conversion: `terminateIdleLambdaTime` is the user-facing SECONDS
 * value (matches `offline.terminateIdleLambdaTime` in YAML, `--terminate-
 * idle-lambda-time` on the CLI). Sub-runners take `idleEvictionMs` so the
 * unit is unambiguous inside the runner layer. Conversion happens here
 * once; runners never see seconds.
 *
 * @param {object} params
 * @param {boolean} params.useInProcess  Selects the Node sub-runner.
 *   `true` → in-process; `false` → worker-thread. Ignored for Python /
 *   Ruby / Go.
 * @param {number} params.terminateIdleLambdaTime  Idle eviction window in
 *   SECONDS (user-facing unit). Forwarded as milliseconds to the worker-
 *   thread and Python sub-runners; the in-process runner has no idle
 *   workers to terminate.
 * @param {object} [params.go]  Go sub-runner wiring; only consulted when a
 *   function's runtime matches `/^go\d+\.x?$/` or `/^provided\.al2?$/`.
 *   When the service has no Go functions, callers may omit this entirely.
 * @param {string} [params.go.runtimeApiBase]  Full URL with scheme, e.g.
 *   `http://localhost:3002/runtime`. Passed through verbatim to the Go
 *   runner which strips the scheme before assembling `AWS_LAMBDA_RUNTIME_API`.
 * @param {object} [params.go.runtimeApiQueue]  Invocation queue shared with
 *   the aws-api-server Runtime API routes.
 * @param {string} [params.go.servicePath]  Service root for build-cache and
 *   handler-source resolution.
 * @param {object} [params.go.log]  Logger forwarded to the Go runner.
 * @param {object} [params.java]  Java sub-runner wiring; consulted when a
 *   function's runtime matches `/^java\d+/` or when `provided.al{,2,2023}`
 *   is paired with a `.jar` artifact. Backed by Docker (the official
 *   `public.ecr.aws/lambda/java:<N>` image). Required when Java functions
 *   are present.
 * @param {string} [params.java.runtimeApiBase]
 * @param {object} [params.java.runtimeApiQueue]
 * @param {object} [params.java.dockerClient]  DockerClient wrapper from
 *   `@serverless/util`. Required.
 * @param {Function} [params.java.ensureImageReady]  Cached pre-pull helper
 *   from `docker-image.js`. Required.
 * @param {string} [params.java.servicePath]
 * @param {object} [params.java.log]
 * @returns {{
 *   invoke(args: object): Promise<unknown>,
 *   invalidate(functionKey: string): void,
 *   terminate(): Promise<void>,
 * }}
 */
export function createRunner({
  useInProcess,
  useDocker = false,
  terminateIdleLambdaTime,
  docker,
  go,
  java,
}) {
  const idleEvictionMs = terminateIdleLambdaTime * 1000

  /** @type {Map<'in-process' | 'worker-thread' | 'python' | 'ruby' | 'go' | 'java' | 'docker', { invoke: Function, invalidate: Function, terminate: Function }>} */
  const subs = new Map()

  function _get(kind) {
    let r = subs.get(kind)
    if (r) return r
    if (kind === 'in-process') {
      r = createInProcessRunner()
    } else if (kind === 'python') {
      r = createPythonRunner({ idleEvictionMs })
    } else if (kind === 'ruby') {
      r = createRubyRunner({ idleEvictionMs })
    } else if (kind === 'go') {
      if (!go?.runtimeApiBase || !go?.runtimeApiQueue) {
        throw new Error(
          'createRunner: Go functions require `go.runtimeApiBase` and `go.runtimeApiQueue` options',
        )
      }
      r = createGoRunner({
        idleEvictionMs,
        runtimeApiBase: go.runtimeApiBase,
        runtimeApiQueue: go.runtimeApiQueue,
        servicePath: go.servicePath,
        log: go.log,
      })
    } else if (kind === 'docker') {
      if (
        !docker?.runtimeApiBase ||
        !docker?.runtimeApiQueue ||
        !docker?.dockerClient ||
        !docker?.ensureImageReady
      ) {
        throw new Error(
          'createRunner: Docker functions require `docker.runtimeApiBase`, `docker.runtimeApiQueue`, `docker.dockerClient`, and `docker.ensureImageReady` options',
        )
      }
      r = createDockerRuntimeRunner({
        idleEvictionMs,
        runtimeApiBase: docker.runtimeApiBase,
        runtimeApiQueue: docker.runtimeApiQueue,
        dockerClient: docker.dockerClient,
        ensureImageReady: docker.ensureImageReady,
        servicePath: docker.servicePath,
        log: docker.log,
        dockerHost: docker.dockerHost,
        dockerHostServicePath: docker.dockerHostServicePath,
        dockerNetwork: docker.dockerNetwork,
        dockerReadOnly: docker.dockerReadOnly,
      })
    } else if (kind === 'java') {
      if (
        !java?.runtimeApiBase ||
        !java?.runtimeApiQueue ||
        !java?.dockerClient ||
        !java?.ensureImageReady
      ) {
        throw new Error(
          'createRunner: Java functions require `java.runtimeApiBase`, `java.runtimeApiQueue`, `java.dockerClient`, and `java.ensureImageReady` options',
        )
      }
      r = createJavaRunner({
        idleEvictionMs,
        runtimeApiBase: java.runtimeApiBase,
        runtimeApiQueue: java.runtimeApiQueue,
        dockerClient: java.dockerClient,
        ensureImageReady: java.ensureImageReady,
        servicePath: java.servicePath,
        log: java.log,
        dockerHost: java.dockerHost,
        dockerHostServicePath: java.dockerHostServicePath,
        dockerNetwork: java.dockerNetwork,
        dockerReadOnly: java.dockerReadOnly,
      })
    } else {
      r = createWorkerThreadRunner({ servicePath: '', idleEvictionMs })
    }
    subs.set(kind, r)
    return r
  }

  return {
    async invoke(args) {
      const kind = _resolveRunnerKind(args, useInProcess, useDocker)
      return _get(kind).invoke(args)
    },
    invalidate(functionKey) {
      for (const sub of subs.values()) sub.invalidate(functionKey)
    },
    async terminate() {
      const promises = []
      for (const sub of subs.values()) promises.push(sub.terminate())
      subs.clear()
      await Promise.all(promises)
    },
  }
}
