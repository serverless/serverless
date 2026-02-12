import DomainConfig from '../../../../../../../lib/plugins/aws/domains/models/domain-config.js'
import Globals from '../../../../../../../lib/plugins/aws/domains/globals.js'

describe('DomainConfig', () => {
  beforeEach(() => {
    Globals.options = {}
    Globals.serverless = {
      service: {
        provider: {
          stage: 'dev',
        },
      },
    }
  })

  describe('_getSecurityPolicy', () => {
    describe('legacy security policies', () => {
      it('should return TLS_1_2 as default when no policy is specified', () => {
        const result = DomainConfig._getSecurityPolicy(undefined)
        expect(result).toBe('TLS_1_2')
      })

      it('should return TLS_1_0 for tls_1_0', () => {
        const result = DomainConfig._getSecurityPolicy('tls_1_0')
        expect(result).toBe('TLS_1_0')
      })

      it('should return TLS_1_2 for tls_1_2', () => {
        const result = DomainConfig._getSecurityPolicy('tls_1_2')
        expect(result).toBe('TLS_1_2')
      })

      it('should be case-insensitive for legacy policies', () => {
        expect(DomainConfig._getSecurityPolicy('TLS_1_0')).toBe('TLS_1_0')
        expect(DomainConfig._getSecurityPolicy('TLS_1_2')).toBe('TLS_1_2')
      })

      it('should throw for invalid legacy policy', () => {
        expect(() => DomainConfig._getSecurityPolicy('invalid_policy')).toThrow(
          /is not a supported securityPolicy/,
        )
      })

      it('should throw for tls_1_3 (not a valid standalone value)', () => {
        // TLS 1.3 is only available through enhanced SecurityPolicy_* values
        expect(() => DomainConfig._getSecurityPolicy('tls_1_3')).toThrow(
          /is not a supported securityPolicy/,
        )
      })

      it('should include enhanced policy hint in error message', () => {
        expect(() => DomainConfig._getSecurityPolicy('invalid')).toThrow(
          /SecurityPolicy_TLS13_2025_EDGE/,
        )
      })
    })

    describe('enhanced security policies', () => {
      it('should pass through SecurityPolicy_TLS13_2025_EDGE', () => {
        const result = DomainConfig._getSecurityPolicy(
          'SecurityPolicy_TLS13_2025_EDGE',
        )
        expect(result).toBe('SecurityPolicy_TLS13_2025_EDGE')
      })

      it('should pass through SecurityPolicy_TLS13_1_3_2025_09_REGIONAL', () => {
        const result = DomainConfig._getSecurityPolicy(
          'SecurityPolicy_TLS13_1_3_2025_09_REGIONAL',
        )
        expect(result).toBe('SecurityPolicy_TLS13_1_3_2025_09_REGIONAL')
      })

      it('should pass through SecurityPolicy_TLS13_1_2_2025_01_REGIONAL', () => {
        const result = DomainConfig._getSecurityPolicy(
          'SecurityPolicy_TLS13_1_2_2025_01_REGIONAL',
        )
        expect(result).toBe('SecurityPolicy_TLS13_1_2_2025_01_REGIONAL')
      })

      it('should pass through any policy starting with SecurityPolicy_', () => {
        const result = DomainConfig._getSecurityPolicy(
          'SecurityPolicy_FUTURE_POLICY',
        )
        expect(result).toBe('SecurityPolicy_FUTURE_POLICY')
      })
    })
  })

  describe('_getAccessMode', () => {
    it('should return undefined when accessMode is not specified', () => {
      const result = DomainConfig._getAccessMode(undefined)
      expect(result).toBeUndefined()
    })

    it('should return undefined when accessMode is empty string', () => {
      const result = DomainConfig._getAccessMode('')
      expect(result).toBeUndefined()
    })

    it('should return BASIC for basic (case-insensitive)', () => {
      const result = DomainConfig._getAccessMode('basic')
      expect(result).toBe('BASIC')
    })

    it('should return STRICT for strict (case-insensitive)', () => {
      const result = DomainConfig._getAccessMode('STRICT')
      expect(result).toBe('STRICT')
    })

    it('should throw for invalid accessMode', () => {
      expect(() => DomainConfig._getAccessMode('invalid')).toThrow(
        /is not a supported accessMode/,
      )
    })
  })

  describe('constructor explicit configuration flags', () => {
    it('sets hasSecurityPolicyConfigured and hasAccessModeConfigured when values are provided', () => {
      const config = new DomainConfig({
        name: 'api.example.com',
        apiType: 'rest',
        securityPolicy: 'TLS_1_2',
        accessMode: 'STRICT',
      })

      expect(config.hasSecurityPolicyConfigured).toBe(true)
      expect(config.hasAccessModeConfigured).toBe(true)
    })

    it('does not set explicit flags when values are omitted', () => {
      const config = new DomainConfig({
        name: 'api.example.com',
        apiType: 'rest',
      })

      expect(config.hasSecurityPolicyConfigured).toBe(false)
      expect(config.hasAccessModeConfigured).toBe(false)
    })

    it('keeps hasAccessModeConfigured true when accessMode is explicitly unset', () => {
      const config = new DomainConfig({
        name: 'api.example.com',
        apiType: 'rest',
        accessMode: '',
      })

      expect(config.hasAccessModeConfigured).toBe(true)
      expect(config.accessMode).toBeUndefined()
    })
  })
})
