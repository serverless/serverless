/**
 * Live-AWS proof that `serverless dev` serves MCP servers: the one thing the
 * unit suites around this feature cannot show, because it only exists once a
 * real REST API fronts a real function whose handler the dev session rewrote.
 *
 * The run is one arc, in ordered `test()` steps off its own fixture directory
 * (`./fixture-dev`, which the session mutates for as long as it lives):
 *
 *   1. `serverless dev` deploys the service and connects the tunnel;
 *   2. `tools/list` and `tools/call` answer through the deployed endpoint — the
 *      request travels API Gateway → the streamified shim → IoT → this machine;
 *   3. an edit to the fixture's `MARKER` line is served WITHOUT a redeploy,
 *      which is what makes the previous step's answer local rather than
 *      packaged;
 *   4. the session is stopped and a plain `serverless deploy` puts the packaged
 *      server back in front of the same endpoint.
 *
 * The MARKER is restored to `v1` before that last deploy, so the restored
 * deployment answers `v1` where the last dev-served answer was `v2`: the two
 * are distinguishable, and the fixture is left git-clean either way.
 *
 * The shared conformance harness (`./lib/client.mjs`) is used for its low-level
 * client only, not for `createMcpChecks`: that fixed list asserts the canonical
 * fixture's tools, and this fixture deliberately carries one `echo` tool
 * instead (see `./fixture-dev/README.md`).
 *
 * To run this suite alone:
 *
 *   TEST_STAGE=… npm run test:mcp -w @serverlessinc/sf-core -- \
 *     --testPathIgnorePatterns='mcp-auth|/mcp\.test\.js'
 *
 * Narrowing by path does NOT work, in either spelling: `test:mcp` already passes
 * the positional `tests/integration/mcp/`, and jest UNIONS that with any further
 * positional and with `--testPathPatterns`, so both
 * `-- tests/integration/mcp/mcp-dev.test.js` and `-- --testPathPatterns=mcp-dev`
 * run the whole directory - every live suite, deploying every fixture. Only the
 * ignore list subtracts (repeating the flag appends to it).
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
import fs from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import url from 'url'
import { spawn } from 'child_process'
import spawnExt from 'child-process-ext/spawn.js'
import { setGlobalRendererSettings, log } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { createMcpClient } from './lib/client.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const REGION = 'us-east-1'
const fixtureDir = path.join(__dirname, 'fixture-dev')
const serverModule = path.join(fixtureDir, 'src', 'server.mjs')
const configFile = path.join(fixtureDir, 'serverless.yml')
const serverlessPackageDir = path.join(__dirname, '../../../../serverless')
// `dev` never returns, so it cannot be hosted by the in-process runSfCore
// helper — this suite spawns the CLI the same way `compose-dev.test.js` does.
const SF_CORE_BIN = path.resolve(__dirname, '../../../bin/sf-core.js')

const cfn = new CloudFormationClient({ region: REGION })
const stage = getTestStageName()
const stackName = `sfc-mcp-dev-${stage}`
const originalEnv = { ...process.env }

const stackExists = async () => {
  try {
    await cfn.send(new DescribeStacksCommand({ StackName: stackName }))
    return true
  } catch (error) {
    if (/does not exist/.test(error.message)) return false
    throw error
  }
}

// The REST API base URL the api-gateway compiler publishes; MCP routes hang off
// it as `<base>/<server>/mcp`. Unchanged by the dev session — dev swaps the
// function's handler, not the API.
const mcpEndpoint = async () => {
  const { Stacks } = await cfn.send(
    new DescribeStacksCommand({ StackName: stackName }),
  )
  const endpoint = (Stacks?.[0]?.Outputs ?? []).find(
    (o) => o.OutputKey === 'ServiceEndpoint',
  )?.OutputValue
  if (!endpoint) throw new Error(`no ServiceEndpoint output on ${stackName}`)
  return `${endpoint}/crm/mcp`
}

// The returned promise rejects on a non-zero exit or a spawn error, naming the
// script in its message; inherited stdio keeps the build's own output in the
// log, where a failing run needs it.
const buildProduct = (script) =>
  spawnExt('npm', ['run', script], {
    cwd: serverlessPackageDir,
    stdio: 'inherit',
  })

// The MARKER line is a literal the fixture documents as rewritable; anything
// else in that file is off limits to this suite.
const setMarker = async (value) => {
  const source = await readFile(serverModule, 'utf8')
  const rewritten = source.replace(
    /^const MARKER = '[^']*'$/m,
    `const MARKER = '${value}'`,
  )
  if (!new RegExp(`^const MARKER = '${value}'$`, 'm').test(rewritten)) {
    throw new Error(`no rewritable MARKER line in ${serverModule}`)
  }
  await writeFile(serverModule, rewritten)
}

// A stale build product: the server module as esbuild would have emitted it
// under `outExtension: .mjs`, carrying a MARKER no live source ever has. It
// imports its dependencies through the fixture's own node_modules (resolution
// walks up from the build dir), so if anything loads it, it answers.
const planted = (() => {
  const file = path.join(
    fixtureDir,
    '.serverless',
    'build',
    'src',
    'server.mjs',
  )
  return {
    file,
    write: async () => {
      const source = await readFile(serverModule, 'utf8')
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await writeFile(
        file,
        source.replace(/^const MARKER = '[^']*'$/m, "const MARKER = 'stale'"),
      )
    },
    remove: () => fs.promises.rm(file, { force: true }),
  }
})()

/**
 * Retries `attempt` until it returns a value passing `until`, swallowing both
 * thrown errors and unsatisfying answers.
 *
 * Two live behaviors need this and neither is a defect: a just-deployed API
 * Gateway stage answers 403/502 for up to about a minute while the change
 * propagates, and an edit reaches the dev build through a chokidar watch with a
 * few seconds of debounce.
 */
