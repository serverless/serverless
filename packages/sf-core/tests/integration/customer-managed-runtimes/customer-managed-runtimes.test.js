/**
 * Functions on a Lambda customer-managed runtime: `runtime` set to a runtime
 * alias ARN, or to an intrinsic that returns one, deploys the function on that
 * runtime, `deploy function` keeps it
 * there, and `invoke local` explains that it cannot run one.
 *
 * The runtime is a persistent, per-account prerequisite
 * (`../customer-managed-runtime-prerequisite`, documented in TESTING.md), not
 * created per run: Lambda keeps a deleted runtime's name, and its slot in the
 * account's runtime quota, for up to 30 days. Its alias ARN is read from SSM.
 * When the parameter is absent the suite skips with a log; any other read
 * failure fails the file.
 */
import path from 'path'
import url from 'url'
import fs from 'fs/promises'
import { stripVTControlCharacters } from 'util'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import {
  GetFunctionConfigurationCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { TEST_REGION } from '../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'sfc-cmr'
const PARAMETER = '/cmr-integration-test/runtime-alias-arn'
const MARKER = 'sls-integration-runtime v1'

// Every invoke passes a payload: without --data or --path the command reads
// stdin, which a Jest worker never closes.
const PAYLOAD = '{}'

const readRuntimeAliasArn = async () => {
  try {
    const { Parameter } = await new SSMClient({ region: TEST_REGION }).send(
      new GetParameterCommand({ Name: PARAMETER }),
    )
    return Parameter.Value
  } catch (error) {
    if (error?.name === 'ParameterNotFound') return null
    throw error
  }
}

const runtimeAliasArn = await readRuntimeAliasArn()
const describeSuite = runtimeAliasArn ? describe : describe.skip
if (!runtimeAliasArn) {
  console.warn(
    `[customer-managed-runtimes] ${PARAMETER} not found in ${TEST_REGION}, skipping. Deploy tests/integration/customer-managed-runtime-prerequisite once per account (see TESTING.md).`,
  )
}

/**
 * Runs fn while copying what is written to stdout, and returns it without
 * colour codes. The output still reaches the test log.
 */
const captureStdout = async (fn) => {
  const captured = []
  const write = process.stdout.write.bind(process.stdout)
  const spy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk, ...rest) => {
      captured.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return write(chunk, ...rest)
    })
  try {
    await fn()
  } finally {
    spy.mockRestore()
  }
  return stripVTControlCharacters(captured.join(''))
}

describeSuite(
  'Serverless Framework Service - Customer-managed runtimes',
  () => {
    const fixtureDir = path.join(__dirname, 'fixture')
    const configFilePath = path.join(fixtureDir, 'serverless.yml')
    const handlerPath = path.join(fixtureDir, 'handler.mjs')
    const stage = getTestStageName()
    const stackName = `${SERVICE}-${stage}`
    const originalEnv = process.env
    let originalHandler

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

    const invokeMarker = async (functionName) =>
      JSON.parse(
        await captureStdout(() =>
          run(['invoke'], { function: functionName, data: PAYLOAD }),
        ),
      ).marker

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
      setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
      process.env = {
        ...originalEnv,
        SERVERLESS_PLATFORM_STAGE: 'dev',
        SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
        SERVERLESS_ACCESS_KEY: undefined,
        CMR_TEST_RUNTIME_ALIAS_ARN: runtimeAliasArn,
      }
      originalHandler = await fs.readFile(handlerPath, 'utf8')
      await run(['deploy'])
    }, 900000)

    afterEach(() => {
      jest.restoreAllMocks()
    })

    afterAll(async () => {
      // Remove the stack whatever the tests did, and fail the run when it
      // cannot be removed, so a leak never passes as green.
      jest.restoreAllMocks()
      // Each step runs whatever the other did, and every failure is reported
      const failures = []
      if (originalHandler !== undefined) {
        try {
          await fs.writeFile(handlerPath, originalHandler)
        } catch (error) {
          failures.push(`restoring ${handlerPath}: ${error.message}`)
        }
      }
      try {
        if (await stackExists()) {
          await run(['remove'], {}, { expectError: true })
          if (await stackExists()) throw new Error('the stack still exists')
        }
      } catch (error) {
        failures.push(`removing ${stackName}: ${error.message}`)
      }
      process.env = originalEnv
      if (failures.length) {
        throw new Error(`Teardown failed: ${failures.join('; ')}`)
      }
    }, 900000)

    test('deploys provider.runtime as a customer-managed runtime', async () => {
      const configuration = await lambdaClient.send(
        new GetFunctionConfigurationCommand({
          FunctionName: `${stackName}-marker`,
        }),
      )
      expect(configuration.Runtime).toBe('custom')
      expect(await invokeMarker('marker')).toBe(MARKER)
    }, 300000)

    test('deploys a CloudFormation intrinsic as a customer-managed runtime', async () => {
      const configuration = await lambdaClient.send(
        new GetFunctionConfigurationCommand({
          FunctionName: `${stackName}-intrinsic`,
        }),
      )
      expect(configuration.Runtime).toBe('custom')
      expect(await invokeMarker('intrinsic')).toBe(MARKER)
    }, 300000)

    test('keeps a function with its own runtime on that runtime', async () => {
      const configuration = await lambdaClient.send(
        new GetFunctionConfigurationCommand({
          FunctionName: `${stackName}-managed`,
        }),
      )
      expect(configuration.Runtime).toBe('nodejs24.x')
      expect(await invokeMarker('managed')).toBeNull()
    }, 300000)

    test('deploy function updates the code and keeps the runtime', async () => {
      await fs.writeFile(
        handlerPath,
        `${originalHandler}\n// deploy function\n`,
      )
      await run(['deploy', 'function'], { function: 'marker' })

      const configuration = await lambdaClient.send(
        new GetFunctionConfigurationCommand({
          FunctionName: `${stackName}-marker`,
        }),
      )
      expect(configuration.Runtime).toBe('custom')
      expect(await invokeMarker('marker')).toBe(MARKER)
    }, 300000)

    test('invoke local explains that the function cannot run locally', async () => {
      await expect(
        run(
          ['invoke', 'local'],
          { function: 'marker', data: PAYLOAD },
          { expectError: true },
        ),
      ).rejects.toMatchObject({
        code: 'INVOKE_LOCAL_CUSTOMER_MANAGED_RUNTIME_UNSUPPORTED',
      })
    }, 300000)
  },
)
