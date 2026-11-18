/**
 * Thin AWS SDK v3 adapters for Dev Mode. Every Lambda control-plane call except GetFunction shares
 * 15 requests per second per account and region with every other tool, so the Lambda client does
 * no retries of its own and every call goes through `withBackoff` (jittered, honouring the
 * `retryAfterSeconds` Lambda returns). Conflicts and stale revisions are not retried here: the
 * attach and restore loops re-read the function and re-derive the change instead. The session's
 * periodic check reads with `getFunctionOnce`, which never retries. The Lambda Web client (web
 * apps) follows the same policy.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import {
  GetFunctionCommand,
  GetLayerVersionCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  PublishLayerVersionCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda'
import {
  CreateRoleCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  IAMClient,
  PutRolePermissionsBoundaryCommand,
  PutRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
} from '@aws-sdk/client-iam'
import { DescribeEndpointCommand, IoTClient } from '@aws-sdk/client-iot'
import {
  CreateWebFunctionEndpointCommand,
  CreateWebFunctionRevisionCommand,
  DeleteWebFunctionEndpointCommand,
  DeleteWebFunctionRevisionCommand,
  GetWebFunctionEndpointCommand,
  GetWebFunctionRevisionCommand,
  LambdaWebClient,
  ListWebFunctionEndpointsCommand,
  ListWebFunctionRevisionsCommand,
  UpdateWebFunctionEndpointCommand,
} from '@aws-sdk/client-lambda-web'
import { partition } from '@aws-sdk/core/client'
import { log, ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { addProxyToAwsClient } from '@serverless/util/src/proxy/index.js'
import { credentialSourceOf, credentialsFixLine } from '../relay/messages.js'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const THROTTLES = new Set([
  'TooManyRequestsException',
  'ThrottlingException',
  'Throttling',
  'RequestLimitExceeded',
])
// The Lambda client makes a single attempt, so network failures and server-side errors are
// retried here. ENOTFOUND is retried too: a Lambda endpoint always exists, so a lookup that fails
// is a resolver blip. Finding the AWS IoT Core endpoint does not go through here: it classifies
// ENOTFOUND itself.
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
])
const TRANSIENT_NAMES = new Set(['TimeoutError', 'ServiceException'])
const MAX_RETRY_AFTER_MS = 30_000

const retryAfterMs = (error) => {
  const value = error?.retryAfterSeconds
  if (value === undefined || value === null || value === '') return null
  const ms = Number(value) * 1000
  return Number.isFinite(ms) && ms >= 0
    ? Math.min(ms, MAX_RETRY_AFTER_MS)
    : null
}

const isTransient = (error) =>
  TRANSIENT_CODES.has(error?.code) ||
  TRANSIENT_NAMES.has(error?.name) ||
  error?.$metadata?.httpStatusCode >= 500 ||
  Boolean(error?.$retryable)

/**
 * Delay before the next attempt, or `null` when the error must not be retried here. A throttle's
 * `retryAfterSeconds` (capped at 30 s) is a floor; jitter is added on top so parallel workers that
 * were throttled together do not all wake in the same millisecond.
 */
export const retryDelayMs = (error, attempt, random = Math.random) => {
  const jitter = random()
  const base = Math.min(8000, 250 * 2 ** attempt) + Math.floor(jitter * 250)
  if (THROTTLES.has(error?.name) || error?.$metadata?.httpStatusCode === 429) {
    const after = retryAfterMs(error)
    if (after === null) return base
    const spread = Math.min(1000, Math.max(250, after / 4))
    return Math.max(after + Math.floor(jitter * spread), base)
  }
  return isTransient(error) ? base : null
}

/**
 * The kind of a failure `retryDelayMs` retries: `throttle` (a throttling error or HTTP 429),
 * `network` (a connection that failed or an SDK timeout), `server` (5xx, ServiceException, an
 * error the SDK marks retryable); null for any other.
 */
const retryKindOf = (error) => {
  if (THROTTLES.has(error?.name) || error?.$metadata?.httpStatusCode === 429) {
    return 'throttle'
  }
  if (TRANSIENT_CODES.has(error?.code) || error?.name === 'TimeoutError') {
    return 'network'
  }
  return isTransient(error) ? 'server' : null
}

