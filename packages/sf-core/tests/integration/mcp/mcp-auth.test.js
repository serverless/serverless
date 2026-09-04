/**
 * Live-AWS conformance for the two things the `mcp` property does about
 * authentication — and it does not do authentication.
 *
 * Enforcement is the user's: an API Gateway authorizer in front of the MCP
 * route, or the server module itself. The Framework compiles the authorizer the
 * user configured and, separately, can publish an RFC 9728 protected-resource
 * document from an API Gateway MOCK route so interactive clients can find out
 * where to log in. Nothing in the deployed function verifies a token. So this
 * suite deploys one server per enforcement shape and asserts what the GATEWAY
 * does with each — including the case that proves the point: a rejected request
 * never reaches the function at all (asserted from CloudWatch, not inferred
 * from the status code).
 *
 * The four servers in `./fixture-auth/serverless-auth.yml`:
 *
 *   cognito       — `authorizer: { arn: <pool>, scopes: [...] }` against the
 *                   account's predeployed Cognito prerequisite, plus the only
 *                   `oauthDiscovery` block, so it is also the discovery subject
 *   custom        — `authorizer: verifyToken`, the bare-string TOKEN shape
 *   customRequest — the same secret, a REQUEST authorizer, `resultTtlInSeconds: 0`
 *   open          — no authorizer, no discovery: the plain MCP round trip, which
 *                   doubles as this suite's streaming re-gate
 *
 * The directory `./fixture-auth` is private to this file on purpose: packaging
 * stages an entry file into the service directory and `.serverless/` /
 * `node_modules/` are shared state, while jest parallelizes test FILES with no
 * worker cap — so sharing one directory with `mcp.test.js` would be a race the
 * moment both files run. One directory per file removes it by construction
 * (`./fixture-auth/README.md`).
 *
 * The pool is not knowable at authoring time, so it is discovered at runtime
 * from the Cognito prerequisite in SSM
 * (`tests/integration/mcp-cognito-prerequisite/template.yml`, documented in
 * TESTING.md). When that prerequisite is absent the whole suite skips with an
 * explanatory log rather than hard-failing an account that lacks it — but a read
 * that FAILS (denied, throttled, expired credentials, network) fails the file
 * loudly instead of skipping, since none of those is an opted-out account.
 *
 * Serialized `test()` steps, `npm install` (not `ci`) in `beforeAll`, and a
 * safety-net teardown of ONLY the fixture stack — the Cognito prerequisite
 * persists — all per the fixture README and the core `mcp.test.js` it mirrors.
 */
import {
  jest,
  describe,
  test,
  beforeAll,
  afterAll,
  afterEach,
  expect,
} from '@jest/globals'
import path from 'path'
import url from 'url'
import { randomUUID } from 'crypto'
import spawnExt from 'child-process-ext/spawn.js'
import { setGlobalRendererSettings, log } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { createMcpChecks, createMcpClient, request } from './lib/client.mjs'
import { readCognitoPrerequisite, DEFAULT_PREFIX } from './lib/cognito.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const REGION = 'us-east-1'
const fixtureDir = path.join(__dirname, 'fixture-auth')
const configFile = 'serverless-auth.yml'

const cfn = new CloudFormationClient({ region: REGION })
const logs = new CloudWatchLogsClient({ region: REGION })
const stage = getTestStageName()
const originalEnv = process.env

// Service name in serverless-auth.yml is `sfc-mcp-auth`.
const authStack = `sfc-mcp-auth-${stage}`

// Per run, so a leaked value from an earlier run authorizes nothing. Both
// Lambda authorizers compare against `Bearer ${MCP_TEST_SECRET}`.
const secret = randomUUID()

// Read the prerequisite once, at collection time, so the suite can decide
// whether to run at all. A cheap single SSM path read that answers null — skip —
// only when the prerequisite is genuinely absent (nothing or only some of the
// parameters under the prefix, or no credentials at all) and throws on every
// other failure. Deliberately NOT wrapped in a `.catch`: letting those rejections
// escape fails this file loudly, which is the point — a denied, throttled or
// timed-out read is a read that should have worked, and a silent skip would
// report the auth chain as covered when nothing ran.
const cognito = await readCognitoPrerequisite({ region: REGION })
const describeAuth = cognito ? describe : describe.skip
if (!cognito) {
  console.warn(
    `[mcp-auth] Cognito prerequisite not found under ${DEFAULT_PREFIX} in ${REGION} — skipping the auth suite. Deploy tests/integration/mcp-cognito-prerequisite/template.yml once per account (see TESTING.md).`,
  )
}

