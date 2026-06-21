import { jest } from '@jest/globals'

const mockSend = jest.fn()

jest.unstable_mockModule('@aws-sdk/client-appconfigdata', () => ({
  AppConfigDataClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  StartConfigurationSessionCommand: jest.fn().mockImplementation((params) => ({
    ...params,
    _type: 'StartConfigurationSessionCommand',
  })),
  GetLatestConfigurationCommand: jest.fn().mockImplementation((params) => ({
    ...params,
    _type: 'GetLatestConfigurationCommand',
  })),
}))

jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
}))

const { resolveValueFromAppConfig } =
  await import('../../../src/lib/resolvers/providers/aws/appconfig.js')

describe('AWS AppConfig Resolver', () => {
  const credentials = {
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  }
  const region = 'us-east-1'

  beforeEach(() => {
    mockSend.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('resolveValueFromAppConfig', () => {
    test('resolves configuration with IDs in key', async () => {
      const configValue = JSON.stringify({
        database: { host: 'db.example.com' },
      })
      mockSend
        .mockResolvedValueOnce({
          InitialConfigurationToken: 'session-token',
        })
        .mockResolvedValueOnce({
          Configuration: new TextEncoder().encode(configValue),
        })

      const result = await resolveValueFromAppConfig(
        credentials,
        region,
        'my-app/my-env/my-profile',
        {},
      )

      expect(result).toBe(configValue)
    })

    test('resolves configuration with JSON path from config IDs', async () => {
      const configValue = JSON.stringify({
        database: { host: 'db.example.com' },
      })
      mockSend
        .mockResolvedValueOnce({
          InitialConfigurationToken: 'session-token',
        })
        .mockResolvedValueOnce({
          Configuration: new TextEncoder().encode(configValue),
        })

      const result = await resolveValueFromAppConfig(
        credentials,
        region,
        'database.host',
        {
          applicationId: 'my-app',
          environmentId: 'my-env',
          configurationProfileId: 'my-profile',
        },
      )

      expect(result).toBe('db.example.com')
    })

    test('resolves JSON path with IDs in key', async () => {
      const configValue = JSON.stringify({ featureEnabled: true })
      mockSend
        .mockResolvedValueOnce({
          InitialConfigurationToken: 'session-token',
        })
        .mockResolvedValueOnce({
          Configuration: new TextEncoder().encode(configValue),
        })

      const result = await resolveValueFromAppConfig(
        credentials,
        region,
        'my-app/my-env/my-profile/featureEnabled',
        {},
      )

      expect(result).toBe('true')
    })

    test('throws when IDs are missing', async () => {
      await expect(
        resolveValueFromAppConfig(credentials, region, 'just-a-key', {}),
      ).rejects.toThrow('AWS AppConfig requires applicationId')
    })

    test('throws when key not found in JSON config', async () => {
      const configValue = JSON.stringify({ existing: 'value' })
      mockSend
        .mockResolvedValueOnce({
          InitialConfigurationToken: 'session-token',
        })
        .mockResolvedValueOnce({
          Configuration: new TextEncoder().encode(configValue),
        })

      await expect(
        resolveValueFromAppConfig(credentials, region, 'missing.key', {
          applicationId: 'my-app',
          environmentId: 'my-env',
          configurationProfileId: 'my-profile',
        }),
      ).rejects.toThrow(
        'Key "missing.key" not found in AWS AppConfig configuration',
      )
    })

    test('throws on AWS SDK error', async () => {
      mockSend.mockRejectedValue(new Error('Access denied'))

      await expect(
        resolveValueFromAppConfig(
          credentials,
          region,
          'my-app/my-env/my-profile',
          {},
        ),
      ).rejects.toThrow('Access denied')
    })
  })
})
