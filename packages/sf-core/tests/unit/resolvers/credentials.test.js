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

  // No credentials could be loaded: the message names what the command looked
  // for and how to set it up, in the words `serverless agent setup` uses.
  describe('when no credentials can be loaded', () => {
    const missing = async ({
      config,
      isDefaultConfig,
      resolverName,
      env,
      awsMessage = 'Could not load credentials from any providers',
    }) => {
      mockFromNodeProviderChain.mockReturnValue(
        jest.fn().mockRejectedValue(
          Object.assign(new Error(awsMessage), {
            name: 'CredentialsProviderError',
          }),
        ),
      )
      const credentialProvider = await getAwsCredentials({
        logger,
        dashboard,
        config,
        isDefaultConfig,
        resolverName,
        env,
      })
      return credentialProvider().catch((error) => error)
    }
    const AWS_SAYS =
      ' Original error from AWS: Could not load credentials from any providers'

    it('nothing configured: how to set credentials up, plus the docs link', async () => {
      const error = await missing({ config, isDefaultConfig: true, env: {} })
      expect(error.code).toBe('AWS_CREDENTIALS_MISSING')
      expect(error.message).toBe(
        'AWS credentials missing or invalid: not found. To fix it, set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or run "serverless login aws" in an interactive terminal. Learn more: https://slss.io/aws-creds-setup.' +
          AWS_SAYS,
      )
      expect(error.originalMessage).toBe(
        'Could not load credentials from any providers',
      )
    })

    it('a profile the command names: that profile and how to create it', async () => {
      const error = await missing({
        config: { profile: 'does-not-exist' },
        isDefaultConfig: false,
        env: {},
      })
      expect(error.message).toBe(
        'AWS credentials missing or invalid: profile "does-not-exist" has no usable credentials. To fix it, create it with "serverless login aws --aws-profile does-not-exist" in an interactive terminal, or name another profile in provider.profile or with --aws-profile.' +
          AWS_SAYS,
      )
    })

    it('AWS_PROFILE from the environment is named the same way', async () => {
      const error = await missing({
        config,
        isDefaultConfig: true,
        env: { AWS_PROFILE: 'work' },
      })
      expect(error.message).toContain(
        'profile "work" has no usable credentials',
      )
    })

    it('an aws resolver in serverless.yml: the resolver, its profile, and no --aws-profile advice', async () => {
      const error = await missing({
        config: { type: 'aws', profile: 'staging-account' },
        isDefaultConfig: false,
        resolverName: 'aws-account',
        env: {},
      })
      expect(error.message).toBe(
        'AWS credentials missing or invalid: resolver "aws-account" uses profile "staging-account", which has no usable credentials. To fix it, create it with "serverless login aws --aws-profile staging-account" in an interactive terminal, or change the profile of resolver "aws-account" in serverless.yml.' +
          AWS_SAYS,
      )
    })

    it('an expired SSO session: the profile to sign in again, not "no usable credentials"', async () => {
      const awsMessage =
        "Token is expired. To refresh this SSO session run 'aws sso login' with the corresponding profile."
      const error = await missing({
        config: { type: 'aws', profile: 'staging-account' },
        isDefaultConfig: false,
        resolverName: 'aws-account',
        env: {},
        awsMessage,
      })
      expect(error.message).toBe(
        'AWS credentials missing or invalid: the SSO session of profile "staging-account", which resolver "aws-account" uses, has expired. To fix it, sign in again with "serverless login aws sso --aws-profile staging-account" in an interactive terminal.' +
          ` Original error from AWS: ${awsMessage}`,
      )
    })
  })
})