const deploy = () =>
  runSfCore({
    jest,
    coreParams: {
      options: { stage, c: path.join(fixtureDir, configFile) },
      command: ['deploy'],
    },
  })

const remove = () =>
  runSfCore({
    jest,
    coreParams: {
      options: { stage, c: path.join(fixtureDir, configFile) },
      command: ['remove'],
    },
  })

const stackExists = async (stackName) => {
  try {
    await cfn.send(new DescribeStacksCommand({ StackName: stackName }))
    return true
  } catch (error) {
    if (/does not exist/.test(error.message)) return false
    throw error
  }
}

const serviceEndpointOf = async (stackName) => {
  const { Stacks } = await cfn.send(
    new DescribeStacksCommand({ StackName: stackName }),
  )
  const endpoint = (Stacks?.[0]?.Outputs ?? []).find(
    (o) => o.OutputKey === 'ServiceEndpoint',
  )?.OutputValue
  if (!endpoint) throw new Error(`no ServiceEndpoint output on ${stackName}`)
  return endpoint
}

const mcpUrl = (serviceEndpoint, server) => `${serviceEndpoint}/${server}/mcp`

// RFC 9728 puts the document at the resource's own path prefixed by the
// well-known segment, which for an execute-api URL means UNDER the stage — the
// stage prefix is part of the resource path.
const discoveryUrl = (serviceEndpoint, server) =>
  `${serviceEndpoint}/.well-known/oauth-protected-resource/${server}/mcp`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retries `read` until `accept` is satisfied, or fails with the last value
 * seen. Polling rather than sleeping: the happy path costs one call, and the
 * budget is only spent when something is genuinely still propagating.
 */
const pollUntil = async (
  read,
  accept,
  { timeoutMs, intervalMs = 3000, what },
) => {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    last = await read()
    if (accept(last)) return last
    if (Date.now() >= deadline) {
      throw new Error(
        `${what} never became true within ${timeoutMs}ms; last value: ${JSON.stringify(last)}`,
      )
    }
    await sleep(intervalMs)
  }
}

// The window every invocation count is scoped to: module load, which is before
// the stack this suite counts against exists, minus a generous margin for clock
// skew between this host and CloudWatch. The margin costs nothing — nothing can
// have logged into a log group whose stack is created later in the run — and it
// removes the one way a skewed clock could hide an invocation and turn the
// never-invoked assertion into a false pass. Scoping also means a stage name
// reused from an earlier run counts only THIS run's invocations, so the numbers
// mean the same thing whether the stack was created or updated.
const SKEW_MARGIN_MS = 300000
const COUNT_FROM_MS = Date.now() - SKEW_MARGIN_MS

/**
 * How many times a function has been invoked SINCE THIS RUN STARTED, counted
 * from the `REPORT RequestId` line the Lambda runtime writes once per
 * invocation — which is emitted for every invocation including a failing one,
 * so it counts what a per-request log line in the handler would miss.
 *
 * Every attempt walks the WHOLE page set: with a filterPattern, a page can
 * legitimately match nothing and still hand back a nextToken (the filter is
 * applied per scanned page, not to the result set), so a single unpaginated
 * call under-counts. A log group with no invocations yet may not exist — the
 * Framework declares it, but an absent group is still zero invocations.
 */
const countInvocations = async (functionName) => {
  const logGroupName = `/aws/lambda/${functionName}`
  let total = 0
  let nextToken
  do {
    let page
    try {
      page = await logs.send(
        new FilterLogEventsCommand({
          logGroupName,
          filterPattern: '"REPORT RequestId"',
          startTime: COUNT_FROM_MS,
          nextToken,
        }),
      )
    } catch (error) {
      if (/ResourceNotFoundException/.test(error.name ?? '')) return 0
      throw error
    }
    total += (page.events ?? []).length
    nextToken = page.nextToken
  } while (nextToken)
  return total
}

