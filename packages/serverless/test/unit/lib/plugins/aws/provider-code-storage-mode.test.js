import { describe, it, expect, beforeEach } from '@jest/globals'

const AwsProvider = (await import('../../../../../lib/plugins/aws/provider.js'))
  .default

describe('AwsProvider#isReferenceCodeStorageMode()', () => {
  let serverlessStub

  beforeEach(() => {
    serverlessStub = {
      version: '4.0.0',
      cli: {},
      config: {},
      configurationInput: {},
      processedInput: { commands: [], options: {} },
      service: {
        provider: { name: 'aws' },
        defaults: {},
      },
      setProvider() {},
      configSchemaHandler: {
        defineProvider() {},
        defineFunctionProperties() {},
        defineCustomProperties() {},
      },
      utils: {},
      classes: {},
      getProvider() {},
      credentialProviders: {
        aws: {
          getCredentials() {},
        },
      },
    }
  })

  const buildProvider = (deploymentBucketObject) => {
    const provider = new AwsProvider(serverlessStub, {})
    provider.serverless.service.provider.deploymentBucketObject =
      deploymentBucketObject
    return provider
  }

  it('returns true when codeStorageMode is "reference"', () => {
    expect(
      buildProvider({
        codeStorageMode: 'reference',
      }).isReferenceCodeStorageMode(),
    ).toBe(true)
  })

  it('returns false when codeStorageMode is "copy"', () => {
    expect(
      buildProvider({ codeStorageMode: 'copy' }).isReferenceCodeStorageMode(),
    ).toBe(false)
  })

  it('returns false when codeStorageMode is absent', () => {
    expect(buildProvider({}).isReferenceCodeStorageMode()).toBe(false)
  })

  it('returns false when deploymentBucketObject is absent', () => {
    expect(buildProvider(undefined).isReferenceCodeStorageMode()).toBe(false)
  })
})
