// A command run with AWS_ENDPOINT_URL (or a sibling setting) names the endpoint in one notice line,
// so a run against a local emulator is never taken for one against AWS.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { configuredAwsEndpointNotice } from '../../../../src/utils/local/aws-endpoint-notice.js'
import { configureLocalstackAWSEndpoint } from '../../../../src/utils/local/localstack.js'

const VARIABLES = [
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_PROFILE',
  'SLS_AWS_SDK',
]

// The variables above and every AWS_ENDPOINT_URL and AWS_ENDPOINT_URL_<SERVICE> set now, so no
// endpoint the shell sets reaches a test
const isolatedVariables = () => [
  ...VARIABLES,
  ...Object.keys(process.env).filter((name) =>
    name.startsWith('AWS_ENDPOINT_URL'),
  ),
]

let saved
let tmpDir
beforeEach(() => {
  saved = Object.fromEntries(
    isolatedVariables().map((name) => [name, process.env[name]]),
  )
  for (const name of isolatedVariables()) delete process.env[name]
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-endpoint-notice-'))
  process.env.AWS_CONFIG_FILE = path.join(tmpDir, 'missing-config')
  // The SDK merges the credentials file's profile into the config profile
  process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(
    tmpDir,
    'missing-credentials',
  )
  // The AWS SDK v3 code path for every call; the v2 default has its own test
  process.env.SLS_AWS_SDK = '3'
})
afterEach(() => {
  for (const name of isolatedVariables()) delete process.env[name]
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('configuredAwsEndpointNotice', () => {
  test('says nothing when no endpoint is configured', async () => {
    await expect(configuredAwsEndpointNotice()).resolves.toBeUndefined()
  })

  test('names AWS_ENDPOINT_URL', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message: 'Using the configured AWS endpoint https://127.0.0.1:9297',
    })
  })

  test('names endpoint_url from the shared config file', async () => {
    const file = path.join(tmpDir, 'config')
    fs.writeFileSync(file, '[default]\nendpoint_url = https://127.0.0.1:9297\n')
    process.env.AWS_CONFIG_FILE = file
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message: 'Using the configured AWS endpoint https://127.0.0.1:9297',
    })
  })

  test('names the service-specific variables', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    process.env.AWS_ENDPOINT_URL_S3 = 'http://127.0.0.1:9000'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message:
        'Using the configured AWS endpoint https://127.0.0.1:9297 and the endpoints set by AWS_ENDPOINT_URL_S3',
    })
    delete process.env.AWS_ENDPOINT_URL
    process.env.AWS_ENDPOINT_URL_LAMBDA = 'http://127.0.0.1:3002'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message:
        'Using the configured AWS endpoints set by AWS_ENDPOINT_URL_LAMBDA, AWS_ENDPOINT_URL_S3',
    })
  })

  test("names the services the shared config file's services section sets", async () => {
    const file = path.join(tmpDir, 'config')
    fs.writeFileSync(
      file,
      [
        '[profile emu]',
        'services = local',
        '[services local]',
        's3 =',
        '  endpoint_url = http://127.0.0.1:9000',
        '',
      ].join('\n'),
    )
    process.env.AWS_CONFIG_FILE = file
    process.env.AWS_PROFILE = 'emu'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message:
        'Using the configured AWS endpoints set for s3 in the shared config file',
    })
    process.env.AWS_ENDPOINT_URL_LAMBDA = 'http://127.0.0.1:3002'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message:
        'Using the configured AWS endpoints set by AWS_ENDPOINT_URL_LAMBDA and the endpoints set for s3 in the shared config file',
    })
  })

  test('leaves the user name and password of an endpoint URL out of the notice', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://user:secret@127.0.0.1:9297/path'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message:
        'Using the configured AWS endpoint https://***@127.0.0.1:9297/path',
    })
    process.env.AWS_ENDPOINT_URL = 'https://token@127.0.0.1:9297'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message: 'Using the configured AWS endpoint https://***@127.0.0.1:9297',
    })
  })

  test('leaves user info out of URL forms the URL parser normalizes, and out of unparsable values', async () => {
    process.env.AWS_ENDPOINT_URL = 'https:///alice:secret@emulator.internal'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'notice',
      message:
        'Using the configured AWS endpoint https://***@emulator.internal',
    })
    for (const value of [
      'alice:secret@emulator internal',
      'https://alice:secret',
      'alice:secret',
    ]) {
      process.env.AWS_ENDPOINT_URL = value
      await expect(configuredAwsEndpointNotice()).resolves.toEqual({
        level: 'notice',
        message:
          'Using the configured AWS endpoint (a value that is not a valid URL)',
      })
    }
  })

  test('prints only the names of the service variables, not their values', async () => {
    process.env.AWS_ENDPOINT_URL_S3 = 'http://user:secret@127.0.0.1:9000'
    const { message } = await configuredAwsEndpointNotice()
    expect(message).toBe(
      'Using the configured AWS endpoints set by AWS_ENDPOINT_URL_S3',
    )
    expect(message).not.toContain('secret')
  })

  test('without SLS_AWS_SDK=3, warns that AWS SDK v2 calls go to AWS', async () => {
    delete process.env.SLS_AWS_SDK
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    await expect(configuredAwsEndpointNotice()).resolves.toEqual({
      level: 'warning',
      message:
        "Using the configured AWS endpoint https://127.0.0.1:9297 for AWS SDK v3 calls. Calls on the AWS SDK v2 code path go to AWS's own endpoints; set SLS_AWS_SDK=3 to send them to the configured endpoint",
    })
  })

  test('says nothing when AWS_IGNORE_CONFIGURED_ENDPOINT_URLS turns them off', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    await expect(configuredAwsEndpointNotice()).resolves.toBeUndefined()
  })
})

describe('configureLocalstackAWSEndpoint', () => {
  test('reports whether serverless-localstack is active, so its runs print no notice', () => {
    expect(
      configureLocalstackAWSEndpoint({
        config: { plugins: ['serverless-localstack'] },
        stage: 'dev',
      }),
    ).toBe(true)
    expect(process.env.AWS_ENDPOINT_URL).toBe('http://localhost:4566')
    delete process.env.AWS_ENDPOINT_URL
    delete process.env.AWS_ENDPOINT_URL_S3
    expect(
      configureLocalstackAWSEndpoint({ config: { plugins: [] }, stage: 'dev' }),
    ).toBe(false)
    expect(process.env.AWS_ENDPOINT_URL).toBeUndefined()
  })
})