// CloudWatch ingestion is eventually consistent with no delivery bound; the
// sibling suite observed a 120s budget exhausted on an otherwise-green run, so
// this matches its 240s.
const INGESTION_BUDGET_MS = 240000
// Once the LATER invocation's line is visible, an earlier one would be too —
// same function, same log stream, and a stream's events are delivered in order.
// This grace is belt on top of that.
const SETTLE_MS = 15000

/**
 * Requires `functionName` to show exactly `expected` invocations and to be
 * STABLE at that number across the settle window.
 *
 * Two reads, both asserted. The first is the read that ended the wait: the poll
 * accepts `>= expected`, so without this assertion an extra invocation that had
 * already landed would be waved through by the acceptance and only caught, if
 * at all, by the later read. The second is taken `SETTLE_MS` afterwards, and
 * catches an extra invocation whose log line was still in flight. Asserting
 * both is what makes "stable at exactly N across a window" the claim, rather
 * than something inferred from one reading and an assumption that the count
 * only ever grows.
 */
const expectInvocations = async (functionName, expected) => {
  const settled = await pollUntil(
    () => countInvocations(functionName),
    (count) => count >= expected,
    {
      timeoutMs: INGESTION_BUDGET_MS,
      what: `${functionName} reaching ${expected} invocation(s)`,
    },
  )
  expect(settled).toBe(expected)
  await sleep(SETTLE_MS)
  expect(await countInvocations(functionName)).toBe(expected)
}

// The JSON-RPC call every "does this reach the server" assertion uses. Kept as
// one helper so a rejection and an acceptance differ only by the token.
const toolsList = (endpoint, token) =>
  request({ endpoint }, { method: 'tools/list', token })

// What API Gateway answers with when an authorizer refuses: its own
// `UNAUTHORIZED` gateway response, with nothing of ours in it. Pinned as an
// object rather than a substring because the exact body is what a client sees
// instead of an MCP error — there is no JSON-RPC envelope in a gateway
// rejection, and no `WWW-Authenticate` challenge either.
const GATEWAY_UNAUTHORIZED_BODY = { message: 'Unauthorized' }

const expectGatewayUnauthorized = (r) => {
  expect(r.status).toBe(401)
  expect(r.json).toEqual(GATEWAY_UNAUTHORIZED_BODY)
  expect(r.headers.get('x-amzn-errortype')).toBe('UnauthorizedException')
}

// Static shape of the check list — names and numbered titles only — enumerated
// from a placeholder endpoint. `test.each` needs this at collection time; the
// real client is built in the deploy step and looked up by name.
const checkListOf = (options) =>
  createMcpChecks({
    endpoint: 'https://placeholder.example/server/mcp',
    ...options,
  }).map(({ name, title }) => ({ name, title }))

const baseCheckList = checkListOf({})
const longCheckList = checkListOf({ longRunning: true })

