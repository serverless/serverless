import { Service } from '../../../src/lib/resolvers/providers/service/service.js'

describe('Service resolver', () => {
  describe('validateConfig', () => {
    test('accepts a valid configuration', () => {
      expect(() =>
        Service.validateConfig({ type: 'service', stage: 'prod' }),
      ).not.toThrow()
    })

    test('rejects unknown keys with the allowed-keys message', () => {
      expect(() =>
        Service.validateConfig({
          type: 'service',
          stage: 'prod',
          region: 'us-east-1',
        }),
      ).toThrow(
        "Only 'type' and 'stage' are allowed in the service resolver configuration (unrecognized: 'region')",
      )
    })
  })
})
