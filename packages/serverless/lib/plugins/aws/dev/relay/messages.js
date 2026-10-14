/**
 * What a Dev Mode session says about the relay: its connection, what ran the deployed code, and
 * the account setup a first session waits for.
 */
import {
  awsCredentialsFix,
  describeAwsCredentialSource,
} from '@serverlessinc/sf-core/src/lib/resolvers/providers/aws/credential-source.js'
import { MAX_WORKERS } from '../local/worker-pool.js'
import { cliCommand } from '../commands/cli-names.js'

export const connectionLostLine = (reason) =>
  `Dev Mode lost its connection to AWS IoT Core (${reason}). Invocations run the deployed code until this machine reconnects.`

/**
 * Why the AWS IoT Core endpoint cannot be reached when its name does not resolve: the account's
 * first use of AWS IoT Core in `region`. `detail` is the DNS error. The session's start and
 * `serverless dev --dry-run` give it alike.
 */
export const endpointUnresolvedLine = ({ region, detail }) =>
  `The AWS IoT Core endpoint for this account in ${region} cannot be resolved yet (${detail}). AWS creates an account's endpoint in a region the first time it is used there, and it can take a few minutes before it resolves. Run the command again in a few minutes. If it still cannot be resolved then, check your network connection and proxy settings (HTTPS_PROXY).`

/** The spinner's text while a first connection waits for the endpoint's name to resolve. */
export const endpointWaitLine = (region) =>
  `Waiting for AWS IoT Core in ${region} to become reachable`

export const reconnectedLine = (offlineMs) =>
  `Dev Mode reconnected to AWS IoT Core after ${Math.max(1, Math.round(offlineMs / 1000))} s offline.`

/**
 * Where `provider`'s AWS credentials come from, in sf-core's terms (`describeAwsCredentialSource`):
 * the source the CLI runner found for this run (a Dashboard Provider, an `aws` resolver in
 * serverless.yml, a profile, the environment), which it hands the Framework instance; else the
 * profile the command names (--aws-profile, provider.profile), AWS_PROFILE or the keys in `env`.
 */
export const credentialSourceOf = (provider, env = process.env) =>
  provider?.serverless?.awsCredentialSource ??
  describeAwsCredentialSource({
    config: { profile: provider?.getProfile?.() },
    env,
  })

/**
 * Where the AWS credentials come from and how to sign in again, as one sentence in the words
 * deploy and `serverless agent setup` use. `source` is `credentialSourceOf`'s; without one, the
 * default profile or the keys in the environment.
 */
export const credentialsFixLine = (source = describeAwsCredentialSource()) => {
  const fix = awsCredentialsFix(source)
  return `${fix.charAt(0).toUpperCase()}${fix.slice(1)}.`
}

export const credentialsExpiredLine = (source) =>
  `Your AWS credentials expired, so Dev Mode cannot reconnect and invocations run the deployed code; Dev Mode keeps trying. ${credentialsFixLine(source)}`

/** After the expired line: the credentials could be read again, and the reconnect goes on. */
export const credentialsWorkAgainLine = () =>
  'Your AWS credentials work again; Dev Mode is reconnecting to AWS IoT Core.'

/** Requests the relay could not accept in time because it was pacing what it publishes. */
export const throughputLine = (count) =>
  `${count} invocation${count === 1 ? '' : 's'} ran the deployed code: Dev Mode relays up to about 20 per second.`

/** Requests left to the deployed code because every handler process on this machine was busy. */
export const workersBusyLine = (count, maxWorkers = MAX_WORKERS) =>
  `${count} invocation${count === 1 ? '' : 's'} ran the deployed code: all ${maxWorkers} handler processes on this machine were busy.`

/** Requests that were already too old to be accepted when they reached this machine. */
export const lateLine = (count) =>
  `${count} invocation${count === 1 ? ' ran the deployed code: it' : 's ran the deployed code: they'} reached this machine too late to run here (this machine was asleep, the network was slow, or this machine's clock is ahead of AWS's).`

// The MQTT 5 names of the codes AWS IoT Core can refuse a message with.
const REFUSAL_NAMES = {
  0x80: 'unspecified error',
  0x83: 'implementation specific error',
  0x87: 'not authorized',
  0x90: 'topic name invalid',
  0x91: 'packet identifier in use',
  0x99: 'payload format invalid',
}
const hex = (code) => `0x${Number(code).toString(16).padStart(2, '0')}`

/** Requests whose acceptance AWS IoT Core refused for a reason other than its rate. */
export const refusedLine = (count, code) =>
  `${count} invocation${count === 1 ? ' ran the deployed code: AWS IoT Core refused the acceptance this machine sent for it' : 's ran the deployed code: AWS IoT Core refused the acceptances this machine sent for them'} (reason code ${hex(code)}${REFUSAL_NAMES[code] ? `, ${REFUSAL_NAMES[code]}` : ''}).`

/** After a session created the IAM role: the account setup line before it named the role. */
export const newBrokerLine = () =>
  'The new IAM role can take up to 3 minutes to work; until then some invocations run the deployed code.'

