import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore'

/**
 * This test is for a Serverless Framework service that is
 * configured with Dashboard.
 *
 * It currently uses the following Dashboard features:
 * - Providers
 *
 * Things we need:
 * 1. Secrets, mainly license key
 * 2. Way to pull secrets, SSM From Integrations Account?
 */

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Service - Simple - Dashboard Enabled - Nodejs', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const originalEnv = process.env
  const stage = getTestStageName()
  process.env.TEST_STAGE = stage

  const lambdaClient = new LambdaClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: originalEnv.AWS_ACCESS_KEY_ID, // AWS Access Key ID
      secretAccessKey: originalEnv.AWS_SECRET_ACCESS_KEY, // AWS Secret Access Key
      sessionToken: originalEnv.AWS_SESSION_TOKEN, // AWS Session Token
    },
  })
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
      SERVERLESS_ACCESS_KEY: process.env.SERVERLESS_ACCESS_KEY_DEV,
    }
    /**
     * Delete AWS Credentials from env, if they exist.
     * Instead, use the Provider Credentials within the "serverlesstestaccount" Org
     */
    if (process.env.AWS_ACCESS_KEY_ID) {
      delete process.env.AWS_ACCESS_KEY_ID
    }
    if (process.env.AWS_SECRET_ACCESS_KEY) {
      delete process.env.AWS_SECRET_ACCESS_KEY
    }
    if (process.env.AWS_SESSION_TOKEN) {
      delete process.env.AWS_SESSION_TOKEN
    }
    // Delete License Key as well, since it doesn't allow Dashboard features
    if (process.env.SERVERLESS_LICENSE_KEY) {
      delete process.env.SERVERLESS_LICENSE_KEY
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
    })
  })
})