/**
 * The retry option of the clients for the checks that run before `deploy`, `remove`,
 * `rollback --timestamp` and `deploy function`: those commands fail at their own first AWS call
 * when the network is down, so a network error is not retried and a server error once; a throttle
 * is retried twice, waiting at most a second each time, so a throttled check costs seconds, not
 * minutes. Dev Mode's own commands keep the full policy.
 */
export const PRE_COMMAND_RETRY = Object.freeze({
  maxRetries: Object.freeze({ network: 0, server: 1, throttle: 2 }),
  maxDelayMs: 1_000,
})

/**
 * How long the clients of those checks wait for a connection to AWS. Without it, an endpoint
 * whose network drops the packets (a private subnet with no route to Lambda, say) holds the
 * command until the operating system gives up on the connection, a minute or two; with it, the
 * check ends as a network error (`TimeoutError`) after a few seconds.
 */
export const PRE_COMMAND_CONNECTION_TIMEOUT_MS = 4_000

/**
 * Runs `fn` until it succeeds, retrying what `retryDelayMs` allows up to `maxAttempts` attempts in
 * all, and each kind of failure (`retryKindOf`) at most `maxRetries[kind]` times when given, each
 * wait at most `maxDelayMs` long; `onRetry({ error, retry, retries, delayMs })` hears of each retry
 * before its wait.
 */
export const withBackoff = async (
  fn,
  {
    sleep: wait = sleep,
    random = Math.random,
    maxAttempts = 8,
    maxRetries = {},
    maxDelayMs = Infinity,
    onRetry = () => {},
  } = {},
) => {
  const retriesOf = {}
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      const kind = retryKindOf(error)
      const kindAllows = (retriesOf[kind] ?? 0) < (maxRetries[kind] ?? Infinity)
      const wanted =
        attempt + 1 < maxAttempts && kindAllows
          ? retryDelayMs(error, attempt, random)
          : null
      const delay = wanted === null ? null : Math.min(wanted, maxDelayMs)
      if (delay === null) throw error
      retriesOf[kind] = (retriesOf[kind] ?? 0) + 1
      try {
        onRetry({
          error,
          retry: attempt + 1,
          retries: maxAttempts - 1,
          delayMs: delay,
        })
      } catch {
        // Telling of a retry never changes it.
      }
      await wait(delay)
    }
  }
}

/** The debug line of one retried call: the control-plane quota is shared with every other tool. */
const retryLine =
  (command, debug) =>
  ({ error, retry, retries, delayMs }) =>
    debug(
      `Dev Mode retries ${command?.constructor?.name ?? 'a call'} in ${delayMs} ms after ${error?.name ?? 'an error'} (retry ${retry} of ${retries})`,
    )

const debugLine = (text) => {
  try {
    log.get('sls:dev').debug(text)
  } catch {
    // Logging never changes a call.
  }
}

const CREDENTIAL_ERRORS = new Set([
  'ExpiredTokenException',
  'ExpiredToken',
  'UnrecognizedClientException',
  'InvalidClientTokenId',
  'InvalidSignatureException',
  'SignatureDoesNotMatch',
])

const CREDENTIALS_INVALID = 'DEV_MODE_AWS_CREDENTIALS_INVALID'

/**
 * Expired or invalid credentials: AWS answers 403 for these too, but they are not denials. The
 * error Dev Mode's clients already made from one (credentialsInvalidError) is one too.
 */
export const isCredentialError = (error) =>
  CREDENTIAL_ERRORS.has(error?.name) ||
  CREDENTIAL_ERRORS.has(error?.Code) ||
  error?.code === CREDENTIALS_INVALID

export const isAccessDenied = (error) =>
  !isCredentialError(error) &&
  (/AccessDenied/.test(`${error?.name ?? ''} ${error?.Code ?? ''}`) ||
    error?.$metadata?.httpStatusCode === 403)

