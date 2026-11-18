/**
 * The role credentials of a `--local-only` web app. Its real URL keeps serving the deployed code,
 * so no request ever brings the execution role's credentials to this machine: the CLI asks for
 * them. It sends a GET of CREDENTIALS_PATH to the web app's endpoint `sls-dev-local`, header-signed
 * (SigV4, service `lambda`) with the developer's own credentials, which therefore need
 * `lambda:InvokeWebFunctionEndpoint` on it. The dev revision behind it forwards the request with
 * its role credentials (or, asked, sends them), and the session's web relay takes them and answers
 * 204 itself (relay.js). Asked once at start, then every LOCAL_CREDENTIALS_REFRESH_MS. A failed
 * request is tried again after LOCAL_CREDENTIALS_RETRY_MS, doubling after each failure in a row up
 * to LOCAL_CREDENTIALS_RETRY_MAX_MS. A denied one (403 with AWS's error type AccessDenied, or no
 * error type) is not tried again: the web app then runs without role credentials. A 403 for an
 * expired token or a bad signature is a failure like any other, tried again.
 */
import { createHash } from 'crypto'
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '../../lib/sigv4.js'
import { CREDENTIALS_PATH } from './relay.js'

/** How often the credentials are asked for again: well within their hour of validity. */
export const LOCAL_CREDENTIALS_REFRESH_MS = 30 * 60_000
/**
 * How soon a request that failed (no answer yet from a cold dev revision, the network) is retried.
 */
export const LOCAL_CREDENTIALS_RETRY_MS = 10_000
/** The longest wait between retries of failed requests. */
export const LOCAL_CREDENTIALS_RETRY_MAX_MS = 5 * 60_000
/** How long one request may take. */
const REQUEST_TIMEOUT_MS = 15_000
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex')

/**
 * Sends one credentials request to the endpoint at `url` (`https://<domain>`) and resolves its
 * HTTP `status` and AWS's `errorType` (the `x-amzn-errortype` header, without its details), if
 * any. `credentials()` resolves the developer's credentials.
 */
export const requestLocalCredentials = async ({
  url,
  region,
  credentials,
  fetch = globalThis.fetch,
  now = Date.now,
}) => {
  const target = new URL(CREDENTIALS_PATH, url)
  const signer = new SignatureV4({
    service: 'lambda',
    region,
    credentials: await credentials(),
    sha256: Sha256,
  })
  const signed = await signer.sign(
    {
      method: 'GET',
      protocol: target.protocol,
      hostname: target.hostname,
      path: target.pathname,
      headers: {
        host: target.host,
        'x-amz-content-sha256': EMPTY_SHA256,
      },
    },
    { signingDate: new Date(now()) },
  )
  // fetch sets the same Host header itself.
  const headers = { ...signed.headers }
  delete headers.host
  const response = await fetch(target.href, {
    method: 'GET',
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // The body (none on success) is not read.
  try {
    await response.body?.cancel?.()
  } catch {
    // Nothing to read anyway.
  }
  const errorType = response.headers?.get?.('x-amzn-errortype')?.split(':')[0]
  return { status: response.status, ...(errorType && { errorType }) }
}

/** Whether an answer says the developer may not call the endpoint at all. */
const isDenial = ({ status, errorType }) =>
  status === 403 && (!errorType || /AccessDenied/i.test(errorType))

/**
 * Keeps the role credentials of each `--local-only` web app in `webApps` (`{ key, url }`, `url` the
 * endpoint `sls-dev-local`) coming. `stateOf(key)`: `pending` before the first answer, `ready`
 * once a request was answered, `failed` after one that was not (tried again), `denied` when the
 * developer may not call the endpoint (403). `onState(key, state)` is told every change.
 */
export const createLocalOnlyCredentials = ({
  webApps,
  region,
  credentials,
  fetch,
  timers,
  logger,
  now,
  onState = () => {},
  request = requestLocalCredentials,
}) => {
  const states = new Map(webApps.map(({ key }) => [key, 'pending']))
  const pending = new Map()
  let stopped = false
  const setState = (key, state) => {
    if (states.get(key) === state) return
    states.set(key, state)
    try {
      onState(key, state)
    } catch {
      // Told best effort.
    }
  }
  const schedule = (webApp, ms) => {
    if (stopped) return
    pending.set(
      webApp.key,
      timers.setTimeout(() => {
        pending.delete(webApp.key)
        void ask(webApp)
      }, ms),
    )
  }
  // Failures in a row, per web app: the next retry waits longer.
  const failures = new Map()
  const ask = async (webApp) => {
    let answer = null
    try {
      answer = await request({
        url: webApp.url,
        region,
        credentials,
        fetch,
        now,
      })
    } catch (error) {
      logger.debug(
        `Dev Mode could not ask for the role credentials of the web app ${webApp.key}: ${error?.message ?? error}`,
      )
    }
    if (stopped) return
    if (answer && isDenial(answer)) {
      setState(webApp.key, 'denied')
      return
    }
    if (answer && answer.status >= 200 && answer.status < 300) {
      failures.delete(webApp.key)
      setState(webApp.key, 'ready')
      schedule(webApp, LOCAL_CREDENTIALS_REFRESH_MS)
      return
    }
    if (answer) {
      logger.debug(
        `Dev Mode asked for the role credentials of the web app ${webApp.key} and got HTTP ${answer.status}${answer.errorType ? ` (${answer.errorType})` : ''}; it asks again`,
      )
    }
    // Credentials already handed over stay with the local server until they expire.
    if (states.get(webApp.key) !== 'ready') setState(webApp.key, 'failed')
    const inARow = failures.get(webApp.key) ?? 0
    failures.set(webApp.key, inARow + 1)
    schedule(
      webApp,
      Math.min(
        LOCAL_CREDENTIALS_RETRY_MS * 2 ** inARow,
        LOCAL_CREDENTIALS_RETRY_MAX_MS,
      ),
    )
  }
  return {
    start() {
      for (const webApp of webApps) void ask(webApp)
    },
    stateOf: (key) => states.get(key),
    stop() {
      stopped = true
      for (const timer of pending.values()) timers.clearTimeout(timer)
      pending.clear()
    },
  }
}
