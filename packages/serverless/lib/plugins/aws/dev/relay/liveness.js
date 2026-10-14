/**
 * Whether other Dev Mode sessions are still there, asked once at start-up for every session id
 * found on the service's functions: AWS IoT Core Direct Messaging delivers a message to that
 * session's CLI and waits up to one second for its acknowledgement.
 *
 * - live: the CLI acknowledged.
 * - gone: no such client is connected (ResourceNotFoundException).
 * - unknown: connected but no acknowledgement in time (HTTP 504), as from a sleeping or frozen
 *   machine; Dev Mode treats it as live. AWS IoT Core names that answer InternalFailureException
 *   ("The delivery confirmation was not received within the specified timeout period"), so the
 *   status decides, not the name. It lasts until AWS IoT Core drops the connection (1.5 times
 *   the keep-alive after the machine last sent anything); then the session reads as gone.
 * - denied: this machine may not ask (iot:SendDirectMessage).
 * - failed: the question could not be asked (network, throttling, any other error).
 */
import {
  IoTDataPlaneClient,
  SendDirectMessageCommand,
} from '@aws-sdk/client-iot-data-plane'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { addProxyToAwsClient } from '@serverless/util/src/proxy/index.js'
import { laptopClientId, topicsOf } from './protocol.js'

export const LIVENESS = Object.freeze({
  LIVE: 'live',
  GONE: 'gone',
  UNKNOWN: 'unknown',
  DENIED: 'denied',
  FAILED: 'failed',
})

/** How long one question may take before it counts as failed. */
export const LIVENESS_TIMEOUT_MS = 5_000
const CONFIRMATION_TIMEOUT_SECONDS = 1

const DENIED_ERRORS = new Set([
  'ForbiddenException',
  'UnauthorizedException',
  'AccessDeniedException',
])

const defaultTimers = { setTimeout, clearTimeout }

/**
 * The AWS IoT Core data plane client for the account's endpoint (`iot:Data-ATS`), through the
 * machine's proxy. One attempt per question: a retried question would only be later.
 */
export const createDirectMessagingClient = ({
  endpoint,
  region,
  credentials,
}) =>
  addProxyToAwsClient(
    new IoTDataPlaneClient({
      region,
      endpoint: `https://${endpoint}`,
      credentials,
      maxAttempts: 1,
    }),
  )

const livenessOf = (error) => {
  const name = error?.name
  if (name === 'ResourceNotFoundException') return LIVENESS.GONE
  if (
    name === 'GatewayTimeoutException' ||
    error?.$metadata?.httpStatusCode === 504
  ) {
    return LIVENESS.UNKNOWN
  }
  if (DENIED_ERRORS.has(name) || error?.$metadata?.httpStatusCode === 403) {
    return LIVENESS.DENIED
  }
  return LIVENESS.FAILED
}

/**
 * The liveness of one session, asked with `client` (one is created when none is given).
 * `signal` withdraws the question (failed; never sent when already aborted); `debug` gets the
 * error behind a denied or failed answer.
 */
export const pingSession = async ({
  client,
  endpoint,
  region,
  credentials,
  sessionId,
  timers = defaultTimers,
  signal,
  debug,
}) => {
  if (signal?.aborted) return LIVENESS.FAILED
  const own = !client
  const dataPlane =
    client ?? createDirectMessagingClient({ endpoint, region, credentials })
  const abort = new AbortController()
  const timer = timers.setTimeout(() => abort.abort(), LIVENESS_TIMEOUT_MS)
  const withdraw = () => abort.abort()
  signal?.addEventListener('abort', withdraw, { once: true })
  try {
    await dataPlane.send(
      new SendDirectMessageCommand({
        clientId: laptopClientId(sessionId),
        topic: topicsOf(sessionId).ping,
        confirmation: true,
        timeout: CONFIRMATION_TIMEOUT_SECONDS,
      }),
      { abortSignal: abort.signal },
    )
    return LIVENESS.LIVE
  } catch (error) {
    const state = livenessOf(error)
    const told = state === LIVENESS.DENIED || state === LIVENESS.FAILED
    if (told && !signal?.aborted) debug?.(error)
    return state
  } finally {
    timers.clearTimeout(timer)
    signal?.removeEventListener('abort', withdraw)
    if (own) dataPlane.destroy()
  }
}

/** `Map<sessionId, liveness>` for every distinct id, asked in parallel on one client. */
export const sessionsLiveness = async ({ sessionIds, client, ...options }) => {
  const dataPlane = client ?? createDirectMessagingClient(options)
  try {
    return new Map(
      await Promise.all(
        [...new Set(sessionIds)].map(async (sessionId) => [
          sessionId,
          await pingSession({ ...options, client: dataPlane, sessionId }),
        ]),
      ),
    )
  } finally {
    if (!client) dataPlane.destroy()
  }
}