/**
 * The AWS error behind one that `provider.request` threw. The provider wraps it in a
 * ServerlessError and keeps it as `providerError`: SDK v2 errors carry `code` and `statusCode`,
 * SDK v3 errors `name` and `$metadata`. The result is shaped for `isCredentialError` and
 * `isAccessDenied`; an error that was not wrapped is returned as is.
 */
export const awsErrorOf = (error) => {
  const wrapped = error?.providerError
  if (!wrapped) return error
  return {
    name: wrapped.name ?? wrapped.code,
    Code: wrapped.code,
    message: wrapped.message ?? error.message,
    $metadata: {
      httpStatusCode: wrapped.$metadata?.httpStatusCode ?? wrapped.statusCode,
    },
  }
}

/** The original AWS error, kept on a ServerlessError for debugging. */
export const originalOf = (error) => ({
  originalMessage: error?.message,
  originalName: error?.name,
  stack: false,
})

/**
 * Rejected credentials as one error that says where they come from and how to sign in again
 * (`credentialSource`: `credentialSourceOf(provider)`, `../relay/messages.js`). An error already
 * made here is returned as it is: Dev Mode's clients make it where the provider, and so the
 * source, is known. A caller with an AWS error from anywhere else must pass the source: without
 * it the advice names the default profile or the keys in the environment.
 */
export const credentialsInvalidError = (error, region, credentialSource) => {
  if (error?.code === CREDENTIALS_INVALID) return error
  const advice = credentialsFixLine(credentialSource)
  // `advice` on its own, for lines that show the AWS message in parentheses and the advice once.
  return Object.assign(
    new ServerlessError(
      `AWS rejected the credentials Dev Mode used${region ? ` in ${region}` : ''} (${error.message}). ${advice}`,
      CREDENTIALS_INVALID,
      originalOf(error),
    ),
    { advice },
  )
}

/**
 * An error from a call made through the Framework's provider (`provider.request`,
 * `provider.getAccountInfo()`), mapped like Dev Mode's own calls: rejected credentials become
 * DEV_MODE_AWS_CREDENTIALS_INVALID (naming `credentialSource`), a denial names `action`, anything
 * else is returned as is.
 */
export const providerCallError = (
  error,
  { region, credentialSource, action, why, code },
) => {
  const aws = awsErrorOf(error)
  if (isCredentialError(aws)) {
    return credentialsInvalidError(aws, region, credentialSource)
  }
  if (!isAccessDenied(aws)) return error
  return new ServerlessError(
    `Dev Mode needs permission to call ${action} ${why} (${aws.message}). Ask your AWS administrator to allow it for your role.`,
    code,
    originalOf(aws),
  )
}

const isNotFound = (error) =>
  [
    'ResourceNotFoundException',
    'NoSuchEntityException',
    'NoSuchEntity',
  ].includes(error?.name)

const POLL_MS = [500, 750, 1000, 1500, 2000]

const isBusy = (config) =>
  config.LastUpdateStatus === 'InProgress' || config.State === 'Pending'

/**
 * Polls GetFunction (its own 100 rps quota) until the function is created and the last
 * configuration update settled.
 */
export const waitForUpdate = async ({
  lambda,
  name,
  sleep: wait = sleep,
  now = Date.now,
  timeoutMs = 60_000,
}) => {
  const started = now()
  for (let i = 0; ; i += 1) {
    const config = await lambda.getFunction(name)
    if (!config || !isBusy(config)) return config
    if (now() - started > timeoutMs) {
      throw new ServerlessError(
        `The configuration update of the Lambda function ${name} did not finish within ${Math.round(timeoutMs / 1000)} s. Check the function in the AWS Lambda console, then run the command again.`,
        'DEV_MODE_UPDATE_TIMEOUT',
        { stack: false },
      )
    }
    await wait(POLL_MS[Math.min(i, POLL_MS.length - 1)])
  }
}

const NEAREST_IOT_REGION = {
  ap: 'ap-southeast-2',
  eu: 'eu-central-1',
  us: 'us-east-1',
  ca: 'ca-central-1',
  sa: 'sa-east-1',
  me: 'me-central-1',
  mx: 'us-east-1',
  af: 'eu-west-1',
  il: 'eu-central-1',
}

const FALLBACK_IOT_REGIONS = ['us-east-1', 'eu-central-1']

