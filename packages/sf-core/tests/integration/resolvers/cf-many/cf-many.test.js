import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

/**
 * Live check for the AWS variable resolvers' request de-duplication:
 * two source stacks with three outputs each, referenced many times from a
 * Compose project (two services) and from a single service, must cost
 * exactly two DescribeStacks calls per process — the only observable call
 * count is the resolvers' debug summary line.
 */
describe('Serverless Framework Service - Resolvers - cf per-stack de-duplication', () => {
  jest.setTimeout(900_000)

  const region = 'us-east-1'
  const fixture = (...parts) => path.join(__dirname, 'fixture', ...parts)
  const stage = getTestStageName()
  const lambdaClient = new LambdaClient({ region })
  const originalEnv = process.env
  const deployed = new Set()
  let stderr = []
  let stdout = []

  const summaryLines = () =>
    stderr
      .join('')
      .split('\n')
      .filter((line) => line.includes('core:resolver:aws:'))
      .map((line) => line.replace(/.*core:resolver:aws:\s*/, '').trim())

  // The CLI logger writes to stderr; `print` writes the resolved config to
  // stdout. Capture both so the assertions do not depend on which one the
  // renderer picks for a given line.
  const captureOutput = () => {
    stderr = []
    stdout = []
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk))
      return true
    })
  }

  const functionEnv = async (functionName) => {
    const { Configuration } = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )
    return Configuration.Environment.Variables
  }

  const isComposeConfig = (configPath) =>
    path.basename(configPath).startsWith('serverless-compose')

  // An `undefined` value in `extraOptions` drops that option instead of
  // passing it through: Compose forwards its own options to every service,
  // and the framework's CLI validation rejects an option that is present
  // with an undefined value ("Option \"region\" is of type \"undefined\"").
  // `expectError` is passed through to `runSfCore`: with the default `false` its
  // console spy throws `Should not receive error` on the first error line, which
  // would mask the real message. The teardown net wants the real errors instead.
  const run = async (
    configPath,
    command,
    extraOptions = {},
    { expectError = false } = {},
  ) => {
    const options = { stage, region, c: configPath, ...extraOptions }
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined) delete options[key]
    }
    return runSfCore({
      coreParams: { options, command, debug: true },
      jest,
      expectError,
    })
  }

  beforeAll(() => {
    setGlobalRendererSettings({ isInteractive: false })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(async () => {
    // Teardown net for anything a failed run left behind, through the same
    // `run` helper (and therefore the same option shape) the tests use.
    // It must never be silent: a failure here is the difference between a
    // clean account and orphaned stacks, so name the config and the error,
    // keep removing the rest, and then fail the run so a leak cannot pass
    // for a green suite.
    jest.restoreAllMocks()
    const failures = []
    for (const configPath of [...deployed].reverse()) {
      try {
        const { errorCount, errors } = await run(
          configPath,
          ['remove'],
          isComposeConfig(configPath) ? { region: undefined } : {},
          { expectError: true },
        )
        if (errorCount) {
          console.error(
            `Teardown of ${configPath} reported ${errorCount} error(s) — check for orphaned cfmany-* stacks:`,
            ...errors,
          )
          failures.push(
            `${configPath}: ${errorCount} error(s) — ${errors
              .map((error) => error?.message ?? error)
              .join('; ')}`,
          )
        }
      } catch (error) {
        console.error(
          `Teardown of ${configPath} failed — check for orphaned cfmany-* stacks: ${error?.message ?? error}`,
        )
        failures.push(`${configPath}: ${error?.message ?? error}`)
      }
    }
    process.env = originalEnv
    if (failures.length) {
      throw new Error(
        `Teardown left resources behind — check for orphaned cfmany-* stacks:\n${failures.join('\n')}`,
      )
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy source stacks', async () => {
    for (const name of ['source-a', 'source-b']) {
      const configPath = fixture(name, 'serverless.yml')
      deployed.add(configPath)
      await run(configPath, ['deploy'])
    }
  })

  test('Compose: two services share two DescribeStacks calls', async () => {
    const configPath = fixture('compose', 'serverless-compose.yml')
    deployed.add(configPath)
    captureOutput()
    await run(configPath, ['deploy'], { region: undefined })

    const cfLines = summaryLines().filter((line) => line.startsWith('cf: '))
    expect(cfLines.length).toBeGreaterThanOrEqual(1)
    // The stack count stays at 2 because `svc-1` and `svc-2` declare no
    // `dependsOn`: they resolve together at dispatch, before either deploy
    // finishes and invalidates the resolver cache. Give that fixture an
    // ordering and the second service re-reads both stacks, which moves that
    // number — a change in the count then, not a flake. The summary prints a
    // line only when its numbers moved since the last print, so two services
    // resolving concurrently may produce one `cf:` line or two; the last line
    // is the cumulative total.
    for (const line of cfLines) {
      expect(line).toMatch(
        /^cf: \d+ placeholders, 2 stacks, 2 DescribeStacks calls, \d+ throttled attempts$/,
      )
    }
    const lastPlaceholders = Number(
      cfLines.at(-1).match(/^cf: (\d+) placeholders/)[1],
    )
    expect(lastPlaceholders).toBeGreaterThanOrEqual(12)

    for (const functionName of [
      `cfmany-c1-${stage}-hello`,
      `cfmany-c2-${stage}-hello`,
    ]) {
      expect(await functionEnv(functionName)).toEqual({
        A1: 'a-one',
        A2: 'a-two',
        A3: 'a-three',
        B1: 'b-one',
        B2: 'b-two',
        B3: 'b-three',
      })
    }
  })

  // The counters are cumulative for the process. The compose deploy above
  // made 2 DescribeStacks calls, then invalidated the response cache after
  // each service run (a deploy may have changed the stacks), so this print
  // re-reads the two source stacks once more: 2 + 2 = 4 for the process, and
  // still exactly one call per stack for this run's nine placeholders.
  test('Single service: every cf form resolves; the two stacks are re-read once after the compose deploy', async () => {
    captureOutput()
    const { logs } = await run(fixture('consumer', 'serverless.yml'), ['print'])
    const printed = [...logs.map(String), ...stdout, ...stderr].join('\n')

    expect(printed).toContain('LEGACY_A1: a-one')
    expect(printed).toContain('LEGACY_B3: b-three')
    expect(printed).toContain('NESTED_A1: a-one')
    expect(printed).toContain('NESTED_B2: b-two')
    expect(printed).toContain('REGION_A1: a-one')
    expect(printed).toContain('REGION_B3: b-three')
    expect(printed).toContain('NAMED_A2: a-two')
    expect(printed).toContain('NAMED_B1: b-one')
    expect(printed).toContain('FALLBACK: fallback-value')

    const cfLine = summaryLines()
      .filter((line) => line.startsWith('cf: '))
      .at(-1)
    expect(cfLine).toMatch(
      /^cf: \d+ placeholders, 2 stacks, 4 DescribeStacks calls, \d+ throttled attempts$/,
    )
  })

  /**
   * Freshness, the other half of de-duplication: a stack read before a service
   * run that changes it must not be served from the cache to a service ordered
   * after that run. Its own compose project, deployed after the assertions
   * above: the module-level request counters are cumulative for the whole
   * process, so a third source stack referenced earlier would move the call
   * counts the de-duplication tests assert on.
   */
  const freshConfigPath = () => fixture('fresh', 'serverless-compose.yml')

  test('Compose freshness: first deploy seeds the marker', async () => {
    const configPath = freshConfigPath()
    deployed.add(configPath)
    await run(configPath, ['deploy'], { region: undefined })

    // No svc-1 stack existed when the compose file was resolved, so the
    // pre-read fell back; svc-2 reads the marker svc-1 just created.
    expect(await functionEnv(`cfmany-f1-${stage}-hello`)).toEqual({
      WARM: 'none',
    })
    expect(await functionEnv(`cfmany-f2-${stage}-hello`)).toEqual({
      MARKER: 'one',
      WARM: 'none',
    })
  })

  test('Compose freshness: a service ordered after a deploy reads the new output', async () => {
    const configPath = freshConfigPath()
    await run(configPath, ['deploy'], {
      region: undefined,
      param: ['marker=two'],
    })

    // The compose-level pre-read still reports the marker from the previous
    // deploy — it really did read the stack before svc-1 changed it.
    expect(await functionEnv(`cfmany-f1-${stage}-hello`)).toEqual({
      WARM: 'one',
    })
    // svc-2 resolved after svc-1's deploy finished, so its ${cf:} read must be
    // the new marker. 'one' here is the pre-fix behavior: the response cached
    // by the pre-read outliving the deploy that invalidated it.
    expect(await functionEnv(`cfmany-f2-${stage}-hello`)).toEqual({
      MARKER: 'two',
      WARM: 'one',
    })
  })

  test('Remove fresh compose', async () => {
    const configPath = freshConfigPath()
    await run(configPath, ['remove'], { region: undefined })
    deployed.delete(configPath)
  })

  test('Remove compose', async () => {
    const configPath = fixture('compose', 'serverless-compose.yml')
    await run(configPath, ['remove'], { region: undefined })
    deployed.delete(configPath)
  })

  test('Remove source stacks', async () => {
    for (const name of ['source-b', 'source-a']) {
      const configPath = fixture(name, 'serverless.yml')
      await run(configPath, ['remove'])
      deployed.delete(configPath)
    }
  })
})