describeAuth('MCP servers live integration — enforcement and discovery', () => {
  let serviceEndpoint
  let cognitoChecks
  let openChecks
  let cognitoUrl
  let customUrl
  let customRequestUrl
  let openUrl
  let tokenA
  let tokenB

  const runByName = (checks, name) => {
    if (!checks) throw new Error('deploy step did not complete')
    const check = checks.find((c) => c.name === name)
    if (!check) {
      throw new Error(
        `no check named "${name}" in this list (${checks.map((c) => c.name).join(', ')}) — the collection-time list and the runtime list have diverged`,
      )
    }
    return check.run()
  }

  beforeAll(async () => {
    // `warning`, not `error`: the deploy step asserts on the stage-URL discovery
    // warning, and the logger drops anything above the configured level.
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'warning' })
    // Mint before the env swap so the token endpoint's own resolution is not
    // disturbed; tokens live an hour, well past a full run.
    tokenA = await cognito.mintClientA()
    tokenB = await cognito.mintClientB()
    // The prerequisite publishes the pool id, not its ARN, and the ARN is what
    // an authorizer names. Partition comes from the caller's own ARN rather
    // than being assumed to be `aws`.
    const identity = await new STSClient({ region: REGION }).send(
      new GetCallerIdentityCommand({}),
    )
    const poolArn = `arn:${identity.Arn.split(':')[1]}:cognito-idp:${cognito.region}:${identity.Account}:userpool/${cognito.poolId}`
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
      // The fixture reads these with no defaults; a missing value fails config
      // resolution rather than deploying a server nothing can authenticate to.
      MCP_TEST_COGNITO_POOL_ARN: poolArn,
      MCP_TEST_COGNITO_SCOPE: cognito.scope,
      MCP_TEST_COGNITO_ISSUER: cognito.issuer,
      MCP_TEST_SECRET: secret,
    }
    // `install`, not `ci`: the fixture is committed without a full lockfile
    // tree, matching the esbuild-fixture precedent. Awaited directly: the
    // promise rejects on a non-zero exit or a spawn error, so a failed install
    // fails this hook before anything deploys. Inherited stdio keeps npm's own
    // output in the log, where a failing run needs it.
    await spawnExt('npm', ['install'], { cwd: fixtureDir, stdio: 'inherit' })
  }, 600000)

  afterEach(() => jest.restoreAllMocks())

  afterAll(async () => {
    // Safety net: remove the fixture stack if a failed step left it standing.
    // The Cognito prerequisite is NOT touched — it persists.
    jest.restoreAllMocks()
    try {
      if (await stackExists(authStack)) await remove()
    } catch (error) {
      log.error(`teardown of ${authStack} failed`, error)
    }
    process.env = originalEnv
  })

  test('deploy', async () => {
    // The deploy prints the discovery-exposure warning, and this account has no
    // custom domain, so the document can only be published at the stage URL —
    // the case the Framework is required to say out loud, because a browser
    // client probing the origin root will never find a document there. Captured
    // by tapping the streams rather than replacing them, so the output still
    // reaches the terminal for a failing run.
    let output = ''
    const tap = (stream) => {
      const write = stream.write.bind(stream)
      return jest
        .spyOn(stream, 'write')
        .mockImplementation((chunk, ...rest) => {
          output += chunk
          return write(chunk, ...rest)
        })
    }
    const taps = [tap(process.stdout), tap(process.stderr)]
    try {
      await deploy()
    } finally {
      for (const t of taps) t.mockRestore()
    }

    // Colour codes stripped and whitespace collapsed, so neither the renderer's
    // styling nor a line wrap decides whether this assertion holds.
    const printed = output
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/\s+/g, ' ')
    expect(printed).toContain(
      'MCP server "cognito" advertises OAuth discovery at the stage URL, which interactive clients cannot discover.',
    )

    serviceEndpoint = await serviceEndpointOf(authStack)
    cognitoUrl = mcpUrl(serviceEndpoint, 'cognito')
    customUrl = mcpUrl(serviceEndpoint, 'custom')
    customRequestUrl = mcpUrl(serviceEndpoint, 'customRequest')
    openUrl = mcpUrl(serviceEndpoint, 'open')
    cognitoChecks = createMcpChecks({
      endpoint: cognitoUrl,
      bearerToken: tokenA,
    })
    openChecks = createMcpChecks({ endpoint: openUrl, longRunning: true })
  })

  describe('cognito — a Cognito user pool authorizer', () => {
    // FIRST, before anything else calls this server: the assertion is that the
    // function has NEVER been invoked at the moment the rejected request has
    // already been answered, which is only meaningful from a clean count.
    test('a garbage token is rejected by the gateway, and the server function is never invoked', async () => {
      const functionName = `${authStack}-cognito`
      expect(await countInvocations(functionName)).toBe(0)

      const rejected = await toolsList(cognitoUrl, 'not.a.real.token')
      expectGatewayUnauthorized(rejected)

      // The negative control: the same request with a real token DOES invoke
      // the function, so "no invocation" above is a fact about the rejection
      // rather than about the way invocations are counted. It is also the
      // sentinel the wait below is anchored on — once its line is visible, an
      // invocation from the rejected request would be visible too.
      const accepted = await toolsList(cognitoUrl, tokenA)
      expect(accepted.status).toBe(200)

      await expectInvocations(functionName, 1)
    }, 400000)

    // Run WITH client A's access token, so all twelve must pass: past the
    // authorizer, an enforced server is an ordinary MCP server.
    test.each(baseCheckList)('cognito — $title', async ({ name }) => {
      await runByName(cognitoChecks, name)
    })

    // Not a defect, and not obvious from the configuration: the authorizer is
    // configured with a POOL and a SCOPE, so any client of that pool holding
    // that scope is admitted. Narrowing to one client is the server module's
    // job (the token's `client_id` claim reaches it in the authorizer context),
    // which is exactly the "enforcement is yours" boundary this suite is about.
    test('a token from another client of the same pool and scope is accepted', async () => {
      const r = await toolsList(cognitoUrl, tokenB)
      expect(r.status).toBe(200)
      expect((r.json.result?.tools ?? []).map((t) => t.name).sort()).toEqual([
        'add',
        'approve_refund',
        'slow_report',
      ])
    })
  })

  describe('custom — a TOKEN Lambda authorizer (`authorizer: verifyToken`)', () => {
    const authorizerFunction = () => `${authStack}-verifyToken`

    // TOKEN authorizers have an identity source (`Authorization` by default),
    // and API Gateway rejects a request that omits it without invoking the
    // authorizer at all. Its REQUEST sibling below is the contrast: with
    // `resultTtlInSeconds: 0` there is no identity source, and the same
    // header-less request runs the function.
    test('a request with no Authorization header is rejected before the authorizer runs', async () => {
      expect(await countInvocations(authorizerFunction())).toBe(0)

      const rejected = await toolsList(customUrl, null)
      expectGatewayUnauthorized(rejected)

      // Negative control + sentinel, as above.
      const accepted = await toolsList(customUrl, secret)
      expect(accepted.status).toBe(200)

      await expectInvocations(authorizerFunction(), 1)
    }, 400000)

    test('the wrong secret is rejected with the bare gateway 401', async () => {
      expectGatewayUnauthorized(await toolsList(customUrl, 'not-the-secret'))
    })

    test('the correct secret reaches the server: tools/list and tools/call', async () => {
      const client = createMcpClient({
        endpoint: customUrl,
        bearerToken: secret,
      })
      const list = await client.request({ method: 'tools/list' })
      expect(list.status).toBe(200)
      expect((list.json.result?.tools ?? []).map((t) => t.name).sort()).toEqual(
        ['add', 'approve_refund', 'slow_report'],
      )
      const called = await client.request({
        method: 'tools/call',
        params: { name: 'add', arguments: { a: 2, b: 40 } },
        name: 'add',
      })
      expect(called.json.result?.structuredContent).toEqual({ sum: 42 })
    })
  })

  describe('customRequest — a REQUEST Lambda authorizer, resultTtlInSeconds: 0', () => {
    const authorizerFunction = () => `${authStack}-verifyRequest`

    // The contrast with the TOKEN server: no identity source and no cache, so
    // API Gateway hands EVERY request to the authorizer — including one with no
    // Authorization header, which the function then refuses on its own. No
    // sentinel is needed here: the rejected request is itself the invocation
    // being counted.
    test('a request with no Authorization header still runs the authorizer, which refuses it', async () => {
      expect(await countInvocations(authorizerFunction())).toBe(0)

      const rejected = await toolsList(customRequestUrl, null)
      expectGatewayUnauthorized(rejected)

      await expectInvocations(authorizerFunction(), 1)
    }, 400000)

    test('the wrong secret is rejected with the bare gateway 401', async () => {
      expectGatewayUnauthorized(
        await toolsList(customRequestUrl, 'not-the-secret'),
      )
    })

    test('the correct secret, read from event.headers, reaches the server', async () => {
      const client = createMcpClient({
        endpoint: customRequestUrl,
        bearerToken: secret,
      })
      const list = await client.request({ method: 'tools/list' })
      expect(list.status).toBe(200)
      const called = await client.request({
        method: 'tools/call',
        params: { name: 'add', arguments: { a: 20, b: 22 } },
        name: 'add',
      })
      expect(called.json.result?.structuredContent).toEqual({ sum: 42 })
    })
  })

  describe('oauthDiscovery — the MOCK protected-resource document', () => {
    // The document API Gateway is expected to serve, byte-for-byte. It is
    // serialized once by the compiler so the method resource is stable across
    // deploys, so the key ORDER is part of what is being pinned — a client
    // reads the parsed object, but a changed serialization would rewrite the
    // resource on every deploy.
    const expectedDocument = () =>
      JSON.stringify({
        resource: `${serviceEndpoint}/cognito/mcp`,
        authorization_servers: [cognito.issuer],
        bearer_methods_supported: ['header'],
      })

    test('an unauthenticated GET returns the document with a CORS header', async () => {
      // A freshly created API Gateway deployment can take a moment to answer on
      // every edge; poll rather than sleep, so a healthy read costs one call.
      const res = await pollUntil(
        async () => {
          const r = await fetch(discoveryUrl(serviceEndpoint, 'cognito'), {
            headers: { accept: 'application/json' },
          })
          return { status: r.status, headers: r.headers, text: await r.text() }
        },
        (r) => r.status === 200,
        { timeoutMs: 70000, what: 'the discovery document answering 200' },
      )

      expect(res.headers.get('content-type')).toBe('application/json')
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      expect(res.text).toBe(expectedDocument())
      expect(JSON.parse(res.text)).toEqual({
        resource: `${serviceEndpoint}/cognito/mcp`,
        authorization_servers: [cognito.issuer],
        bearer_methods_supported: ['header'],
      })
    }, 120000)

    test('the CORS preflight answers 204 and allows mcp-protocol-version', async () => {
      const res = await fetch(discoveryUrl(serviceEndpoint, 'cognito'), {
        method: 'OPTIONS',
      })

      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-headers')).toContain(
        'mcp-protocol-version',
      )
      expect(res.headers.get('access-control-allow-methods')).toBe(
        'GET,OPTIONS',
      )
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })

    // The whole point of serving the document from a MOCK route: it is not
    // behind the authorizer, so a client that cannot yet get a token can still
    // read where to get one. Both halves asserted in one test, against the same
    // server, with the same (absent) credentials.
    test('the document is readable by exactly the client the server route rejects', async () => {
      const rejected = await toolsList(cognitoUrl, null)
      expectGatewayUnauthorized(rejected)

      const readable = await fetch(discoveryUrl(serviceEndpoint, 'cognito'), {
        headers: { accept: 'application/json' },
      })
      expect(readable.status).toBe(200)
      expect(await readable.text()).toBe(expectedDocument())
    })

    // Clients probe the metadata document at the ORIGIN root:
    // `/.well-known/oauth-protected-resource` + the resource path. On a raw
    // execute-api URL that path sits above the stage, so API Gateway answers
    // 403 before anything of ours is reached. Documented, not desired:
    // root-mapped custom domains are where the probe resolves. A 200 here means
    // the platform limitation lifted and the docs need revisiting.
    test('the RFC 9728 root probe does not resolve on a raw execute-api endpoint', async () => {
      const origin = new URL(serviceEndpoint).origin
      const probe = `${origin}/.well-known/oauth-protected-resource${new URL(cognitoUrl).pathname}`

      const res = await fetch(probe, {
        headers: { accept: 'application/json' },
      })

      expect(res.status).not.toBe(200)
      expect(res.status).toBe(403)
    })

    test('a server without oauthDiscovery publishes no document', async () => {
      for (const server of ['open', 'custom', 'customRequest']) {
        const res = await fetch(discoveryUrl(serviceEndpoint, server), {
          headers: { accept: 'application/json' },
        })
        expect({ server, status: res.status }).toEqual({ server, status: 403 })
      }
    })
  })

  describe('open — no authorizer, no discovery', () => {
    // The full list including the long cases, which is also this suite's
    // re-gate on ordinary streaming through the deployed function: incremental
    // SSE delivery (`antiBuffering`) and a ~36s call that is not cut short.
    test.each(longCheckList)(
      'open — $title',
      async ({ name }) => {
        await runByName(openChecks, name)
      },
      180000,
    )

    // A JSON-RPC NOTIFICATION — no `id`, so no response body is due. The
    // handler answers 202 with nothing in it, and the status is carried by the
    // response prelude, which the Lambda runtime only emits from inside a
    // write. A body-less response that wrote nothing would reach the client as
    // zero bytes: no reply at all, and no standalone SSE stream for
    // elicitation. This is that path, live, through the deployed function.
    test('a notification is answered with an empty 202', async () => {
      const res = await fetch(openUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      })

      expect(res.status).toBe(202)
      expect(await res.text()).toBe('')
    })
  })

  test('remove', async () => {
    await remove()
    expect(await stackExists(authStack)).toBe(false)
  })
})