const suggestIotRegion = (region) =>
  [NEAREST_IOT_REGION[region.split('-')[0]], ...FALLBACK_IOT_REGIONS].find(
    (candidate) => candidate && candidate !== region,
  )

const isDnsNotFound = (error) =>
  error?.code === 'ENOTFOUND' || /ENOTFOUND/.test(error?.message ?? '')

const resolves = async (lookup, hostname) => {
  try {
    await lookup(hostname)
    return true
  } catch {
    return false
  }
}

/**
 * Dev Mode's broker is AWS IoT Core; a region without it fails before anything changes. An IoT
 * hostname that does not resolve means "no IoT Core here" only when the region's Lambda endpoint
 * does resolve; otherwise the network or DNS is the problem.
 */
export const findIotEndpoint = async ({ iot, region, lookup = dnsLookup }) => {
  try {
    return await iot.describeEndpoint()
  } catch (error) {
    const original = originalOf(error)
    if (isCredentialError(error)) {
      throw credentialsInvalidError(error, region)
    }
    if (isAccessDenied(error) || error?.name === 'UnauthorizedException') {
      throw new ServerlessError(
        `Dev Mode needs permission to call iot:DescribeEndpoint in ${region} (${error.message}). Ask your AWS administrator to allow it for your role.`,
        'DEV_MODE_IOT_ACCESS_DENIED',
        original,
      )
    }
    if (isDnsNotFound(error)) {
      // The Lambda host in the region's partition, from the AWS SDK's partition data.
      const lambdaHost = `lambda.${region}.${partition(region).dnsSuffix}`
      if (await resolves(lookup, lambdaHost)) {
        throw new ServerlessError(
          `Dev Mode needs AWS IoT Core, which is not available in ${region}. Use a stage in a region with IoT Core, such as ${suggestIotRegion(region)}.`,
          'DEV_MODE_REGION_NO_BROKER',
          original,
        )
      }
      throw new ServerlessError(
        `Dev Mode could not reach AWS in ${region} (${error.message}). Check your network connection, DNS and proxy settings, then run the command again.`,
        'DEV_MODE_AWS_UNREACHABLE',
        original,
      )
    }
    throw error
  }
}

/** Lifetime given to each resolved identity, so the SDK asks for fresh credentials. */
const CREDENTIAL_TTL_MS = 6 * 60_000

/**
 * A credential provider for SDK v3 clients that is re-resolved about once a minute. The SDK caches
 * an identity without `expiration` for the client's lifetime, and `provider.getCredentials()` does
 * not return one, so a session that outlives its credentials (SSO, assumed roles) would otherwise
 * keep signing with expired ones. The SDK refreshes an identity five minutes before it expires; the
 * underlying credential chain caches and refreshes on its own, so re-resolving is cheap.
 */
export const credentialProvider =
  (provider, now = () => Date.now()) =>
  async () => {
    const c = await provider.getCredentials()
    return {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
      expiration: new Date(now() + CREDENTIAL_TTL_MS),
    }
  }

/**
 * The SDK clients behind the adapters; the Lambda and Lambda Web clients make a single attempt
 * per call. With `connectionTimeoutMs`, a connection not made within it fails the call as a
 * `TimeoutError`; the proxy setup keeps it on the request handler it puts in place.
 */
export const createSdkClients = ({ provider, region, connectionTimeoutMs }) => {
  const credentials = credentialProvider(provider)
  const handler = connectionTimeoutMs
    ? { connectionTimeout: connectionTimeoutMs }
    : undefined
  const config = { region, credentials, requestHandler: handler }
  return {
    lambda: addProxyToAwsClient(
      new LambdaClient({ ...config, maxAttempts: 1 }),
      handler,
    ),
    iam: addProxyToAwsClient(new IAMClient(config), handler),
    iot: addProxyToAwsClient(new IoTClient(config), handler),
    lambdaWeb: addProxyToAwsClient(
      new LambdaWebClient({ ...config, maxAttempts: 1 }),
      handler,
    ),
  }
}

/** How often the Lambda Web waiters read the revision or endpoint. */
const WEB_POLL_MS = 1000

