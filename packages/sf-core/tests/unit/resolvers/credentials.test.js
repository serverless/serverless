import { jest } from '@jest/globals'

const mockFromNodeProviderChain = jest.fn()

jest.unstable_mockModule('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: mockFromNodeProviderChain,
}))

const { getAwsCredentials } = await import(
  '../../../src/lib/resolvers/providers/aws/credentials.js'
)

describe('getAwsCredentials', () => {
  let logger
  let dashboard
  let config

  beforeEach(() => {
    logger = {
      debug: jest.fn(),
      input: jest.fn(),
    }
    dashboard = {}
    config = {}
    jest.clearAllMocks()
  })

  it('should pass mfaCodeProvider to fromNodeProviderChain', async () => {
    const mockCredentialProvider = jest.fn().mockResolvedValue({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    })
    mockFromNodeProviderChain.mockReturnValue(mockCredentialProvider)

    const credentialProvider = await getAwsCredentials({
      logger,
      dashboard,
      config,
    })

    expect(mockFromNodeProviderChain).toHaveBeenCalledWith(
      expect.objectContaining({
        mfaCodeProvider: expect.any(Function),
      }),
    )

    // Verify it's a provider function by calling it
    expect(typeof credentialProvider).toBe('function')
    const credentials = await credentialProvider()
    expect(credentials.accessKeyId).toBe('test')
  })

  it('should call logger.input when mfaCodeProvider is invoked', async () => {
    const mockCredentialProvider = jest.fn().mockResolvedValue({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    })
    mockFromNodeProviderChain.mockReturnValue(mockCredentialProvider)

    const credentialProvider = await getAwsCredentials({
      logger,
      dashboard,
      config,
    })

    const mfaCodeProvider =
      mockFromNodeProviderChain.mock.calls[0][0].mfaCodeProvider
    const mfaSerial = 'arn:aws:iam::123456789012:mfa/user'
    const mfaCode = '123456'

    logger.input.mockResolvedValue(mfaCode)

    const result = await mfaCodeProvider(mfaSerial)

    expect(logger.input).toHaveBeenCalledWith({
      message: `Enter MFA code for ${mfaSerial}`,
      inputType: 'password',
    })
    expect(result).toBe(mfaCode)
  })
})
