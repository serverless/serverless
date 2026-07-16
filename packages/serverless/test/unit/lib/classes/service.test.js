import { describe, expect, it } from '@jest/globals'

const { default: Service } = await import('../../../../lib/classes/service.js')

const createServerlessStub = ({ version, configurationInput }) => ({
  configurationFilename: 'serverless.yml',
  configurationInput: {
    service: 'test-service',
    provider: { name: 'aws' },
    ...configurationInput,
  },
  utils: {
    getVersion: () => version,
  },
})

const loadService = ({ version = '4.32.0', ...configurationInput } = {}) => {
  const service = new Service(
    createServerlessStub({ version, configurationInput }),
  )
  service.loadServiceFileParam()
  return service
}

describe('Service', () => {
  describe('frameworkVersion validation', () => {
    it('should accept "*" (any version)', () => {
      expect(() => loadService({ frameworkVersion: '*' })).not.toThrow()
    })

    it('should accept a caret range covering the current version', () => {
      expect(() =>
        loadService({ frameworkVersion: '^4.0.0', version: '4.32.0' }),
      ).not.toThrow()
    })

    it('should accept an exact pin equal to the current version', () => {
      expect(() =>
        loadService({ frameworkVersion: '4.32.0', version: '4.32.0' }),
      ).not.toThrow()
    })

    it('should accept a different version within the same major', () => {
      expect(() =>
        loadService({ frameworkVersion: '4.1.0', version: '4.32.0' }),
      ).not.toThrow()
    })

    it('should reject a version pin with a different major', () => {
      expect(() =>
        loadService({ frameworkVersion: '3.38.0', version: '4.32.0' }),
      ).toThrow(expect.objectContaining({ code: 'FRAMEWORK_VERSION_MISMATCH' }))
    })

    it('should skip validation for an invalid version string by default', () => {
      expect(() => loadService({ frameworkVersion: 'latest' })).not.toThrow()
    })

    it('should reject an invalid version string when configValidationMode is "error"', () => {
      expect(() =>
        loadService({
          frameworkVersion: 'latest',
          configValidationMode: 'error',
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_FRAMEWORK_VERSION' }))
    })
  })
})