/** A Lambda Web response without the SDK's request metadata. */
const withoutMetadata = ({ $metadata, ...rest } = {}) => rest

/**
 * How long a waiter reads a revision or endpoint as "not visible yet" before it counts as gone: a
 * new one shows up within a second or two, so one missing for longer was deleted (by a teammate,
 * or by this session's own clean-up after Ctrl+C).
 */
const WEB_MISSING_GRACE_MS = 5_000

/**
 * Polls `read` every second until `settled(resource)` says it is done (true) or failed (an error
 * to throw). A `null` read (not visible yet) is read again until it has been missing for
 * WEB_MISSING_GRACE_MS in a row, then `missing()` is thrown. `timedOut()` makes the error thrown
 * when it is still not done after `timeoutMs`.
 */
const pollUntil = async ({
  read,
  settled,
  missing,
  timedOut,
  timeoutMs,
  sleep: wait,
  now,
}) => {
  const started = now()
  let missingSince = null
  for (;;) {
    const resource = await read()
    if (resource) missingSince = null
    else missingSince ??= now()
    if (missingSince !== null && now() - missingSince >= WEB_MISSING_GRACE_MS) {
      throw missing()
    }
    const outcome = resource ? settled(resource) : false
    if (outcome instanceof Error) throw outcome
    if (outcome) return resource
    if (now() - started >= timeoutMs) throw timedOut()
    await wait(WEB_POLL_MS)
  }
}

