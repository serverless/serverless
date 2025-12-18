import { jest } from '@jest/globals'
import { StrToBool } from '../../../src/lib/resolvers/providers/str-to-bool/str-to-bool.js'

describe('StrToBool Resolver', () => {
  let resolver

  beforeEach(() => {
    resolver = new StrToBool({
      providerConfig: {},
      serviceConfigFile: null,
      configFileDirPath: null,
      options: {},
      stage: null,
      dashboard: null,
      composeParams: null,
      resolveVariableFunc: null,
      resolveConfigurationPropertyFunc: null,
    })
  })

  describe('resolveVariable', () => {
    describe('truthy values', () => {
      test('resolves "true" to boolean true', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: 'true',
        })
        expect(result).toBe(true)
      })

      test('resolves "TRUE" (uppercase) to boolean true', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: 'TRUE',
        })
        expect(result).toBe(true)
      })

      test('resolves "True" (mixed case) to boolean true', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: 'True',
        })
        expect(result).toBe(true)
      })

      test('resolves "1" to boolean true', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: '1',
        })
        expect(result).toBe(true)
      })
    })

    describe('falsy values', () => {
      test('resolves "false" to boolean false', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: 'false',
        })
        expect(result).toBe(false)
      })

      test('resolves "FALSE" (uppercase) to boolean false', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: 'FALSE',
        })
        expect(result).toBe(false)
      })

      test('resolves "False" (mixed case) to boolean false', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: 'False',
        })
        expect(result).toBe(false)
      })

      test('resolves "0" to boolean false', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: '0',
        })
        expect(result).toBe(false)
      })
    })

    describe('whitespace handling', () => {
      test('trims whitespace from truthy value', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: '  true  ',
        })
        expect(result).toBe(true)
      })

      test('trims whitespace from falsy value', () => {
        const result = resolver.resolveVariable({
          resolverType: 'convert',
          resolutionDetails: {},
          key: '  false  ',
        })
        expect(result).toBe(false)
      })
    })

    describe('error handling', () => {
      test('throws error for invalid string input', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'convert',
            resolutionDetails: {},
            key: 'foo',
          }),
        ).toThrow(/Invalid "strToBool" input/)
      })

      test('throws error for empty string', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'convert',
            resolutionDetails: {},
            key: '',
          }),
        ).toThrow(/Invalid "strToBool" input/)
      })

      test('throws error for "yes"', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'convert',
            resolutionDetails: {},
            key: 'yes',
          }),
        ).toThrow(/Invalid "strToBool" input/)
      })

      test('throws error for "no"', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'convert',
            resolutionDetails: {},
            key: 'no',
          }),
        ).toThrow(/Invalid "strToBool" input/)
      })

      test('error message includes received value', () => {
        expect(() =>
          resolver.resolveVariable({
            resolverType: 'convert',
            resolutionDetails: {},
            key: 'invalid',
          }),
        ).toThrow(/Received: invalid/)
      })
    })
  })

  describe('static properties', () => {
    test('has correct type', () => {
      expect(StrToBool.type).toBe('strToBool')
    })

    test('has correct resolvers', () => {
      expect(StrToBool.resolvers).toEqual(['convert'])
    })

    test('has correct default resolver', () => {
      expect(StrToBool.defaultResolver).toBe('convert')
    })
  })
})
