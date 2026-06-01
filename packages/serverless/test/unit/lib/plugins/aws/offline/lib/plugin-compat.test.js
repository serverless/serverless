import {
  ALIAS_KEYS,
  UNSUPPORTED_KEYS,
  SILENT_IGNORE_KEYS,
  CUSTOM_SERVERLESS_OFFLINE_SCHEMA,
  normalizePluginKeys,
  collectUnsupportedKeys,
} from '../../../../../../../lib/plugins/aws/offline/lib/plugin-compat.js'

describe('plugin-compat', () => {
  describe('exported constants', () => {
    it('ALIAS_KEYS maps httpPort to appPort', () => {
      expect(ALIAS_KEYS).toEqual({ httpPort: 'appPort' })
    })

    it('UNSUPPORTED_KEYS has the exact expected membership', () => {
      expect([...UNSUPPORTED_KEYS].sort()).toEqual(
        ['albPort', 'preLoadModules', 'resourceRoutes', 'websocketPort'].sort(),
      )
    })

    it('SILENT_IGNORE_KEYS holds noSponsor', () => {
      expect(SILENT_IGNORE_KEYS).toEqual(['noSponsor'])
    })

    it('CUSTOM_SERVERLESS_OFFLINE_SCHEMA is a permissive object schema', () => {
      expect(CUSTOM_SERVERLESS_OFFLINE_SCHEMA).toEqual({
        type: 'object',
        additionalProperties: true,
      })
    })
  })

  describe('normalizePluginKeys', () => {
    it('renames httpPort to appPort preserving the value', () => {
      const result = normalizePluginKeys({ httpPort: 4000 })
      expect(result).toEqual({ appPort: 4000 })
      expect(result.httpPort).toBeUndefined()
    })

    it('leaves all other keys untouched', () => {
      const source = { host: 'localhost', lambdaPort: 3002, noAuth: true }
      expect(normalizePluginKeys(source)).toEqual({
        host: 'localhost',
        lambdaPort: 3002,
        noAuth: true,
      })
    })

    it('returns a new object and does not mutate the input', () => {
      const source = { httpPort: 4000, host: 'localhost' }
      const result = normalizePluginKeys(source)
      expect(result).not.toBe(source)
      expect(source).toEqual({ httpPort: 4000, host: 'localhost' })
    })

    it('keeps explicit appPort and drops httpPort when both are present', () => {
      const result = normalizePluginKeys({ httpPort: 4000, appPort: 5000 })
      expect(result).toEqual({ appPort: 5000 })
      expect(result.httpPort).toBeUndefined()
    })

    it('handles empty input', () => {
      expect(normalizePluginKeys({})).toEqual({})
    })

    it('handles undefined input', () => {
      expect(normalizePluginKeys()).toEqual({})
    })
  })

  describe('collectUnsupportedKeys', () => {
    it('returns sorted unsupported keys present in either source', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { websocketPort: 3001 },
          pluginCustom: { albPort: 3003 },
        }),
      ).toEqual(['albPort', 'websocketPort'])
    })

    it('deduplicates keys present in both sources', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { resourceRoutes: true },
          pluginCustom: { resourceRoutes: true },
        }),
      ).toEqual(['resourceRoutes'])
    })

    it('returns empty when none are present', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { host: 'localhost' },
          pluginCustom: { lambdaPort: 3002 },
        }),
      ).toEqual([])
    })

    it('ignores keys whose value is undefined', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { albPort: undefined },
          pluginCustom: {},
        }),
      ).toEqual([])
    })

    it('does not include silently-ignored noSponsor', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { noSponsor: true },
          pluginCustom: {},
        }),
      ).toEqual([])
    })

    it('does not include the mapped reloadHandler', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { reloadHandler: true },
          pluginCustom: {},
        }),
      ).toEqual([])
    })

    it('does not include supported keys', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { httpPort: 4000, noAuth: true },
          pluginCustom: { lambdaPort: 3002 },
        }),
      ).toEqual([])
    })

    it('handles empty/missing arguments', () => {
      expect(collectUnsupportedKeys()).toEqual([])
      expect(collectUnsupportedKeys({})).toEqual([])
    })
  })
})