export const createDevModeClients = ({
  provider,
  region,
  sdk,
  retry = {},
  connectionTimeoutMs,
  debug = debugLine,
}) => {
  const built =
    sdk?.lambda && sdk?.iam && sdk?.iot && sdk?.lambdaWeb
      ? {}
      : createSdkClients({ provider, region, connectionTimeoutMs })
  // Rejected credentials become Dev Mode's error here, where the provider is known, so the error
  // names where the credentials come from; callers pass that error on as it is.
  const credentialSource = credentialSourceOf(provider)
  const credentialsChecked = (client) => ({
    send: async (command) => {
      try {
        return await client.send(command)
      } catch (error) {
        throw isCredentialError(error)
          ? credentialsInvalidError(error, region, credentialSource)
          : error
      }
    },
  })
  const lambdaSdk = credentialsChecked(sdk?.lambda ?? built.lambda)
  const iamSdk = credentialsChecked(sdk?.iam ?? built.iam)
  const iotSdk = credentialsChecked(sdk?.iot ?? built.iot)
  const lambdaWebSdk = credentialsChecked(sdk?.lambdaWeb ?? built.lambdaWeb)
  const backoff = (client) => (command) =>
    withBackoff(() => client.send(command), {
      onRetry: retryLine(command, debug),
      ...retry,
    })
  const send = backoff(lambdaSdk)
  const sendWeb = backoff(lambdaWebSdk)
  const nullIfMissing = async (call) => {
    try {
      return withoutMetadata(await call())
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }
  /** Every item of a Lambda Web list, page after page; none when the web function is gone. */
  const listAll = async (Command, input, key) => {
    const items = []
    let nextToken
    do {
      let page
      try {
        page = await sendWeb(new Command({ ...input, nextToken }))
      } catch (error) {
        if (isNotFound(error)) return []
        throw error
      }
      items.push(...(page[key] ?? []))
      nextToken = page.nextToken
    } while (nextToken)
    return items
  }
  /** True once deleted; false when it was already gone. */
  const deleteWeb = async (command) => {
    try {
      await sendWeb(command)
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  }
  const lambdaWeb = {
    getEndpoint: ({ functionName, endpointName }) =>
      nullIfMissing(() =>
        sendWeb(
          new GetWebFunctionEndpointCommand({ functionName, endpointName }),
        ),
      ),
    /** Sends all of the endpoint's traffic to `revisionId`. */
    updateEndpointWeights: async ({ functionName, endpointName, revisionId }) =>
      withoutMetadata(
        await sendWeb(
          new UpdateWebFunctionEndpointCommand({
            functionName,
            endpointName,
            revisionWeights: [{ revisionId, weight: 100 }],
          }),
        ),
      ),
    /**
     * An endpoint in the function's home region serving `revisionId` alone. Automatic deployment
     * is off, so revisions created later take none of its traffic.
     */
    createEndpoint: async ({
      functionName,
      endpointName,
      revisionId,
      authType = 'IamAuth',
    }) =>
      withoutMetadata(
        await sendWeb(
          new CreateWebFunctionEndpointCommand({
            functionName,
            endpointName,
            endpointType: 'HomeRegion',
            authType,
            autoDeploymentMode: 'Disabled',
            revisionWeights: [{ revisionId, weight: 100 }],
          }),
        ),
      ),
    deleteEndpoint: ({ functionName, endpointName }) =>
      deleteWeb(
        new DeleteWebFunctionEndpointCommand({ functionName, endpointName }),
      ),
    listEndpoints: ({ functionName }) =>
      listAll(ListWebFunctionEndpointsCommand, { functionName }, 'endpoints'),
    /** One attempt, no backoff: for the session's periodic check, which tries again next time. */
    getEndpointOnce: ({ functionName, endpointName }) =>
      nullIfMissing(() =>
        lambdaWebSdk.send(
          new GetWebFunctionEndpointCommand({ functionName, endpointName }),
        ),
      ),
    getRevisionOnce: ({ functionName, revisionId }) =>
      nullIfMissing(() =>
        lambdaWebSdk.send(
          new GetWebFunctionRevisionCommand({ functionName, revisionId }),
        ),
      ),
    getRevision: ({ functionName, revisionId }) =>
      nullIfMissing(() =>
        sendWeb(
          new GetWebFunctionRevisionCommand({ functionName, revisionId }),
        ),
      ),
    createRevision: async ({
      functionName,
      description,
      kmsKeyArn,
      buildConfig,
      serviceConfig,
    }) =>
      withoutMetadata(
        await sendWeb(
          new CreateWebFunctionRevisionCommand({
            functionName,
            description,
            kmsKeyArn,
            buildConfig,
            serviceConfig,
          }),
        ),
      ),
    deleteRevision: ({ functionName, revisionId }) =>
      deleteWeb(
        new DeleteWebFunctionRevisionCommand({ functionName, revisionId }),
      ),
    listRevisions: ({ functionName }) =>
      listAll(ListWebFunctionRevisionsCommand, { functionName }, 'revisions'),
    /** The revision once it is Active (a new one takes several seconds). */
    waitRevisionActive: ({
      functionName,
      revisionId,
      timeoutMs = 60_000,
      sleep: wait = sleep,
      now = Date.now,
    }) =>
      pollUntil({
        read: () => lambdaWeb.getRevision({ functionName, revisionId }),
        settled: (revision) => {
          if (revision.state === 'Active') return true
          if (revision.state !== 'Failed') return false
          const reason =
            revision.errors?.[0]?.errorMessage ?? revision.stateReason
          return new ServerlessError(
            `AWS Lambda could not activate the revision ${revisionId} of the web function ${functionName}${reason ? ` (${reason})` : ''}. Check the web app's configuration, then run the command again.`,
            'DEV_MODE_REVISION_FAILED',
            { stack: false },
          )
        },
        missing: () =>
          new ServerlessError(
            `The revision ${revisionId} of the web function ${functionName} was not found: it was deleted while Dev Mode waited for it. Run the command again.`,
            'DEV_MODE_REVISION_NOT_FOUND',
            { stack: false },
          ),
        timedOut: () =>
          new ServerlessError(
            `The revision ${revisionId} of the web function ${functionName} did not become active within ${Math.round(timeoutMs / 1000)} s. Check the web function in the AWS Lambda console, then run the command again.`,
            'DEV_MODE_REVISION_TIMEOUT',
            { stack: false },
          ),
        timeoutMs,
        sleep: wait,
        now,
      }),
    /** The endpoint once it is Active with no update in progress. */
    waitEndpointActive: ({
      functionName,
      endpointName,
      timeoutMs = 60_000,
      sleep: wait = sleep,
      now = Date.now,
    }) =>
      pollUntil({
        read: () => lambdaWeb.getEndpoint({ functionName, endpointName }),
        settled: (endpoint) => {
          if (endpoint.state === 'Deleting') {
            return new ServerlessError(
              `The endpoint ${endpointName} of the web function ${functionName} is being deleted. Run the command again once it is gone.`,
              'DEV_MODE_ENDPOINT_DELETING',
              { stack: false },
            )
          }
          if (
            endpoint.state === 'Failed' ||
            endpoint.updateStatus === 'Failed'
          ) {
            const reason =
              endpoint.state === 'Failed'
                ? endpoint.stateReason
                : endpoint.updateStatusReason
            return new ServerlessError(
              `AWS Lambda could not activate the endpoint ${endpointName} of the web function ${functionName}${reason ? ` (${reason})` : ''}. Check the web function in the AWS Lambda console, then run the command again.`,
              'DEV_MODE_ENDPOINT_FAILED',
              { stack: false },
            )
          }
          return (
            endpoint.state === 'Active' &&
            endpoint.updateStatus !== 'InProgress'
          )
        },
        missing: () =>
          new ServerlessError(
            `The endpoint ${endpointName} of the web function ${functionName} was not found: it was deleted while Dev Mode waited for it. Run the command again.`,
            'DEV_MODE_ENDPOINT_NOT_FOUND',
            { stack: false },
          ),
        timedOut: () =>
          new ServerlessError(
            `The endpoint ${endpointName} of the web function ${functionName} did not become active within ${Math.round(timeoutMs / 1000)} s. Check the web function in the AWS Lambda console, then run the command again.`,
            'DEV_MODE_ENDPOINT_TIMEOUT',
            { stack: false },
          ),
        timeoutMs,
        sleep: wait,
        now,
      }),
  }

  return {
    lambda: {
      async getFunction(name) {
        try {
          return (await send(new GetFunctionCommand({ FunctionName: name })))
            .Configuration
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      /** One attempt, no backoff: for periodic reads that simply try again next time. */
      async getFunctionOnce(name) {
        try {
          return (
            await lambdaSdk.send(new GetFunctionCommand({ FunctionName: name }))
          ).Configuration
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      updateFunctionConfiguration: (params) =>
        send(new UpdateFunctionConfigurationCommand(params)),
      async *listLayerVersions(layerName) {
        let Marker
        do {
          let page
          try {
            page = await send(
              new ListLayerVersionsCommand({
                LayerName: layerName,
                Marker,
                MaxItems: 50,
              }),
            )
          } catch (error) {
            if (isNotFound(error)) return
            throw error
          }
          yield* page.LayerVersions ?? []
          Marker = page.NextMarker
        } while (Marker)
      },
      publishLayerVersion: (params) =>
        send(new PublishLayerVersionCommand(params)),
      /** One version of a layer, with its `Content.CodeSha256`; null when it does not exist. */
      async getLayerVersion(layerName, versionNumber) {
        try {
          return await send(
            new GetLayerVersionCommand({
              LayerName: layerName,
              VersionNumber: versionNumber,
            }),
          )
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
    },
    iam: {
      async getRole(name) {
        try {
          return (await iamSdk.send(new GetRoleCommand({ RoleName: name })))
            .Role
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      /** The inline policy's document, URL-decoded; `null` when the role has no such policy. */
      async getRolePolicy(roleName, policyName) {
        try {
          const out = await iamSdk.send(
            new GetRolePolicyCommand({
              RoleName: roleName,
              PolicyName: policyName,
            }),
          )
          return decodeURIComponent(out.PolicyDocument ?? '')
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      createRole: async (params) =>
        (await iamSdk.send(new CreateRoleCommand(params))).Role,
      putRolePolicy: (params) => iamSdk.send(new PutRolePolicyCommand(params)),
      putRolePermissionsBoundary: (params) =>
        iamSdk.send(new PutRolePermissionsBoundaryCommand(params)),
      updateAssumeRolePolicy: (params) =>
        iamSdk.send(new UpdateAssumeRolePolicyCommand(params)),
    },
    iot: {
      describeEndpoint: async () =>
        (
          await iotSdk.send(
            new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }),
          )
        ).endpointAddress,
    },
    lambdaWeb,
  }
}
