/**
 * Live: an MCP server deployed with the `mcp` property, served from this machine by `serverless
 * dev`. Requests reach it the way they reach the deployed server (REST API, response streaming),
 * and the relay brings each invocation here; the shared conformance checks (`../mcp/lib/client.mjs`)
 * must pass exactly as they do against the deployed server, including a ~36s progress stream that
 * arrives incrementally.
 */
import path from 'path'
import url from 'url'
import { setTimeout as delay } from 'timers/promises'
import { jest } from '@jest/globals'
import spawnExt from 'child-process-ext/spawn.js'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import {
  assertDevModeLayersBuilt,
  cleanupDevModeAccountResources,
  deleteLogGroups,
  newDevModeTestSuffix,
  spawnSourceCli,
  sweepDevModePrefix,
  waitForOutput,
  withBridgeLogLines,
} from '../../utils/devMode.js'
import { createMcpChecks, request } from '../mcp/lib/client.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

jest.setTimeout(1_800_000)

describe('Dev Mode serves an MCP server from this machine (live)', () => {
  const region = 'us-east-1'
  const fixture = path.join(__dirname, 'fixture-mcp')
  const service = 'devmode-mcp'
  const stage = getTestStageName()
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite deletes
  // exactly what it created.
  const suffix = newDevModeTestSuffix()
  const functionPrefix = `${service}-${stage}-`
  // Where the relay puts payloads too large for one AWS IoT Core message, in the deployment bucket.
  const devModePrefix = `serverless-dev-mode/${service}/${stage}/`
  const cfn = new CloudFormationClient({ region })
  const originalEnv = { ...process.env }
  let originalCwd
  let session
  let crmUrl
  // Set just before the deploy: when beforeAll fails earlier, there is no stack to remove and no
  // log group to sweep.
  let deployAttempted = false

  const sls = (command) =>
    runSfCore({ coreParams: { options: { stage, region }, command }, jest })
  const running = (child) =>
    Boolean(child) && child.exitCode === null && child.signalCode === null
  /** Ctrl+C restores the functions; SIGKILL if that takes too long. */
  const stop = async (child) => {
    if (!running(child)) return child?.exited
    child.kill('SIGINT')
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    const exited = await child.exited
    clearTimeout(timer)
    return exited
  }
  // Prints the session's output when an assertion about it fails, before teardown removes the
  // stage.
  const withOutput = async (check) => {
    try {
      await check()
    } catch (error) {
      console.error(session?.output)
      throw error
    }
  }

  beforeAll(async () => {
    // Captured before anything that can throw, so afterAll never restores an undefined cwd.
    originalCwd = process.cwd()
    // The layer zips are gitignored build artifacts; dev cannot attach without them.
    assertDevModeLayersBuilt()
    process.chdir(fixture)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutated in place: child processes inherit the native environment, and a reassigned
    // process.env does not reliably reach it.
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
    process.env.SLS_DEV_TEST_SUFFIX = suffix
    // `install`, not `ci`, as the MCP suite installs its fixture. It rejects on a non-zero exit.
    await spawnExt('npm', ['install'], { cwd: fixture, stdio: 'inherit' })
    deployAttempted = true
    await sls(['deploy'])
    const { Stacks } = await cfn.send(
      new DescribeStacksCommand({ StackName: `${service}-${stage}` }),
    )
    const serviceEndpoint = (Stacks?.[0]?.Outputs ?? []).find(
      (output) => output.OutputKey === 'ServiceEndpoint',
    )?.OutputValue
    if (!serviceEndpoint) throw new Error('the stack has no ServiceEndpoint')
    crmUrl = `${serviceEndpoint}/crm/mcp`
    session = spawnSourceCli({
      args: ['dev', '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
    })
    await waitForOutput(session, /Dev Mode on · 1 of 1 function/)
    // A new broker role can take a few minutes before the function may use it, and a session's
    // first request may still be answered by the deployed code: send requests until one reaches
    // this machine.
    const since = Date.now()
    const until = since + 300_000
    while (!/→ λ crm/.test(session.output)) {
      if (Date.now() > until || !running(session)) {
        // With the bridge's last log lines: why the deployed code answered.
        throw await withBridgeLogLines(
          new Error(
            `no MCP request reached this machine within 300 s\n${session.output}`,
          ),
          { region, functionName: `${functionPrefix}crm`, since },
        )
      }
      // A new endpoint's name can take a moment to resolve; the loop's deadline bounds that too.
      await request({ endpoint: crmUrl }, { method: 'tools/list' }).catch(
        () => undefined,
      )
      if (!/→ λ crm/.test(session.output)) await delay(10_000)
    }
    // The request that reached this machine ends before the checks start.
    await waitForOutput(session, /← λ crm/, 60_000)
  })

  afterAll(async () => {
    const failures = []
    await stop(session)
    if (deployAttempted) {
      // remove restores leftover Dev Mode configuration first, then deletes the stack.
      await sls(['remove']).catch((error) =>
        failures.push(`remove: ${error.message}`),
      )
    }
    const left = await cleanupDevModeAccountResources({ region, suffix }).catch(
      (error) => [error.message],
    )
    if (left.length) failures.push(`left behind: ${left.join(', ')}`)
    if (deployAttempted) {
      const logGroups = await deleteLogGroups({ region, functionPrefix }).catch(
        (error) => [error.message],
      )
      if (logGroups.length) {
        failures.push(`log groups left behind: ${logGroups.join(', ')}`)
      }
      const objects = await sweepDevModePrefix({
        region,
        service,
        stage,
      }).catch((error) => [error.message])
      if (objects.length) {
        failures.push(
          `Dev Mode objects left under ${devModePrefix}: ${objects.join(', ')}`,
        )
      }
    }
    // Restored before the environment: later test files in this worker must not resolve this
    // fixture.
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    if (failures.length) {
      throw new Error(
        `Dev Mode MCP suite teardown (stage ${stage}, suffix ${suffix}) failed:\n${failures.join('\n')}`,
      )
    }
  })

  test('the MCP server answers every conformance check from this machine', async () => {
    await withOutput(async () => {
      for (const check of createMcpChecks({
        endpoint: crmUrl,
        longRunning: false,
      })) {
        await check.run()
      }
      // Logged by the server module when this machine's worker loaded it, after the entry put the
      // provisioned state key in its environment.
      expect(session.output).toMatch(/STATE_KEY_LEN 44/)
      expect(session.output).toMatch(/← λ crm/)
      expect(session.output).not.toMatch(/ran the deployed code/)
    })
  })

  test('a long tool call streams through the relay, not buffered', async () => {
    // The ~36s progress stream, then the check that its events arrived as they were sent (it
    // reads the stream's timing from the first check rather than calling again).
    const checks = createMcpChecks({ endpoint: crmUrl, longRunning: true })
    await withOutput(async () => {
      for (const name of ['longStream', 'antiBuffering']) {
        await checks.find((check) => check.name === name).run()
      }
    })
  })

  test('after Ctrl+C the deployed server answers again', async () => {
    const { code } = await stop(session)
    await withOutput(async () => {
      expect(code).toBe(0)
      expect(session.output).toMatch(/Dev Mode off · 1 function restored/)
    })
    const reply = await request({ endpoint: crmUrl }, { method: 'tools/list' })
    expect(reply.status).toBe(200)
    expect((reply.json.result?.tools ?? []).map((t) => t.name).sort()).toEqual([
      'add',
      'approve_refund',
      'slow_report',
    ])
  })
})
