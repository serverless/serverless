import {
  UNSUPPORTED_KEYS,
  SILENT_IGNORE_KEYS,
  CUSTOM_SERVERLESS_OFFLINE_SCHEMA,
  collectUnsupportedKeys,
} from '../../../../../../../lib/plugins/aws/offline/lib/plugin-compat.js'

describe('plugin-compat', () => {
  describe('exported constants', () => {
    it('UNSUPPORTED_KEYS has the exact expected membership', () => {
      expect([...UNSUPPORTED_KEYS].sort()).toEqual(['preLoadModules'].sort())
    })

    it('UNSUPPORTED_KEYS no longer lists websocketPort, albPort, or resourceRoutes', () => {
      expect(UNSUPPORTED_KEYS).not.toContain('websocketPort')
      expect(UNSUPPORTED_KEYS).not.toContain('albPort')
      expect(UNSUPPORTED_KEYS).not.toContain('resourceRoutes')
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

  describe('collectUnsupportedKeys', () => {
    it('returns the unsupported key present in a source', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: {},
          pluginCustom: { preLoadModules: [] },
        }),
      ).toEqual(['preLoadModules'])
    })

    it('does not treat resourceRoutes as unsupported (now implemented)', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { resourceRoutes: true },
          pluginCustom: { resourceRoutes: { SomeMethod: { Uri: 'http://x' } } },
        }),
      ).toEqual([])
    })

    it('does not treat websocketPort or albPort as unsupported', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { websocketPort: 3001 },
          pluginCustom: { albPort: 3003 },
        }),
      ).toEqual([])
    })

    it('deduplicates keys present in both sources', () => {
      expect(
        collectUnsupportedKeys({
          cliOptions: { preLoadModules: ['a'] },
          pluginCustom: { preLoadModules: ['b'] },
        }),
      ).toEqual(['preLoadModules'])
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
          cliOptions: { preLoadModules: undefined },
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
