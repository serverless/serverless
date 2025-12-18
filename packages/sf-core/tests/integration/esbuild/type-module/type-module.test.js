/* eslint-disable no-undef */
import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  LambdaClient,
  GetFunctionCommand,
  InvokeCommand,
} from '@aws-sdk/client-lambda'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Serverless Framework Service - type: module', () => {
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

  test('Validate Functions Deployed', async () => {
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

  test('Validate Functions Run', async () => {
    const functionsToCheck = Object.keys(service.functions).map(
      (functionName) => `${service.service}-${stage}-${functionName}`,
    )

    for (const functionName of functionsToCheck) {
      const invokeResponse = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
        }),
      )

      const decoder = new TextDecoder('utf-8')
      const payloadString = JSON.parse(decoder.decode(invokeResponse.Payload))

      expect(payloadString.type).toBe('module')
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