const pollUntil = async ({ attempt, until, timeoutMs, label }) => {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    try {
      last = await attempt()
      if (until(last)) return last
    } catch (error) {
      last = error
    }
    if (Date.now() >= deadline) {
      const detail =
        last instanceof Error
          ? last.message
          : JSON.stringify(last)?.slice(0, 500)
      throw new Error(`${label} never succeeded in ${timeoutMs}ms: ${detail}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
}

describe('MCP servers under dev mode — live integration', () => {
  let devProcess
  let devOutput = ''
  let endpoint

  const callEcho = async (message) => {
    const client = createMcpClient({ endpoint })
    const response = await client.request({
      method: 'tools/call',
      params: { name: 'echo', arguments: { message } },
      name: 'echo',
    })
    return {
      status: response.status,
      text: response.json?.result?.content?.[0]?.text,
    }
  }

  afterEach(() => jest.restoreAllMocks())

  beforeAll(async () => {
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutate process.env in place. Reassigning it (process.env = {...}) does
    // not reliably propagate to the native environment child processes inherit
    // — and this suite's whole subject is a child process.
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    if (process.env.SERVERLESS_ACCESS_KEY_DEV) {
      process.env.SERVERLESS_ACCESS_KEY = process.env.SERVERLESS_ACCESS_KEY_DEV
    }

    // Both build products are gitignored, and a run without them fails deep:
    // the dev session aborts with BUILD_SHIM_FAILED, and a local MCP invoke
    // finds no entry to run the user's module through. So a bare checkout has
    // to be able to build them from here.
    //
    // Present is left ALONE, though - never rebuilt. These files live in the
    // shared source tree, not in this suite's fixture directory, and
    // `test:mcp` runs with `--maxWorkers=2`: a sibling suite is executing in
    // the other worker, and packaging copies `entry/dist/entry.mjs` into its
    // artifact (`.../mcp/lib/packaging.js`). esbuild writes its outfile
    // non-atomically, so rebuilding underneath that copy can stage a truncated
    // bundle into another suite's zip - a deploy that fails with nothing in it
    // pointing back here. CI has already built both before jest starts
    // (`.github/workflows/ci-mcp.yml`), which makes the rebuild pure downside
    // there.
    //
    // Rebuilding after a source change is therefore the caller's job, the same
    // way it is for every other suite that consumes these bundles.
    for (const [product, script] of [
      [
        path.join(serverlessPackageDir, 'lib/plugins/aws/dev/shim.min.js'),
        'build:devmode:shim',
      ],
      [
        path.join(
          serverlessPackageDir,
          'lib/plugins/aws/mcp/entry/dist/entry.mjs',
        ),
        'build:mcp:entry',
      ],
    ]) {
      if (fs.existsSync(product)) continue
      await buildProduct(script)
      if (!fs.existsSync(product)) throw new Error(`not built: ${product}`)
    }

    // `install`, not `ci`: the fixture is committed without a full lockfile
    // tree, matching the sibling fixtures' precedent. Awaited directly: the
    // promise rejects on a non-zero exit or a spawn error, so a failed install
    // fails this hook before anything deploys. Inherited stdio keeps npm's own
    // output in the log, where a failing run needs it.
    await spawnExt('npm', ['install'], { cwd: fixtureDir, stdio: 'inherit' })
  }, 600000)

  afterAll(async () => {
    // Order matters: the session holds the deployed handler pointed at this
    // machine, so it goes first, then the stack, then the fixture edit.
    if (devProcess && devProcess.exitCode === null) {
      devProcess.kill('SIGINT')
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            devProcess.kill('SIGKILL')
          } catch {
            // already gone
          }
          resolve()
        }, 15000)
        devProcess.on('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    // `remove` prints through the console spy, so restore mocks first, then
    // swallow the error the way the sibling suite's teardown does.
    jest.restoreAllMocks()
    try {
      if (await stackExists()) {
        await runSfCore({
          jest,
          coreParams: {
            options: { stage, c: configFile },
            command: ['remove'],
          },
        })
      }
    } catch (error) {
      log.error(`teardown of ${stackName} failed`, error)
    }
    try {
      await setMarker('v1')
    } catch (error) {
      log.error('restoring the fixture MARKER failed', error)
    }
    await planted.remove()
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
  }, 600000)

  test('deploys the service and starts a dev session', async () => {
    devProcess = spawn(
      process.execPath,
      [SF_CORE_BIN, 'dev', '--stage', stage],
      {
        cwd: fixtureDir,
        env: { ...process.env },
        // No TTY, so the dev-mode spinner stays still instead of flooding output.
        stdio: 'pipe',
      },
    )

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`dev did not connect. Output:\n${devOutput}`)),
        540000,
      )
      const settle = (fn, value) => {
        clearTimeout(timer)
        fn(value)
      }
      const onData = (chunk) => {
        devOutput += chunk.toString()
        if (/Connected/.test(devOutput)) return settle(resolve)
        // Only until the session is up: a failed deploy otherwise burns the
        // whole nine-minute budget before saying why.
        const failure = devOutput.match(/✖.*|^.*\bError:.*$/m)
        if (failure) {
          settle(
            reject,
            new Error(`dev failed: ${failure[0]}\nOutput:\n${devOutput}`),
          )
        }
      }
      devProcess.stdout.on('data', onData)
      devProcess.stderr.on('data', onData)
      devProcess.on('exit', (code) =>
        settle(
          reject,
          new Error(`dev exited early (${code}). Output:\n${devOutput}`),
        ),
      )
      devProcess.on('error', (error) =>
        settle(
          reject,
          new Error(`dev failed to spawn: ${error.message}\n${devOutput}`),
        ),
      )
    })

    // Planted AFTER the session's own initial build (the deploy that precedes
    // it empties `.serverless/`) and BEFORE any assertion in this step, so an
    // unrelated banner regression cannot skip the plant: a `.mjs` next to the
    // fresh `.js`, the shape an earlier `outExtension` build leaves behind. Dev
    // mode never runs the packaging rewrite that names the emitted file, so
    // without the dev plugin naming it itself the entry probes for a
    // runtime-extension sibling and this copy - which answers `stale:hello` -
    // would win. The next step proves the emitted file is the one that answers.
    await planted.write()

    expect(await stackExists()).toBe(true)
    endpoint = await mcpEndpoint()
    // The endpoint block is printed alongside the connection banner; a dev
    // session over an MCP service has to name the MCP route, not just the
    // function.
    // The same `mcp:` section `deploy` prints, contributed by the mcp plugin.
    expect(devOutput).toMatch(/^mcp: crm → https:\/\//m)
  })

  test('serves tools/list and tools/call from this machine', async () => {
    const listed = await pollUntil({
      label: 'tools/list through the dev session',
      timeoutMs: 180000,
      attempt: () =>
        createMcpClient({ endpoint }).request({ method: 'tools/list' }),
      until: (r) => r.status === 200 && Array.isArray(r.json?.result?.tools),
    })
    expect(listed.json.result.tools.map((t) => t.name)).toEqual(['echo'])

    // The stale sibling has to be on disk while this call is answered, or
    // `v1:hello` proves nothing about which file the entry chose.
    expect(fs.existsSync(planted.file)).toBe(true)
    const called = await callEcho('hello')
    expect(fs.existsSync(planted.file)).toBe(true)
    expect(called.status).toBe(200)
    expect(called.text).toBe('v1:hello')
  })

  test('picks up a local edit without a redeploy', async () => {
    await setMarker('v2')
    const echoed = await pollUntil({
      label: 'the edited MARKER reaching the dev session',
      timeoutMs: 180000,
      attempt: () => callEcho('hello'),
      until: (r) => r.text === 'v2:hello',
    })
    expect(echoed.text).toBe('v2:hello')
    // Nothing was deployed in between: the packaged function still carries the
    // shim the session installed, and the only new code is on this machine.
    expect(devProcess.exitCode).toBeNull()
  })

  test('a plain deploy puts the packaged server back in front of the endpoint', async () => {
    devProcess.kill('SIGINT')
    const exited = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        devProcess.kill('SIGKILL')
        resolve(false)
      }, 60000)
      devProcess.on('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
    // A session that ignored SIGINT would keep answering from this machine and
    // the assertions below would prove nothing about the deployment.
    expect(exited).toBe(true)

    // Restored BEFORE the deploy, so the packaged answer (`v1`) differs from
    // the last dev-served one (`v2`) and this step cannot pass on a stale
    // local process still answering.
    await setMarker('v1')
    await runSfCore({
      jest,
      coreParams: { options: { stage, c: configFile }, command: ['deploy'] },
    })

    const listed = await pollUntil({
      label: 'tools/list after the restore deploy',
      timeoutMs: 180000,
      attempt: () =>
        createMcpClient({ endpoint }).request({ method: 'tools/list' }),
      until: (r) => r.status === 200 && Array.isArray(r.json?.result?.tools),
    })
    expect(listed.json.result.tools.map((t) => t.name)).toEqual(['echo'])

    const called = await pollUntil({
      label: 'the packaged MARKER answering after the restore deploy',
      timeoutMs: 180000,
      attempt: () => callEcho('back'),
      until: (r) => r.text === 'v1:back',
    })
    expect(called.text).toBe('v1:back')
  })

  test('remove', async () => {
    await runSfCore({
      jest,
      coreParams: { options: { stage, c: configFile }, command: ['remove'] },
    })
    expect(await stackExists()).toBe(false)
  })
})
