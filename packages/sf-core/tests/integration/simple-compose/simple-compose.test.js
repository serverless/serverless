/* eslint-disable no-undef */
import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'

/**
 * Things we need,
 * 1. Secrets, mainly license key
 * 2. Way to pull secrets, SSM From Integrations Account?
 */

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Compose - Simple', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const configFilePath = path.join(configFileDirPath, 'serverless-compose.yml')
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  process.env.TEST_STAGE = stage

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
      expectError: false,
    })
  })

  test('Validate', async () => {
    const service = await readConfig(configFilePath)
    const servicePaths = Object.entries(service.services).map(
      ([, serviceConfig]) => {
        return path.join(
          path.dirname(configFilePath),
          serviceConfig.path,
          'serverless.yml',
        )
      },
    )
    const parsedServices = await Promise.all(
      servicePaths.map((servicePath) => readConfig(servicePath)),
    )
    const functionsToCheck = parsedServices
      .map((service) =>
        Object.keys(service.functions).map(
          (functionName) => `${service.service}-${stage}-${functionName}`,
        ),
      )
      .flat()

    for (const functionName of functionsToCheck) {
      const getFunctionResponse = await lambdaClient.send(
        new GetFunctionCommand({
          FunctionName: functionName,
        }),
      )

      expect(getFunctionResponse.Configuration).toBeDefined()
    }
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
      expectError: false,
    })
  })
})