export const sideChannelOffLine = (reason) =>
  `Payloads above 126 KB cannot be relayed in this session: ${reason}. Larger events run the deployed code, and larger results fail with Runtime.DevModeRelayFailed.`

export const livenessDeniedLine = (reason) =>
  `Dev Mode could not check whether other Dev Mode sessions are running (${reason}): functions another developer holds stay with them, yours are attached to this session.`

export const livenessUnansweredLine = (reason) =>
  `Dev Mode could not learn whether another Dev Mode session is running (${reason}), so its functions stay with it. Run "${cliCommand('dev --take-over')}" to take them.`

export const clockOffLine = () =>
  `This machine's clock moved by more than a minute while Dev Mode ran, so Dev Mode cannot tell invocations from replayed ones, and the deployed code is answering them. Check that the clock is set automatically, then run "${cliCommand('dev')}" again.`

export const NOT_RUN_WINDOW_MS = 30_000
const NOT_RUN_SETTLE_MS = 1_000
/** Refusals in a row of requests that look too old before the clock line is shown. */
const STALE_IN_A_ROW = 2

/**
 * Counts invocations that ran the deployed code for one cause, and says so with that cause's
 * `line(count, detail)` at most once per NOT_RUN_WINDOW_MS, a second after the last one of a
 * burst; `detail` is what the last `notRun(detail)` gave.
 */
export const createNotRunWarning = ({ warn, now = Date.now, timers, line }) => {
  if (typeof line !== 'function') {
    throw new TypeError('createNotRunWarning needs the line it prints')
  }
  let count = 0
  let detail
  let warnedAt = null
  let timer = null
  const flush = () => {
    timer = null
    if (!count) return
    const wait = warnedAt === null ? 0 : warnedAt + NOT_RUN_WINDOW_MS - now()
    if (wait > 0) {
      timer = timers.setTimeout(flush, wait)
      return
    }
    warn(line(count, detail))
    count = 0
    warnedAt = now()
  }
  return {
    notRun(last) {
      count += 1
      detail = last
      if (!timer) timer = timers.setTimeout(flush, NOT_RUN_SETTLE_MS)
    },
    stop() {
      if (timer) timers.clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * Says once per session that this machine's clock looks off, when requests are refused as too old
 * (stale) STALE_IN_A_ROW times with no other request in between. `stale(inARow)` takes the relay's
 * count of such refusals in a row.
 */
export const createClockWarning = ({ warn }) => {
  let warned = false
  return {
    stale(inARow) {
      if (warned || inARow < STALE_IN_A_ROW) return
      warned = true
      warn(clockOffLine())
    },
  }
}

/** How long the counts the bridges send after a reconnect are summed into one line. */
export const AWAY_WINDOW_MS = 5_000
const AWAY_FUNCTIONS_LISTED = 5

/**
 * The invocations that ran the deployed code while Dev Mode could not reach this session, as the
 * bridges counted them: `counts` is `[{ functionKey, count }]`, most first. "At least": an execution
 * environment that is never invoked again never reports its count.
 */
export const awayLine = (counts) => {
  const total = counts.reduce((sum, { count }) => sum + count, 0)
  const listed = counts
    .slice(0, AWAY_FUNCTIONS_LISTED)
    .map(({ functionKey, count }) => `${functionKey} ×${count}`)
  if (counts.length > AWAY_FUNCTIONS_LISTED) {
    listed.push(`…and ${counts.length - AWAY_FUNCTIONS_LISTED} more`)
  }
  return `At least ${total} invocation${total === 1 ? '' : 's'} ran the deployed code while Dev Mode could not reach this session (${listed.join(', ')}).`
}

/**
 * Sums the bridges' counts for `windowMs` from a reconnect, or from the first count when no
 * reconnect opened a window, then says them in one line and records one entry per function with
 * `record(fields)`. `stop()` records what it holds without a line and counts nothing after.
 */
export const createAwayCount = ({
  warn,
  record,
  timers,
  windowMs = AWAY_WINDOW_MS,
}) => {
  let sums = new Map()
  let timer = null
  let stopped = false
  const flush = (say) => {
    timer = null
    const counts = [...sums]
      .map(([functionKey, count]) => ({ functionKey, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.functionKey < b.functionKey
            ? -1
            : a.functionKey > b.functionKey
              ? 1
              : 0),
      )
    sums = new Map()
    if (!counts.length) return
    if (say) warn(awayLine(counts))
    for (const { functionKey, count } of counts) {
      record({
        function: functionKey,
        count,
        reason: 'offline',
        at_least: true,
      })
    }
  }
  const open = () => {
    if (!timer && !stopped)
      timer = timers.setTimeout(() => flush(true), windowMs)
  }
  return {
    reconnected: open,
    passed({ functionKey, count }) {
      if (stopped) return
      sums.set(functionKey, (sums.get(functionKey) ?? 0) + count)
      open()
    },
    stop() {
      if (stopped) return
      stopped = true
      if (timer) timers.clearTimeout(timer)
      flush(false)
    },
  }
}
