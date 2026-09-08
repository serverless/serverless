import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { S3Client } from '@aws-sdk/client-s3'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STSClient } from '@aws-sdk/client-sts'
import { loadConfig } from '@smithy/core/config'
import {
  NODE_MAX_ATTEMPT_CONFIG_OPTIONS,
  NODE_RETRY_MODE_CONFIG_OPTIONS,
  isThrottlingError,
} from '@smithy/core/retry'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import {
  addProxyToAwsClient,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'

/**
 * Shared AWS SDK plumbing for the variable resolvers (`${cf:}`, `${ssm:}`,
 * `${s3:}`, `${aws:accountId}`, and the Terraform resolver's `backend: s3`
 * state reads).
 *
 * Every call gets its own SDK client (each client owns its retry budget, so a
 * burst of calls never shares one 500-token budget), but all clients share one
 * keep-alive HTTP handler so TLS connections are reused across calls.
 * Retry mode and attempt count are injected through the SDK's own config
 * loader: the user's `AWS_MAX_ATTEMPTS` / `AWS_RETRY_MODE` environment
 * variables and `~/.aws/config` `max_attempts` / `retry_mode` keys take
 * precedence; the framework defaults apply only when none of them is set.
 */

/** Upper bound of concurrent TLS connections shared by all resolver clients in the process. */
export const MAX_SOCKETS = 500
/** Framework default for the SDK's `maxAttempts` (the SDK's own default is 3). */
export const DEFAULT_MAX_ATTEMPTS = 10
/** Framework default for the SDK's `retryMode`. */
export const DEFAULT_RETRY_MODE = 'standard'

const RETRY_GUIDE_URL =
  'https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html'

const SERVICES = {
  cloudformation: {
    Client: CloudFormationClient,
    label: 'cf',
    name: 'AWS CloudFormation',
    targetNoun: 'stacks',
    variable: '${cf:}',
    learnMore:
      'https://repost.aws/knowledge-center/cloudformation-rate-exceeded-error',
  },
  ssm: {
    Client: SSMClient,
    label: 'ssm',
    name: 'AWS Systems Manager',
    targetNoun: 'parameters',
    variable: '${ssm:}',
    learnMore:
      'https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-throughput.html',
  },
  s3: {
    Client: S3Client,
    clientOptions: { followRegionRedirects: true },
    label: 's3',
    name: 'Amazon S3',
    targetNoun: 'objects',
    variable: '${s3:}',
    learnMore: RETRY_GUIDE_URL,
  },
  terraform: {
    Client: S3Client,
    clientOptions: { followRegionRedirects: true },
    label: 'terraform',
    name: 'Amazon S3',
    targetNoun: 'state files',
    variable: '${terraform:outputs:}',
    learnMore: RETRY_GUIDE_URL,
    // The Terraform resolver memoizes the parsed state above this layer, so the
    // request count here is the number of memo misses, not of placeholders.
    summaryPlaceholders: false,
  },
  sts: {
    Client: STSClient,
    label: 'aws:accountId',
    name: 'AWS STS',
    targetNoun: 'identities',
    variable: '${aws:accountId}',
    learnMore: RETRY_GUIDE_URL,
  },
}

let sharedHandler = null
let sharedProxiedHandler = null
let handlerOverride = null

/** service|principal|region|target → Promise<output> (see sendAwsRequest cache). */
const responseCache = new Map()
/** credentials object or provider function → Promise<accessKeyId>. */
const principalCache = new WeakMap()
/**
 * `${service}:${api}:${scope}` → { service, api, region, placeholders, targets,
 * calls, throttledAttempts }, where `scope` is `principal|region`: two resolvers
 * pointing at different accounts or regions may reference targets with the same
 * name, so they must not share one counter.
 *
 * The reports built from these counters fold every principal of one region back
 * together, because a principal is not a proxy for an account: temporary
 * credentials give each Compose service that assumes a role or signs in through
 * SSO on its own a different access key id for the same account. So the debug
 * summary counts targets distinct per region regardless of credentials, and the
 * rate-exceeded message sums the throttled region's scopes.
 */
const counters = new Map()
/**
 * `${service}:${api}` → the last line the debug summary printed for it, so an
 * API whose numbers have not moved is not printed again.
 */
const lastPrintedLines = new Map()

const getSharedHandler = () => {
  if (handlerOverride) return handlerOverride
  sharedHandler ??= new NodeHttpHandler({
    httpsAgent: { maxSockets: MAX_SOCKETS },
  })
  return sharedHandler
}

/**
 * Build a new SDK client for one request.
 * @param {Object} params
 * @param {'cloudformation'|'ssm'|'s3'|'sts'|'terraform'} params.service
 * @param {Object|Function} params.credentials - static credentials or an SDK credential provider
 * @param {string} params.region
 */
export const createClient = ({ service, credentials, region }) => {
  const definition = SERVICES[service]
  if (!definition) {
    throw new Error(`Unsupported AWS resolver service: ${service}`)
  }
  const handler = getSharedHandler()
  const client = new definition.Client({
    ...definition.clientOptions,
    credentials,
    region,
    requestHandler: handler,
    retryMode: loadConfig({
      ...NODE_RETRY_MODE_CONFIG_OPTIONS,
      default: DEFAULT_RETRY_MODE,
    }),
    maxAttempts: loadConfig({
      ...NODE_MAX_ATTEMPT_CONFIG_OPTIONS,
      default: DEFAULT_MAX_ATTEMPTS,
    }),
  })
  addProxyToAwsClient(client, { agentOptions: { maxSockets: MAX_SOCKETS } })
  if (client.config.requestHandler !== handler) {
    // A proxy is configured: the helper installed a fresh proxied handler.
    // Keep the first one for the whole process so connections are reused.
    sharedProxiedHandler ??= client.config.requestHandler
    client.config.requestHandler = sharedProxiedHandler
  }
  return client
}

const apiNameOf = (command) => command.constructor.name.replace(/Command$/, '')

const counterFor = (service, api, scope, region) => {
  const key = `${service}:${api}:${scope}`
  if (!counters.has(key)) {
    counters.set(key, {
      service,
      api,
      region,
      placeholders: 0,
      targets: new Set(),
      calls: 0,
      throttledAttempts: 0,
    })
  }
  return counters.get(key)
}

/**
 * The cache key and the request counters must separate accounts: two resolvers
 * pointing at different AWS accounts may reference stacks with the same name.
 * The access key id is resolved once per credentials object (static object or
 * provider function), through the client's own `config.credentials` rather than
 * the raw provider: the SDK binds `callerClientConfig` to that provider, and
 * providers read the caller's region off it (`credential-provider-ini` picks
 * the AssumeRole region that way), so resolving through the client keeps
 * credential resolution region-aware. It is also the SDK's memoized provider,
 * so signing the request reuses this resolution instead of invoking the
 * provider again. A rejected resolution is not cached: a provider that failed
 * once (expired token, an SSO or IMDS hiccup) is re-invoked by the next
 * placeholder, just as the SDK's own memoized provider would.
 */
const principalOf = (credentials, client) => {
  const isCacheable =
    credentials !== null &&
    (typeof credentials === 'object' || typeof credentials === 'function')
  if (!isCacheable) return Promise.resolve('')
  if (!principalCache.has(credentials)) {
    const pending = (async () => {
      const resolved = await client.config.credentials()
      return resolved?.accessKeyId ?? ''
    })()
    principalCache.set(credentials, pending)
    pending.catch(() => principalCache.delete(credentials))
  }
  return principalCache.get(credentials)
}

/**
 * Wrap the client's resolved retry strategy so each throttled attempt is
 * visible before the SDK sleeps, and so a refused retry tells us why.
 */
const observeRetries = (client, { logger, api, counter, maxAttempts }) => {
  const originalProvider = client.config.retryStrategy
  let decorated
  client.config.retryStrategy = async () => {
    if (decorated) return decorated
    const strategy = await originalProvider()
    decorated = {
      // The SDK's user-agent feature check reads `mode` off the strategy to
      // report RETRY_MODE_STANDARD/ADAPTIVE; without it the metric goes missing.
      mode: strategy.mode,
      acquireInitialRetryToken: (scope) =>
        strategy.acquireInitialRetryToken(scope),
      recordSuccess: (token) => strategy.recordSuccess(token),
      refreshRetryTokenForRetry: async (token, errorInfo) => {
        const failedAttempt = token.getRetryCount() + 1
        const isThrottled = errorInfo.errorType === 'THROTTLING'
        if (isThrottled) {
          counter.throttledAttempts += 1
          if (failedAttempt < maxAttempts) {
            const { error } = errorInfo
            logger.info(
              `${api} throttled (${error.name}: ${error.message}), retrying (attempt ${failedAttempt + 1} of ${maxAttempts})`,
            )
          }
        }
        try {
          return await strategy.refreshRetryTokenForRetry(token, errorInfo)
        } catch (refusal) {
          errorInfo.error.$retryRefusal =
            failedAttempt >= maxAttempts ? 'attempts' : 'budget'
          throw refusal
        }
      },
    }
    return decorated
  }
}

/**
 * What this run spent on one API in one region, across every credential scope of
 * it: calls summed, targets de-duplicated. AWS applies its CloudFormation and
 * Systems Manager rate limits per account and region, and a run's credentials
 * are usually one account's, so this is the figure a throttled placeholder is
 * competing with — while another region, with its own limit, stays out of it.
 *
 * The trade-off is that two genuinely different accounts read in one region are
 * summed into one number. That is accepted: temporary credentials split a single
 * account across several principals far more often than one run spans two
 * accounts, and over-counting the shared limit is the less misleading of the two
 * errors.
 */
const regionTotalsFor = ({ service, api, region }) => {
  let calls = 0
  const targets = new Set()
  for (const counter of counters.values()) {
    if (
      counter.service !== service ||
      counter.api !== api ||
      counter.region !== region
    ) {
      continue
    }
    calls += counter.calls
    for (const target of counter.targets) targets.add(target)
  }
  return { calls, targets: targets.size }
}

const toRateExceededError = (
  error,
  { definition, api, counter, maxAttempts, elapsedMs },
) => {
  const spent = regionTotalsFor(counter)
  const attempts = error.$metadata?.attempts ?? 1
  const exhaustion =
    error.$retryRefusal === 'budget'
      ? `after ${attempts} attempts — the retry budget for this run is exhausted`
      : `after ${attempts} attempts (${Math.round(elapsedMs / 1000)} s)`
  const suggestedAttempts = Math.max(15, maxAttempts + 5)
  const message =
    `${definition.name} rejected ${api} with "${error.name}: ${error.message}" ${exhaustion}. ` +
    `This run needed ${spent.calls} ${api} calls for ${spent.targets} ${definition.targetNoun} referenced by ${definition.variable} variables. ` +
    `Retry, run fewer deployments in this account and region at the same time, or allow more attempts with AWS_MAX_ATTEMPTS=${suggestedAttempts} (AWS_RETRY_MODE=adaptive also makes this client slow itself down). ` +
    `Learn more: ${definition.learnMore}`
  return Object.assign(
    new ServerlessError(
      message,
      ServerlessErrorCodes.resolvers.RESOLVER_AWS_RATE_EXCEEDED,
      {
        originalMessage: error.message,
        originalName: error.name,
        stack: false,
      },
    ),
    { providerError: error },
  )
}

/**
 * Send one SDK command through a fresh client.
 *
 * @param {Object} params
 * @param {'cloudformation'|'ssm'|'s3'|'sts'|'terraform'} params.service
 * @param {Object|Function} params.credentials
 * @param {string} params.region
 * @param {{info: Function, debug: Function}} params.logger - the resolver's logger
 * @param {Object} params.command - an SDK command instance
 * @param {string} params.target - what the command addresses (stack name, parameter
 *   name, `bucket/key`); used for de-duplication and for the summary/error counts
 * @param {boolean} [params.cache=false] - memoize the response promise per
 *   service|principal|region|target until a runner invalidates it after a
 *   service run that may have changed it (see `invalidateAwsResponseCache`)
 * @returns {Promise<Object>} the SDK output
 */
export const sendAwsRequest = async ({
  service,
  credentials,
  region,
  logger,
  command,
  target,
  cache = false,
}) => {
  const definition = SERVICES[service]
  if (!definition) {
    throw new Error(`Unsupported AWS resolver service: ${service}`)
  }
  const api = apiNameOf(command)
  // The client is built before the scope is known because the principal is read
  // off its bound credential provider; on a cache hit it simply goes unused.
  const client = createClient({ service, credentials, region })
  // Responses are cached, and requests counted, per credential and region: the
  // same name can address a different stack under another account, and a region
  // is a rate limit of its own. The reports fold a region's credential scopes
  // back together (see `counters`).
  const scope = `${await principalOf(credentials, client)}|${region}`
  const counter = counterFor(service, api, scope, region)
  counter.placeholders += 1
  counter.targets.add(target)

  const send = async () => {
    const maxAttempts = await client.config.maxAttempts()
    observeRetries(client, { logger, api, counter, maxAttempts })
    counter.calls += 1
    const startedAt = Date.now()
    try {
      return await client.send(command)
    } catch (error) {
      if (!isThrottlingError(error)) throw error
      throw toRateExceededError(error, {
        definition,
        api,
        counter,
        maxAttempts,
        elapsedMs: Date.now() - startedAt,
      })
    }
  }

  if (!cache) return send()

  const key = `${service}|${scope}|${target}`
  if (!responseCache.has(key)) {
    const pending = send()
    responseCache.set(key, pending)
    // A failed lookup (missing stack, throttling) must not poison later
    // placeholders or fallbacks; let them retry. Only evict our own entry: an
    // invalidation followed by a re-fetch must not be undone by this older
    // request's rejection.
    pending.catch(() => {
      if (responseCache.get(key) === pending) responseCache.delete(key)
    })
  }
  return responseCache.get(key)
}

/**
 * Debug summary of this process's AWS resolver traffic, one line per API,
 * e.g. `cf: 60 placeholders, 2 stacks, 2 DescribeStacks calls, 0 throttled attempts`.
 * Every credential/region scope of one API is folded into that API's line:
 * placeholders and calls are summed, and targets are counted distinct per region
 * regardless of the credentials that read them. So the same stack name in two
 * regions counts as two stacks, while three Compose services reading the same
 * two stacks — each with its own temporary credentials, and so its own access
 * key id for the one account — still count as two.
 *
 * A service whose `SERVICES` row sets `summaryPlaceholders: false` leaves the
 * placeholder figure off its line; the counters still record it.
 *
 * A line prints when it first exists and again only when its numbers change, so
 * a summary taken after another service's work does not repeat what is already
 * on screen; the last line printed for a service is always its final total.
 */
export const logAwsResolverSummary = (logger) => {
  /** `${service}:${api}` → that API's totals across every scope, first seen first. */
  const totals = new Map()
  for (const counter of counters.values()) {
    if (counter.placeholders === 0) continue
    const key = `${counter.service}:${counter.api}`
    const total = totals.get(key) ?? {
      service: counter.service,
      api: counter.api,
      placeholders: 0,
      targets: new Set(),
      calls: 0,
      throttledAttempts: 0,
    }
    total.placeholders += counter.placeholders
    for (const target of counter.targets) {
      total.targets.add(`${counter.region}|${target}`)
    }
    total.calls += counter.calls
    total.throttledAttempts += counter.throttledAttempts
    totals.set(key, total)
  }
  for (const [key, total] of totals) {
    const definition = SERVICES[total.service]
    const placeholders =
      definition.summaryPlaceholders === false
        ? ''
        : `${total.placeholders} placeholders, `
    const line = `${definition.label}: ${placeholders}${total.targets.size} ${definition.targetNoun}, ${total.calls} ${total.api} calls, ${total.throttledAttempts} throttled attempts`
    if (lastPrintedLines.get(key) === line) continue
    logger.debug(line)
    lastPrintedLines.set(key, line)
  }
}

/**
 * Forget every cached response.
 *
 * Called by the runners after an in-process service run that may have changed
 * the stacks the cache holds (a Compose service `deploy` or `remove`), so a
 * service ordered after that run re-reads what it references through `${cf:}`
 * instead of seeing the pre-run value. De-duplication then costs one call per
 * stack per completed mutating service run rather than one per process.
 *
 * The clear is deliberately blanket, so any future `cache: true` call site is
 * covered without being enumerated here. The STS caller-identity entries it
 * also drops are immutable by construction — the cache key already contains
 * the principal — so they are re-read for no reason other than that.
 *
 * The request counters are deliberately NOT reset: the debug summary reports
 * what this process actually spent on AWS, and hiding the re-fetched calls
 * would make that summary a smaller number than the truth.
 */
export const invalidateAwsResponseCache = () => {
  responseCache.clear()
}

/**
 * Test seam: forget every process-wide object this module holds and,
 * optionally, route all clients through a caller-supplied request handler.
 * Production code never calls this.
 */
export const resetAwsResolverState = ({ requestHandler = null } = {}) => {
  sharedHandler = null
  sharedProxiedHandler = null
  handlerOverride = requestHandler
  responseCache.clear()
  counters.clear()
  lastPrintedLines.clear()
}
