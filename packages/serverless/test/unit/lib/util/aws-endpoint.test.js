// getConfiguredAwsEndpoint answers which endpoint the AWS SDK sends a service's requests to when the
// user configured one (AWS_ENDPOINT_URL, AWS_ENDPOINT_URL_<SERVICE>, endpoint_url in the shared
// config file). These tests pin the AWS-documented precedence, so the AWS SDK v2 requests and the
// v3 clients keep agreeing on it.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import {
  describeConfiguredAwsEndpoints,
  getConfiguredAwsEndpoint,
} from '@serverless/util'

const VARIABLES = [
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_PROFILE',
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
let configCount = 0
beforeEach(() => {
  saved = Object.fromEntries(
    isolatedVariables().map((name) => [name, process.env[name]]),
  )
  for (const name of isolatedVariables()) delete process.env[name]
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-endpoint-'))
  // No shared config file unless a test writes one: the SDK reads ~/.aws/config otherwise.
  process.env.AWS_CONFIG_FILE = path.join(tmpDir, 'missing-config')
  process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(
    tmpDir,
    'missing-credentials',
  )
})
afterEach(() => {
  for (const name of isolatedVariables()) delete process.env[name]
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// The SDK caches each config file by path, so every test writes its own file.
const useConfigFile = (content) => {
  const file = path.join(tmpDir, `config-${++configCount}`)
  fs.writeFileSync(file, content)
  process.env.AWS_CONFIG_FILE = file
}

describe('getConfiguredAwsEndpoint', () => {
  test('returns undefined when nothing is configured', async () => {
    await expect(getConfiguredAwsEndpoint('CloudFormation')).resolves.toBe(
      undefined,
    )
  })

  test('reads AWS_ENDPOINT_URL for every service', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    await expect(getConfiguredAwsEndpoint('CloudFormation')).resolves.toBe(
      'https://127.0.0.1:9297',
    )
    await expect(getConfiguredAwsEndpoint('CloudWatch Logs')).resolves.toBe(
      'https://127.0.0.1:9297',
    )
  })

  test('a service variable wins over AWS_ENDPOINT_URL, by the SDK service id', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.localhost:4566'
    process.env.AWS_ENDPOINT_URL_CLOUDWATCH_LOGS = 'http://logs.local:1'
    process.env.AWS_ENDPOINT_URL_API_GATEWAY = 'http://apigw.local:2'
    await expect(getConfiguredAwsEndpoint('S3')).resolves.toBe(
      'http://s3.localhost:4566',
    )
    await expect(getConfiguredAwsEndpoint('CloudWatch Logs')).resolves.toBe(
      'http://logs.local:1',
    )
    await expect(getConfiguredAwsEndpoint('API Gateway')).resolves.toBe(
      'http://apigw.local:2',
    )
    await expect(getConfiguredAwsEndpoint('Lambda')).resolves.toBe(
      'https://127.0.0.1:9297',
    )
  })

  test('reads endpoint_url from the default profile of the shared config file', async () => {
    // The shape AWS Emulator writes to ~/.aws/emulator/<port>/config
    useConfigFile(
      '[default]\nregion = us-east-1\nendpoint_url = https://127.0.0.1:9297\n',
    )
    await expect(getConfiguredAwsEndpoint('CloudFormation')).resolves.toBe(
      'https://127.0.0.1:9297',
    )
  })

  test('reads the services section the profile names, then the profile endpoint_url', async () => {
    useConfigFile(
      [
        '[profile emu]',
        'services = local',
        'endpoint_url = https://127.0.0.1:9297',
        '[services local]',
        'cloudformation =',
        '  endpoint_url = http://cfn.local:1',
        '',
      ].join('\n'),
    )
    process.env.AWS_PROFILE = 'emu'
    await expect(getConfiguredAwsEndpoint('CloudFormation')).resolves.toBe(
      'http://cfn.local:1',
    )
    await expect(getConfiguredAwsEndpoint('S3')).resolves.toBe(
      'https://127.0.0.1:9297',
    )
  })

  test('environment variables win over the config file', async () => {
    useConfigFile('[default]\nendpoint_url = https://from-file:1\n')
    process.env.AWS_ENDPOINT_URL = 'https://from-env:2'
    await expect(getConfiguredAwsEndpoint('STS')).resolves.toBe(
      'https://from-env:2',
    )
  })

  test('AWS_IGNORE_CONFIGURED_ENDPOINT_URLS turns every setting off', async () => {
    useConfigFile('[default]\nendpoint_url = https://from-file:1\n')
    process.env.AWS_ENDPOINT_URL = 'https://from-env:2'
    process.env.AWS_ENDPOINT_URL_S3 = 'https://from-env:3'
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    await expect(getConfiguredAwsEndpoint('STS')).resolves.toBe(undefined)
    await expect(getConfiguredAwsEndpoint('S3')).resolves.toBe(undefined)
  })

  test('ignore_configured_endpoint_urls in the profile turns the settings off', async () => {
    useConfigFile(
      '[default]\nendpoint_url = https://from-file:1\nignore_configured_endpoint_urls = true\n',
    )
    process.env.AWS_ENDPOINT_URL = 'https://from-env:2'
    await expect(getConfiguredAwsEndpoint('STS')).resolves.toBe(undefined)
  })
})

describe('describeConfiguredAwsEndpoints', () => {
  test('is empty when nothing is configured', async () => {
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: [],
    })
  })

  test('names the shared endpoint and the service variables that apply', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.local:1'
    process.env.AWS_ENDPOINT_URL_CLOUDWATCH_LOGS = 'http://logs.local:2'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      endpoint: 'https://127.0.0.1:9297',
      serviceVariables: [
        'AWS_ENDPOINT_URL_CLOUDWATCH_LOGS',
        'AWS_ENDPOINT_URL_S3',
      ],
    })
  })

  test('is empty when the settings are turned off', async () => {
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.local:1'
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: [],
    })
  })

  const servicesSectionConfig = (profileLines = []) =>
    [
      '[profile emu]',
      'services = local',
      ...profileLines,
      '[services local]',
      's3 =',
      '  endpoint_url = http://s3.local:1',
      'cloudwatch_logs =',
      '  endpoint_url = http://logs.local:2',
      '',
    ].join('\n')

  test("names the services the profile's services section sets an endpoint for", async () => {
    useConfigFile(servicesSectionConfig())
    process.env.AWS_PROFILE = 'emu'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: [],
      configServices: ['cloudwatch_logs', 's3'],
    })
  })

  test('leaves out a services section entry an environment variable overrides', async () => {
    useConfigFile(servicesSectionConfig())
    process.env.AWS_PROFILE = 'emu'
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.env:3'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: ['AWS_ENDPOINT_URL_S3'],
      configServices: ['cloudwatch_logs'],
    })
    process.env.AWS_ENDPOINT_URL = 'https://127.0.0.1:9297'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      endpoint: 'https://127.0.0.1:9297',
      serviceVariables: ['AWS_ENDPOINT_URL_S3'],
    })
  })

  test('leaves out a services section entry an environment variable overrides with the same URL', async () => {
    useConfigFile(servicesSectionConfig())
    process.env.AWS_PROFILE = 'emu'
    process.env.AWS_ENDPOINT_URL_S3 = 'http://s3.local:1'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: ['AWS_ENDPOINT_URL_S3'],
      configServices: ['cloudwatch_logs'],
    })
  })

  test('leaves out the services section when the settings are turned off', async () => {
    useConfigFile(servicesSectionConfig())
    process.env.AWS_PROFILE = 'emu'
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'true'
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: [],
    })
    delete process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS
    useConfigFile(
      servicesSectionConfig(['ignore_configured_endpoint_urls = true']),
    )
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: [],
    })
  })

  test('reads only the services section the selected profile names', async () => {
    useConfigFile(servicesSectionConfig())
    await expect(describeConfiguredAwsEndpoints()).resolves.toEqual({
      serviceVariables: [],
    })
  })
})
