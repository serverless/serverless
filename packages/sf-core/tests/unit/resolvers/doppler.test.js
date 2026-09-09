import { jest } from '@jest/globals'

// The provider imports the Doppler SDK at module scope; validateConfig never
// touches it, so a stub keeps the unit test off the real client.
jest.unstable_mockModule('@dopplerhq/node-sdk', () => ({
  default: class DopplerSDK {},
}))

const { Doppler } =
  await import('../../../src/lib/resolvers/providers/doppler/doppler.js')

describe('Doppler resolver', () => {
  describe('validateConfig', () => {
    test('accepts a valid configuration', () => {
      expect(() =>
        Doppler.validateConfig({
          type: 'doppler',
          token: 'dp.st.token',
          project: 'my-project',
          config: 'dev',
        }),
      ).not.toThrow()
    })

    test('rejects unknown keys with the allowed-keys message', () => {
      expect(() =>
        Doppler.validateConfig({
          type: 'doppler',
          project: 'my-project',
          environment: 'dev',
        }),
      ).toThrow(
        "Only 'token', 'project', and 'config' are allowed in the Doppler configuration (unrecognized: 'environment')",
      )
    })
  })
})
