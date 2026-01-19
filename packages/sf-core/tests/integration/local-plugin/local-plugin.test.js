import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore'

/**
 * Things we need,
 * 1. Secrets, mainly license key
 * 2. Way to pull secrets, SSM From Integrations Account?
 */

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Service - Local Plugin', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const region = 'us-east-1'
  const lambdaClient = new LambdaClient({ region })
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
    // const res = execSync(
    // 'npm install --no-save serverless-offline @aws-crypto/crc32',
    // )
    // console.log(res.toString('utf-8'))
    await runSfCore({
      coreParams: {
        options: { stage, region, c: configFilePath },
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
      expect(getFunctionResponse.Configuration.Description).toEqual(
        `address-us-east-1-sfc-lplugin-${stage}`,
      )
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
