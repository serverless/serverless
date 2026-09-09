import { jest } from '@jest/globals'

const mockFromNodeProviderChain = jest.fn()

jest.unstable_mockModule('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: mockFromNodeProviderChain,
}))

const { getAwsCredentials } =
  await import('../../../src/lib/resolvers/providers/aws/credentials.js')

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

  it('should forward the SDK provider options to the credential chain', async () => {
    const mockCredentialProvider = jest.fn().mockResolvedValue({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    })
    mockFromNodeProviderChain.mockReturnValue(mockCredentialProvider)

    const credentialProvider = await getAwsCredentials({
      logger,
      dashboard: null,
      config: { profile: 'x' },
      isDefaultConfig: false,
    })

    const providerOptions = { callerClientConfig: { region: 'eu-west-1' } }
    await credentialProvider(providerOptions)

    expect(mockCredentialProvider).toHaveBeenCalledTimes(1)
    expect(mockCredentialProvider.mock.calls[0][0]).toBe(providerOptions)
  })

  it('adds the credential-setup hint when the implicit default resolver is used', async () => {
    const providerError = Object.assign(
      new Error('Could not load credentials from any providers'),
      { name: 'CredentialsProviderError' },
    )
    mockFromNodeProviderChain.mockReturnValue(
      jest.fn().mockRejectedValue(providerError),
    )

    const credentialProvider = await getAwsCredentials({
      logger,
      dashboard,
      config,
      isDefaultConfig: true,
    })

    await expect(credentialProvider()).rejects.toMatchObject({
      code: 'AWS_CREDENTIALS_MISSING',
      message:
        'AWS credentials missing or invalid. Run "serverless" to set up AWS credentials, or learn more in our docs: https://slss.io/aws-creds-setup. Original error from AWS: Could not load credentials from any providers',
    })
  })

  it('omits the credential-setup hint when the resolver is explicitly configured', async () => {
    const providerError = Object.assign(
      new Error('Could not load credentials from any providers'),
      { name: 'CredentialsProviderError' },
    )
    mockFromNodeProviderChain.mockReturnValue(
      jest.fn().mockRejectedValue(providerError),
    )

    const credentialProvider = await getAwsCredentials({
      logger,
      dashboard,
      config: { profile: 'does-not-exist' },
      isDefaultConfig: false,
    })

    await expect(credentialProvider()).rejects.toMatchObject({
      code: 'AWS_CREDENTIALS_MISSING',
      message:
        'AWS credentials missing or invalid. Original error from AWS: Could not load credentials from any providers',
    })
  })
})
