/* eslint-disable no-undef */
import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore'
import {
  DeleteParameterCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm'
import fs from 'fs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Traditional Service - License Key', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const originalEnv = process.env
  const stage = getTestStageName()
  let configFilePath

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: undefined,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(async () => {
    process.env = originalEnv
    // Delete license key SSM parameter
    const ssmClient = new SSMClient({ region: 'us-east-2' })
    const deleteCommand = new DeleteParameterCommand({
      Name: '/serverless-framework/license-key',
    })
    await ssmClient.send(deleteCommand)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('No license key in env or config file', async () => {
    configFilePath = path.join(
      configFileDirPath,
      'no-license-key-in-config',
      'serverless.yml',
    )

    await expect(
      runSfCore({
        expectError: true,
        coreParams: {
          options: { stage, c: configFilePath },
          command: ['print'],
        },
        jest,
      }),
    ).rejects.toThrow(/license key/)
  })

  test('License key loaded using env resolver', async () => {
    configFilePath = path.join(
      configFileDirPath,
      'license-key-env-resolver',
      'serverless.yml',
    )
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
    }
    await runSfCore({
      expectError: true,
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['print'],
      },
      jest,
    })
  })

  test('License key loaded using ssm resolver', async () => {
    configFilePath = path.join(
      configFileDirPath,
      'license-key-ssm-resolver',
      'serverless.yml',
    )
    await runSfCore({
      expectError: true,
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['print'],
      },
      jest,
    })
  })

  test('License key in default /serverless-framework/license-key SSM param', async () => {
    configFilePath = path.join(
      configFileDirPath,
      'license-key-default-ssm',
      'serverless.yml',
    )

    const updateServerlessYml = (originalStage, newStage) => {
      const content = fs.readFileSync(configFilePath, 'utf8')
      const updatedContent = content.replace(originalStage, newStage)
      fs.writeFileSync(configFilePath, updatedContent, 'utf8')
    }

    // Update serverless.yml to replace alpha stage with auto-generated stage
    updateServerlessYml('alpha', stage)

    // Unset license key env var
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: undefined,
      SERVERLESS_ACCESS_KEY: undefined,
    }

    // Put a license key in SSM
    const ssmClient = new SSMClient({ region: 'us-east-2' })
    // Create SSM parameter with the license key
    const command = new PutParameterCommand({
      Name: '/serverless-framework/license-key',
      Value: process.env.SERVERLESS_LICENSE_KEY_DEV,
      Type: ParameterType.SECURE_STRING,
    })
    await ssmClient.send(command)

    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, r: 'us-east-2' },
        command: ['print'],
      },
      jest,
    })

    jest.restoreAllMocks()

    // Test command that needs authentication
    // but doesn't require the config file
    // License key should be loaded from SSM
    await runSfCore({
      coreParams: {
        options: { region: 'us-east-2' },
        command: ['usage'],
      },
      jest,
    })

    // Restore original alpha stage in serverless.yml
    updateServerlessYml(stage, 'alpha')
  })
})
