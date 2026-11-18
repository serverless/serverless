import path from 'path'
import url from 'url'
import { stripVTControlCharacters } from 'util'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import {
  GetDurableExecutionCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { TEST_REGION } from '../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'sfc-durable'

// Every invoke passes a payload: without --data or --path the command reads
// stdin, which a Jest worker never closes.
const PAYLOAD = '{"source":"test"}'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs fn while copying what is written to stdout and to stderr, and returns
 * each without colour codes. The command prints its result on stdout and its
 * notices on stderr; the output still reaches the test log.
 */
const captureOutput = async (fn) => {
  const captured = { stdout: [], stderr: [] }
  const spies = Object.keys(captured).map((name) => {
    const stream = process[name]
    const write = stream.write.bind(stream)
    return jest.spyOn(stream, 'write').mockImplementation((chunk, ...rest) => {
      captured[name].push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return write(chunk, ...rest)
    })
  })
  try {
    await fn()
  } finally {
    spies.forEach((spy) => spy.mockRestore())
  }
  return {
    stdout: stripVTControlCharacters(captured.stdout.join('')),
    stderr: stripVTControlCharacters(captured.stderr.join('')),
  }
}

describe('Serverless Framework Service - Durable Functions', () => {
  const fixtureDir = path.join(__dirname, 'fixture')
  const configFilePath = path.join(fixtureDir, 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`
  const originalEnv = process.env

  const cfnClient = new CloudFormationClient({ region: TEST_REGION })
  const lambdaClient = new LambdaClient({ region: TEST_REGION })

  const run = (command, options = {}, params = {}) =>
    runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, ...options },
        command,
      },
      jest,
      ...params,
    })

  const stackExists = async () => {
    try {
      const { Stacks } = await cfnClient.send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      return Stacks?.[0]?.StackStatus !== 'DELETE_COMPLETE'
    } catch (error) {
      if (/does not exist/.test(error?.message ?? '')) return false
      throw error
    }
  }

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }

    await run(['deploy'])
  }, 900000)

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    // Remove the stack whatever the tests did, and fail the run when it
    // cannot be removed, so a leak never passes as green.
    jest.restoreAllMocks()
    let failure
    try {
      if (await stackExists()) {
        await run(['remove'], {}, { expectError: true })
        if (await stackExists()) throw new Error('the stack still exists')
      }
    } catch (error) {
      failure = new Error(`Teardown of ${stackName} failed: ${error.message}`)
    }
    process.env = originalEnv
    if (failure) throw failure
  }, 900000)

  test('starts a durable execution and prints its ARN as JSON', async () => {
    const { stdout } = await captureOutput(() =>
      run(['invoke'], {
        function: 'long',
        type: 'Event',
        json: true,
        data: PAYLOAD,
      }),
    )

    // With --json, stdout holds the JSON result and nothing else.
    const result = JSON.parse(stdout)
    expect(result.qualifier).toBe('durable')
    expect(result.durableExecutionArn).toMatch(
      /:function:sfc-durable-.*-long:\d+\/durable-execution\//,
    )

    // The execution waits two seconds between its steps, then returns. A
    // just-started execution can be briefly unknown to GetDurableExecution;
    // any other error ends the test.
    const arn = result.durableExecutionArn
    const deadline = Date.now() + 60000
    let status
    while (true) {
      try {
        const execution = await lambdaClient.send(
          new GetDurableExecutionCommand({ DurableExecutionArn: arn }),
        )
        status = execution.Status
      } catch (error) {
        if (error?.name !== 'ResourceNotFoundException') throw error
      }
      if (status && status !== 'RUNNING') break
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await sleep(Math.min(3000, remaining))
    }
    if (status !== 'SUCCEEDED') {
      throw new Error(
        `Durable execution ${arn} has status ${status ?? 'unknown (not found)'}; expected SUCCEEDED within 60 s`,
      )
    }
  }, 300000)

  test('returns the result of a short durable function synchronously', async () => {
    const { stdout, stderr } = await captureOutput(() =>
      run(['invoke'], { function: 'short', data: PAYLOAD }),
    )

    expect(stdout).toContain('"ok": true')
    expect(stderr).toContain('Durable execution:')
  }, 300000)

  test('stops a synchronous invoke above 15 minutes', async () => {
    await expect(
      run(
        ['invoke'],
        { function: 'long', data: PAYLOAD },
        { expectError: true },
      ),
    ).rejects.toMatchObject({ code: 'INVOKE_DURABLE_SYNC_TIMEOUT' })
  }, 300000)
})
