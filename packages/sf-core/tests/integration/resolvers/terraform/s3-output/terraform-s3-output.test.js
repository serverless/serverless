import path from 'path'
import url from 'url'
import { jest } from '@jest/globals'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Terraform Resolvers - S3 Output', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  let service, configFilePath

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    configFilePath = path.join(configFileDirPath, 'serverless.yml')
    service = await readConfig(configFilePath)

    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Validate', async () => {
    const functionsToCheck = Object.keys(service.functions).map(
      (functionName) => `${service.service}-${stage}-${functionName}`,
    )
    for (const functionName of functionsToCheck) {
      const getFunctionResponse = await lambdaClient.send(
        new GetFunctionCommand({
          FunctionName: functionName,
        }),
      )

      /**
       * Get the first key/value pair from the env var of the lambda function.
       */
      const [key, value] = Object.entries(
        getFunctionResponse?.Configuration?.Environment?.Variables || {},
      )[0]

      /**
       * The main.tf configuration generates 8 hex values, which equates to 16
       * chars 0-9 and a-f. In the serverless.yml, we get the output from the
       * Terraform configuration and set it as an environment variable called
       * "TEST" with that value. This validates the function contains this
       * value.
       */
      expect(key).toEqual('TEST')
      expect(value).toMatch(/^key-1-value-[a-fA-F0-9]{16}$/)
    }
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })
  })
})
