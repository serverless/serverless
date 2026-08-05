/**
 * Live-AWS conformance for the top-level `mcp` property, exercised through both
 * packaging modes off one fixture directory (`./fixture`, two `-c` configs).
 *
 * A fixture directory cannot be driven by parallel jest workers — packaging
 * stages a single entry file into it and `.serverless/`/`node_modules/` are
 * shared — so this directory belongs to this file alone and everything here is
 * serialized. Ordered `test()` steps deploy, exercise and tear down each variant
 * in turn; the esbuild stack is removed before the classic one is deployed,
 * because both would otherwise exist side by side in the same directory. The
 * auth-chain suite runs the same way off its own `./fixture-auth` directory, so
 * the two files stay parallel-safe without a worker cap.
 *
 * The 14+ per-endpoint assertions come verbatim from the shared harness
 * (`./lib/client.mjs`), so a green run here means the same thing it means for
 * every hosting example. This suite only stands the deployments up, hands each
 * endpoint to the harness, and pins the three things a live suite can see that
 * a unit test cannot: the sealed elicitation round trip, the auto-provisioned
 * state key's length in the function logs, and one REST API fronting both
 * servers.
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
  DescribeStackResourcesCommand,
} from '@aws-sdk/client-cloudformation'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { createMcpChecks, createMcpClient, request } from './lib/client.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const REGION = 'us-east-1'
const fixtureDir = path.join(__dirname, 'fixture')

// The client capability that gates elicitation; the harness keeps its own copy
// private, so the state-echo step (which does not go through the fixed checks)
// declares it here.
const CAPS_ELICIT = { elicitation: { form: {} } }

const cfn = new CloudFormationClient({ region: REGION })
const stage = getTestStageName()
const originalEnv = process.env

// Every stack this file can create, so the safety-net teardown removes whatever
// survived a mid-file failure without depending on which step reached `remove`.
const esbuildStack = `sfc-mcp-${stage}`
const classicStack = `sfc-mcp-classic-${stage}`

const deploy = (configFile) =>
  runSfCore({
    jest,
    coreParams: {
      options: { stage, c: path.join(fixtureDir, configFile) },
      command: ['deploy'],
    },
  })

const remove = (configFile) =>
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

// The REST API base URL the api-gateway compiler publishes; MCP routes hang off
// it as `<base>/<server>/mcp`.
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

// STATE_KEY_LEN is logged once per cold start by the server module; the checks
// invoke `crm` enough to guarantee at least one. Log delivery lags the invoke,
// so this polls the log group until the line lands.
const readStateKeyLen = async (functionName) => {
  const { CloudWatchLogsClient, FilterLogEventsCommand } =
    await import('@aws-sdk/client-cloudwatch-logs')
  const logs = new CloudWatchLogsClient({ region: REGION })
  const logGroupName = `/aws/lambda/${functionName}`
  // CloudWatch ingestion is eventually consistent with no delivery bound; a
  // 120s budget was observed exhausted once on an otherwise-green run.
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    try {
      const { events } = await logs.send(
        new FilterLogEventsCommand({
          logGroupName,
          filterPattern: 'STATE_KEY_LEN',
        }),
      )
      const line = (events ?? [])
        .map((e) => e.message)
        .reverse()
        .find((m) => m.includes('STATE_KEY_LEN'))
      const match = line?.match(/STATE_KEY_LEN\s+(\d+)/)
      if (match) return Number(match[1])
    } catch (error) {
      if (!/ResourceNotFoundException/.test(error.name ?? '')) throw error
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(`STATE_KEY_LEN never appeared in ${logGroupName}`)
}

// The static shape of the crm check list — names and (numbered) titles only,
// enumerated from a placeholder endpoint that is never called. `test.each`
// needs the list at collection time, but the real client is built in the deploy
// step, so each test looks its run closure up by name in `crmChecks` below.
const crmCheckList = createMcpChecks({
  endpoint: 'https://placeholder.example/crm/mcp',
  longRunning: true,
}).map(({ name, title }) => ({ name, title }))

const classicCheckList = createMcpChecks({
  endpoint: 'https://placeholder.example/crm/mcp',
}).map(({ name, title }) => ({ name, title }))

describe('MCP servers live integration', () => {
  let crmChecks
  let classicChecks
  let crmUrl
  let docsUrl

  const runByName = (checks, name) => {
    if (!checks) throw new Error('deploy step did not complete')
    return checks.find((c) => c.name === name).run()
  }

  beforeAll(async () => {
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
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
    // Safety net: remove any stack a failed step left standing. `remove` prints
    // through the console spy, so restore mocks first, then swallow per-stack
    // errors the way the compose-dev teardown does.
    jest.restoreAllMocks()
    for (const [configFile, stackName] of [
      ['serverless.yml', esbuildStack],
      ['serverless-classic.yml', classicStack],
    ]) {
      try {
        if (await stackExists(stackName)) await remove(configFile)
      } catch (error) {
        log.error(`teardown of ${stackName} failed`, error)
      }
    }
    process.env = originalEnv
  })

  describe('esbuild — two servers (crm stateful, docs stateless)', () => {
    test('deploy', async () => {
      await deploy('serverless.yml')
      const serviceEndpoint = await serviceEndpointOf(esbuildStack)
      crmUrl = mcpUrl(serviceEndpoint, 'crm')
      docsUrl = mcpUrl(serviceEndpoint, 'docs')
      crmChecks = createMcpChecks({ endpoint: crmUrl, longRunning: true })
    })

    test.each(crmCheckList)('crm — $title', async ({ name }) => {
      await runByName(crmChecks, name)
    })

    test('crm — sealed elicitation state survives the round trip', async () => {
      const client = createMcpClient({ endpoint: crmUrl })
      const ask = await client.request({
        method: 'tools/call',
        params: { name: 'approve_refund', arguments: { orderId: 'o-1' } },
        name: 'approve_refund',
        capabilities: CAPS_ELICIT,
      })
      const sealedState = ask.json.result?.requestState
      expect(typeof sealedState).toBe('string')
      const accepted = await client.request({
        method: 'tools/call',
        params: {
          name: 'approve_refund',
          arguments: { orderId: 'o-1' },
          inputResponses: {
            confirm: { action: 'accept', content: { confirmed: true } },
          },
          requestState: sealedState,
        },
        name: 'approve_refund',
        capabilities: CAPS_ELICIT,
      })
      expect(accepted.json.result?.content?.[0]?.text).toBe(
        'refunded o-1 (state verified)',
      )
    })

    test('docs — second server answers tools/list off the same REST API', async () => {
      const r = await request({ endpoint: docsUrl }, { method: 'tools/list' })
      expect(r.status).toBe(200)
      const names = (r.json.result?.tools ?? []).map((t) => t.name).sort()
      expect(names).toEqual(['add', 'approve_refund', 'slow_report'])
    })

    test('both servers share one REST API', async () => {
      expect(new URL(crmUrl).host).toBe(new URL(docsUrl).host)
      const { StackResources } = await cfn.send(
        new DescribeStackResourcesCommand({ StackName: esbuildStack }),
      )
      const restApis = (StackResources ?? []).filter(
        (r) => r.ResourceType === 'AWS::ApiGateway::RestApi',
      )
      expect(restApis).toHaveLength(1)
    })

    test('crm — auto-provisioned state key is 44 chars (STATE_KEY_LEN)', async () => {
      const len = await readStateKeyLen(`sfc-mcp-${stage}-crm`)
      expect(len).toBe(44)
    })

    // The vendored harness above pins the wire byte-for-byte; this step proves
    // a real client — the SDK's own — interoperates with the same deployment.
    // It exercises what the harness deliberately cannot: the client's version
    // negotiation. The client's DEFAULT mode negotiates a legacy revision and
    // is served through the SDK's stateless legacy fallback — the path every
    // not-yet-opted-in real client rides.
    test('crm — official SDK client interop, default (legacy) mode', async () => {
      const client = new Client({ name: 'sfc-mcp-interop', version: '1.0.0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(crmUrl)))
      try {
        const { tools } = await client.listTools()
        expect(tools.map((t) => t.name).sort()).toEqual([
          'add',
          'approve_refund',
          'slow_report',
        ])
        const result = await client.callTool({
          name: 'add',
          arguments: { a: 2, b: 40 },
        })
        expect(result.structuredContent).toEqual({ sum: 42 })
      } finally {
        await client.close()
      }
    })

    // The same client opted into the 2026-07-28 revision — the documented
    // `versionNegotiation` option — must go modern against this hosting and
    // complete the elicitation flow legacy mode cannot reach: the tool returns
    // input_required, the registered elicitation/create handler answers
    // locally, and the client retries with the sealed requestState, which the
    // server verifies against the provisioned key.
    test('crm — official SDK client interop, modern opt-in (elicitation + sealed state)', async () => {
      const client = new Client(
        { name: 'sfc-mcp-interop-modern', version: '1.0.0' },
        {
          capabilities: { elicitation: { form: {} } },
          versionNegotiation: { mode: 'auto' },
        },
      )
      client.setRequestHandler('elicitation/create', async () => ({
        action: 'accept',
        content: { confirmed: true },
      }))
      await client.connect(new StreamableHTTPClientTransport(new URL(crmUrl)))
      try {
        expect(client.getProtocolEra()).toBe('modern')
        const refund = await client.callTool({
          name: 'approve_refund',
          arguments: { orderId: 'o-42' },
        })
        expect(refund.content?.[0]?.text).toBe('refunded o-42 (state verified)')
      } finally {
        await client.close()
      }

      // The decline path through the same real client: a server that misses
      // the `inputResponse` action check re-asks on decline, which this
      // auto-fulfilling client turns into an infinite prompt loop (observed
      // live with Claude Code before the fixture carried the check).
      const decliner = new Client(
        { name: 'sfc-mcp-interop-decline', version: '1.0.0' },
        {
          capabilities: { elicitation: { form: {} } },
          versionNegotiation: { mode: 'auto' },
        },
      )
      decliner.setRequestHandler('elicitation/create', async () => ({
        action: 'decline',
      }))
      await decliner.connect(new StreamableHTTPClientTransport(new URL(crmUrl)))
      try {
        const refused = await decliner.callTool({
          name: 'approve_refund',
          arguments: { orderId: 'o-43' },
        })
        expect(refused.content?.[0]?.text).toBe('refund cancelled')
      } finally {
        await decliner.close()
      }
    })

    test('remove', async () => {
      await remove('serverless.yml')
      expect(await stackExists(esbuildStack)).toBe(false)
    })
  })

  describe('classic — single stateful server, no bundler', () => {
    test('deploy', async () => {
      await deploy('serverless-classic.yml')
      const serviceEndpoint = await serviceEndpointOf(classicStack)
      classicChecks = createMcpChecks({
        endpoint: mcpUrl(serviceEndpoint, 'crm'),
      })
    })

    test.each(classicCheckList)('crm — $title', async ({ name }) => {
      await runByName(classicChecks, name)
    })

    test('remove', async () => {
      await remove('serverless-classic.yml')
      expect(await stackExists(classicStack)).toBe(false)
    })
  })

  describe('package-time validation (no deploy)', () => {
    const badRuntime = path.join(fixtureDir, '_it-bad-runtime.yml')
    const collision = path.join(fixtureDir, '_it-collision.yml')
    const badAuth = path.join(fixtureDir, '_it-bad-auth.yml')

    const pkg = (configFilePath, expectError) =>
      runSfCore({
        jest,
        expectError,
        coreParams: {
          options: { stage, c: configFilePath },
          command: ['package'],
        },
      })

    beforeAll(async () => {
      const { writeFile } = await import('fs/promises')
      await writeFile(
        badRuntime,
        [
          'service: sfc-mcp-it-badruntime',
          "frameworkVersion: '*'",
          'provider:',
          '  name: aws',
          '  runtime: nodejs18.x',
          'build:',
          '  esbuild: false',
          'mcp:',
          '  servers:',
          '    crm:',
          '      server: src/server.mjs',
          '',
        ].join('\n'),
      )
      await writeFile(
        collision,
        [
          'service: sfc-mcp-it-collision',
          "frameworkVersion: '*'",
          'provider:',
          '  name: aws',
          '  runtime: nodejs22.x',
          'build:',
          '  esbuild: false',
          'functions:',
          '  crm:',
          '    handler: src/server.default',
          'mcp:',
          '  servers:',
          '    crm:',
          '      server: src/server.mjs',
          '',
        ].join('\n'),
      )
      await writeFile(
        badAuth,
        [
          'service: sfc-mcp-it-badauth',
          "frameworkVersion: '*'",
          'provider:',
          '  name: aws',
          '  runtime: nodejs22.x',
          'build: esbuild',
          'mcp:',
          '  servers:',
          '    secured:',
          '      server: src/server.mjs',
          '      auth:',
          '        issuer: https://example.com',
          '',
        ].join('\n'),
      )
    })

    afterAll(async () => {
      const { rm } = await import('fs/promises')
      await Promise.all(
        [badRuntime, collision, badAuth].map((f) => rm(f, { force: true })),
      )
    })

    test('nodejs18 runtime is rejected (MCP_UNSUPPORTED_NODE_RUNTIME)', async () => {
      await expect(pkg(badRuntime, true)).rejects.toMatchObject({
        code: 'MCP_UNSUPPORTED_NODE_RUNTIME',
      })
    })

    test('server/function name collision is rejected (MCP_FUNCTION_NAME_COLLISION)', async () => {
      await expect(pkg(collision, true)).rejects.toMatchObject({
        code: 'MCP_FUNCTION_NAME_COLLISION',
      })
    })

    test('auth without audiences fails schema validation', async () => {
      // The schema error is printed to the CLI output rather than thrown, so
      // capture both streams and assert the message names the missing property.
      let out = ''
      const w = jest.spyOn(process.stdout, 'write').mockImplementation((c) => {
        out += c
        return true
      })
      const e = jest.spyOn(process.stderr, 'write').mockImplementation((c) => {
        out += c
        return true
      })
      try {
        await pkg(badAuth, false)
      } finally {
        w.mockRestore()
        e.mockRestore()
      }
      expect(out).toMatch(/must have required property 'audiences'/)
    })
  })
})
