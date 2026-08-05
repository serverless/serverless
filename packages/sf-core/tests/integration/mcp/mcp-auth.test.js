/**
 * Live-AWS auth-chain conformance for the top-level `mcp` property's `auth`
 * block, exercised against a real OIDC issuer (a predeployed Cognito user pool)
 * off this suite's own fixture directory (`./fixture-auth`).
 *
 * That directory is private to this file on purpose: packaging stages an entry
 * file into the service directory and `.serverless/`/`node_modules/` are shared
 * state, while jest parallelizes test FILES with no worker cap — so sharing one
 * directory with `mcp.test.js` would be a race the moment both files run. One
 * directory per file removes it by construction and keeps both suites free to
 * run in parallel with the rest of the fleet (`./fixture-auth/README.md`).
 *
 * The issuer is not knowable at authoring time, so it is discovered at runtime
 * from the Cognito prerequisite in SSM
 * (`tests/integration/mcp-cognito-prerequisite/template.yml`, documented in
 * TESTING.md). When that prerequisite is absent the whole suite skips with an
 * explanatory log rather than hard-failing an account that lacks it — but a read
 * that FAILS (denied, throttled, expired credentials, network) fails the file
 * loudly instead of skipping, since none of those is an opted-out account.
 *
 * With the prerequisite present, `beforeAll` injects the issuer + audience into
 * the environment the fixture reads (`MCP_TEST_AUTH_ISSUER` /
 * `MCP_TEST_AUTH_AUDIENCE`) and mints two M2M tokens: client A (authorized —
 * its id is the audience) and client B (wrong client — same issuer, different
 * id). The deploy step then hands the endpoint plus both tokens to the shared
 * harness (`./lib/client.mjs`), whose list under a bearer token is the 12 base
 * checks (run WITH client A's token, so they must pass) plus three auth checks:
 * `unauthenticated401`, `discoveryRootProbe403`, and `wrongClient401` (client
 * B's token → 401, exercising the aud-else-client_id fallback). One extra step
 * pins the stage-aware `resource_metadata` value the 401 challenge advertises.
 *
 * Serialized `test()` steps, `npm install` (not `ci`) in `beforeAll`, and a
 * safety-net teardown of ONLY the auth fixture stack — the Cognito prerequisite
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
import spawnExt from 'child-process-ext/spawn.js'
import { setGlobalRendererSettings, log } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { createMcpChecks, createMcpClient } from './lib/client.mjs'
import { readCognitoPrerequisite, DEFAULT_PREFIX } from './lib/cognito.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const REGION = 'us-east-1'
const fixtureDir = path.join(__dirname, 'fixture-auth')
const configFile = 'serverless-auth.yml'
const SERVER = 'secured'

const cfn = new CloudFormationClient({ region: REGION })
const stage = getTestStageName()
const originalEnv = process.env

// Service name in serverless-auth.yml is `sfc-mcp-auth`.
const authStack = `sfc-mcp-auth-${stage}`

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
    `[mcp-auth] Cognito prerequisite not found under ${DEFAULT_PREFIX} in ${REGION} — skipping the auth-chain suite. Deploy tests/integration/mcp-cognito-prerequisite/template.yml once per account (see TESTING.md).`,
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

// Static shape of the check list — names and numbered titles only — enumerated
// from a placeholder endpoint with both token slots filled so the auth checks
// are present. `test.each` needs this at collection time; the real client is
// built in the deploy step and looked up by name.
const authCheckList = createMcpChecks({
  endpoint: 'https://placeholder.example/secured/mcp',
  bearerToken: 'placeholder',
  wrongClientToken: 'placeholder',
}).map(({ name, title }) => ({ name, title }))

describeAuth('MCP servers live auth-chain integration', () => {
  let authChecks
  let serviceEndpoint
  let securedUrl
  let tokenA
  let tokenB

  const runByName = (name) => {
    if (!authChecks) throw new Error('deploy step did not complete')
    return authChecks.find((c) => c.name === name).run()
  }

  beforeAll(async () => {
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mint before the env swap so the token endpoint's own resolution is not
    // disturbed; tokens live an hour, well past a full run.
    tokenA = await cognito.mintClientA()
    tokenB = await cognito.mintClientB()
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
      // The fixture reads these with no defaults; a missing value fails config
      // resolution rather than deploying a bogus issuer.
      MCP_TEST_AUTH_ISSUER: cognito.issuer,
      MCP_TEST_AUTH_AUDIENCE: cognito.audience,
    }
    // `install`, not `ci`: the fixture is committed without a full lockfile
    // tree, matching the esbuild-fixture precedent.
    await new Promise((resolve, reject) => {
      const p = spawnExt('npm', ['install'], { cwd: fixtureDir })
      p.child.on('error', reject)
      p.child.on('close', resolve)
    })
  }, 600000)

  afterEach(() => jest.restoreAllMocks())

  afterAll(async () => {
    // Safety net: remove the auth fixture stack if a failed step left it
    // standing. The Cognito prerequisite is NOT touched — it persists.
    jest.restoreAllMocks()
    try {
      if (await stackExists(authStack)) await remove()
    } catch (error) {
      log.error(`teardown of ${authStack} failed`, error)
    }
    process.env = originalEnv
  })

  test('deploy', async () => {
    await deploy()
    serviceEndpoint = await serviceEndpointOf(authStack)
    securedUrl = mcpUrl(serviceEndpoint, SERVER)
    authChecks = createMcpChecks({
      endpoint: securedUrl,
      bearerToken: tokenA,
      wrongClientToken: tokenB,
    })
  })

  // Base checks 1–12 run WITH client A's token, so they must pass; the three
  // auth checks (unauthenticated401, discoveryRootProbe403, wrongClient401) are
  // appended by the harness when both token slots are set.
  test.each(authCheckList)('secured — $title', async ({ name }) => {
    await runByName(name)
  })

  test('secured — 401 challenge advertises the stage-aware resource_metadata URL', async () => {
    const client = createMcpClient({
      endpoint: securedUrl,
      bearerToken: tokenA,
    })
    const r = await client.request({ method: 'tools/list', token: null })
    expect(r.status).toBe(401)
    const challenge =
      r.headers.get('x-amzn-remapped-www-authenticate') ??
      r.headers.get('www-authenticate')
    expect(challenge).toBeTruthy()
    const metadata = challenge.match(/resource_metadata="([^"]+)"/)?.[1]
    // The metadata URL keeps the stage prefix and inserts the RFC 9728 segment
    // ahead of the resource path (`<name>/mcp`), so it resolves to exactly
    // `<serviceEndpoint>/.well-known/oauth-protected-resource/secured/mcp`.
    expect(metadata).toBe(
      `${serviceEndpoint}/.well-known/oauth-protected-resource/${SERVER}/mcp`,
    )
  })

  test('remove', async () => {
    await remove()
    expect(await stackExists(authStack)).toBe(false)
  })
})
