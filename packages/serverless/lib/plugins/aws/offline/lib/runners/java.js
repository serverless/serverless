import { createDockerRuntimeRunner } from './docker-runtime.js'

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
export function createJavaRunner(options) {
  return createDockerRuntimeRunner(options)
}
