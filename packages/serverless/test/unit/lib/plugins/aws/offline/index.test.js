import { jest } from '@jest/globals'
import OfflinePlugin, {
  resolveOfflineOptions,
  hasAlbEvents,
} from '../../../../../../lib/plugins/aws/offline/index.js'
import { CUSTOM_SERVERLESS_OFFLINE_SCHEMA } from '../../../../../../lib/plugins/aws/offline/lib/plugin-compat.js'

const makeServerless = () => ({
  configSchemaHandler: {
    defineTopLevelProperty: jest.fn(),
    defineCustomProperties: jest.fn(),
  },
  getProvider: jest.fn(() => ({ name: 'aws' })),
  pluginManager: {
    hooks: {},
  },
  service: {
    provider: { name: 'aws', stage: 'dev' },
    functions: {},
  },
})

describe('OfflinePlugin', () => {
  it('does not register a top-level offline schema', () => {
    const sls = makeServerless()
    new OfflinePlugin(sls, {})
    expect(
      sls.configSchemaHandler.defineTopLevelProperty,
    ).not.toHaveBeenCalled()
  })

  it('registers permissive custom.serverless-offline and custom.offline schemas', () => {
    const sls = makeServerless()
    new OfflinePlugin(sls, {})
    expect(
      sls.configSchemaHandler.defineCustomProperties,
    ).toHaveBeenCalledTimes(1)
    expect(sls.configSchemaHandler.defineCustomProperties).toHaveBeenCalledWith(
      {
        properties: {
          'serverless-offline': CUSTOM_SERVERLESS_OFFLINE_SCHEMA,
          // `customAuthenticationProvider` lives under custom.offline (plugin
          // parity), so that block is registered permissively too.
          offline: { type: 'object', additionalProperties: true },
        },
      },
    )
  })

  it('does not throw when the config schema handler is absent', () => {
    expect(
      () =>
        new OfflinePlugin(
          {
            getProvider: jest.fn(() => ({ name: 'aws' })),
            pluginManager: { hooks: {} },
            service: { provider: { name: 'aws' }, functions: {} },
          },
          {},
        ),
    ).not.toThrow()
  })

  it('stores serverless, options, aws provider', () => {
    const sls = makeServerless()
    const plugin = new OfflinePlugin(sls, { httpPort: 4000 })
    expect(plugin.serverless).toBe(sls)
    expect(plugin.options).toEqual({ httpPort: 4000 })
    expect(plugin.provider).toEqual({ name: 'aws' })
  })

  it('declares a hook for offline:offline', () => {
    const sls = makeServerless()
    const plugin = new OfflinePlugin(sls, {})
    expect(typeof plugin.hooks['offline:offline']).toBe('function')
  })

  it('throws OFFLINE_PORT_COLLISION when httpPort and lambdaPort resolve to the same value', async () => {
    const sls = makeServerless()
    // Both flags point to the same port — guard must fire before either
    // Hapi server is constructed (the second .listen() would otherwise fail
    // with an opaque EADDRINUSE from somewhere deep inside Hapi).
    const plugin = new OfflinePlugin(sls, {
      httpPort: '4000',
      lambdaPort: '4000',
    })

    await expect(plugin.hooks['offline:offline']()).rejects.toMatchObject({
      code: 'OFFLINE_PORT_COLLISION',
      message: expect.stringContaining('4000'),
    })
  })

  it('throws OFFLINE_PORT_COLLISION when defaults collide because user matched one via flag', async () => {
    // The default httpPort is 3000 and lambdaPort is 3002. A user who passes
    // --lambdaPort 3000 (matching the default httpPort) hits the collision.
    const sls = makeServerless()
    const plugin = new OfflinePlugin(sls, { lambdaPort: '3000' })

    await expect(plugin.hooks['offline:offline']()).rejects.toMatchObject({
      code: 'OFFLINE_PORT_COLLISION',
    })
  })
})

describe('resolveOfflineOptions', () => {
  it('resolves option-parity defaults when CLI and custom omit them', () => {
    const resolved = resolveOfflineOptions({
      cliOptions: {},
      pluginCustom: {},
    })
    // The cors* overrides are left undefined by default so each route's own
    // `cors` config (and its AWS-correct defaults) is used as-is; they only
    // take effect when the user explicitly sets them.
    expect(resolved.corsAllowHeaders).toBeUndefined()
    expect(resolved.corsAllowOrigin).toBeUndefined()
    expect(resolved.corsDisallowCredentials).toBeUndefined()
    expect(resolved.corsExposedHeaders).toBeUndefined()
    expect(resolved).toMatchObject({
      httpPort: 3000,
      websocketPort: 3001,
      lambdaPort: 3002,
      albPort: 3003,
      disableCookieValidation: false,
      dockerHost: 'host.docker.internal',
      dockerHostServicePath: null,
      dockerNetwork: null,
      dockerReadOnly: true,
      enforceSecureCookies: false,
      httpsProtocol: undefined,
      ignoreJWTSignature: false,
      localEnvironment: false,
      noAuth: false,
      noTimeout: false,
      useDocker: false,
      watchEnabled: false,
      webSocketHardTimeout: 7200,
      webSocketIdleTimeout: 600,
    })
  })

  describe('httpPort', () => {
    it('reads httpPort from CLI options', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: { httpPort: '4000' },
          pluginCustom: {},
        }).httpPort,
      ).toBe(4000)
    })

    it('reads httpPort from custom config', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: {},
          pluginCustom: { httpPort: 4000 },
        }).httpPort,
      ).toBe(4000)
    })

    it('lets a CLI httpPort beat a custom httpPort', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: { httpPort: '5000' },
          pluginCustom: { httpPort: 4000 },
        }).httpPort,
      ).toBe(5000)
    })
  })

  describe('websocketPort', () => {
    it('defaults to 3001', () => {
      expect(
        resolveOfflineOptions({ cliOptions: {}, pluginCustom: {} })
          .websocketPort,
      ).toBe(3001)
    })

    it('reads websocketPort from CLI options', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: { websocketPort: '4001' },
          pluginCustom: {},
        }).websocketPort,
      ).toBe(4001)
    })

    it('reads websocketPort from custom config', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: {},
          pluginCustom: { websocketPort: 4001 },
        }).websocketPort,
      ).toBe(4001)
    })

    it('lets a CLI websocketPort beat a custom websocketPort', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: { websocketPort: '5001' },
          pluginCustom: { websocketPort: 4001 },
        }).websocketPort,
      ).toBe(5001)
    })
  })

  describe('albPort', () => {
    it('defaults to 3003', () => {
      expect(
        resolveOfflineOptions({ cliOptions: {}, pluginCustom: {} }).albPort,
      ).toBe(3003)
    })

    it('reads albPort from CLI options', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: { albPort: '4003' },
          pluginCustom: {},
        }).albPort,
      ).toBe(4003)
    })

    it('reads albPort from custom config', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: {},
          pluginCustom: { albPort: 4003 },
        }).albPort,
      ).toBe(4003)
    })

    it('lets a CLI albPort beat a custom albPort', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: { albPort: '5003' },
          pluginCustom: { albPort: 4003 },
        }).albPort,
      ).toBe(5003)
    })
  })

  describe('precedence', () => {
    it('honors noTimeout from custom and lets CLI override it', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: {},
          pluginCustom: { noTimeout: true },
        }).noTimeout,
      ).toBe(true)
      expect(
        resolveOfflineOptions({
          cliOptions: { noTimeout: true },
          pluginCustom: {},
        }).noTimeout,
      ).toBe(true)
      expect(
        resolveOfflineOptions({ cliOptions: {}, pluginCustom: {} }).noTimeout,
      ).toBe(false)
    })

    it('lets CLI values override custom values for option-parity flags', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: {
            corsAllowOrigin: 'https://cli.example.com',
            dockerHost: 'cli.docker.internal',
            dockerHostServicePath: '/cli-service',
            dockerNetwork: 'cli-network',
            dockerReadOnly: false,
            ignoreJWTSignature: true,
            useDocker: true,
            webSocketHardTimeout: '30',
          },
          pluginCustom: {
            corsAllowOrigin: 'https://yaml.example.com',
            dockerHost: 'yaml.docker.internal',
            dockerHostServicePath: '/yaml-service',
            dockerNetwork: 'yaml-network',
            dockerReadOnly: true,
            ignoreJWTSignature: false,
            useDocker: false,
            webSocketHardTimeout: 60,
          },
        }),
      ).toMatchObject({
        corsAllowOrigin: 'https://cli.example.com',
        dockerHost: 'cli.docker.internal',
        dockerHostServicePath: '/cli-service',
        dockerNetwork: 'cli-network',
        dockerReadOnly: false,
        ignoreJWTSignature: true,
        useDocker: true,
        webSocketHardTimeout: 30,
      })
    })

    it('uses custom docker option values when CLI values are omitted', () => {
      expect(
        resolveOfflineOptions({
          cliOptions: {},
          pluginCustom: {
            dockerHost: 'yaml.docker.internal',
            dockerHostServicePath: '/yaml-service',
            dockerNetwork: 'yaml-network',
            dockerReadOnly: false,
            useDocker: true,
          },
        }),
      ).toMatchObject({
        dockerHost: 'yaml.docker.internal',
        dockerHostServicePath: '/yaml-service',
        dockerNetwork: 'yaml-network',
        dockerReadOnly: false,
        useDocker: true,
      })
    })
  })

  describe('watchEnabled', () => {
    const watch = (cliOptions = {}, pluginCustom = {}) =>
      resolveOfflineOptions({ cliOptions, pluginCustom }).watchEnabled

    it('defaults OFF when no flags and no reloadHandler are set', () => {
      expect(watch()).toBe(false)
    })

    it('enables watch when cli.watch === true', () => {
      expect(watch({ watch: true })).toBe(true)
    })

    it('disables watch when cli.watch === false', () => {
      expect(watch({ watch: false })).toBe(false)
    })

    it('disables watch when cli.noWatch === true', () => {
      expect(watch({ noWatch: true })).toBe(false)
    })

    it('maps cli.reloadHandler === true to watch on', () => {
      expect(watch({ reloadHandler: true })).toBe(true)
    })

    it('maps cli.reloadHandler === false to watch off', () => {
      expect(watch({ reloadHandler: false })).toBe(false)
    })

    it('maps custom.reloadHandler === true to watch on', () => {
      expect(watch({}, { reloadHandler: true })).toBe(true)
    })

    it('maps custom.reloadHandler === false to watch off', () => {
      expect(watch({}, { reloadHandler: false })).toBe(false)
    })

    it('lets cli.watch beat custom.reloadHandler', () => {
      expect(watch({ watch: true }, { reloadHandler: false })).toBe(true)
      expect(watch({ watch: false }, { reloadHandler: true })).toBe(false)
    })

    it('lets cli.noWatch beat custom.reloadHandler', () => {
      expect(watch({ noWatch: true }, { reloadHandler: true })).toBe(false)
    })
  })

  it('does not throw when unsupported plugin keys are passed', () => {
    expect(() =>
      resolveOfflineOptions({
        cliOptions: {},
        pluginCustom: { resourceRoutes: {}, preLoadModules: [] },
      }),
    ).not.toThrow()
  })
})

describe('hasAlbEvents', () => {
  // The boot wiring only binds the dedicated ALB Hapi server when this
  // predicate is true, so a plain HTTP-only service never binds albPort or
  // prints an ALB banner line.
  it('returns true when any function declares an alb event', () => {
    expect(
      hasAlbEvents({
        service: {
          functions: {
            fn: { events: [{ alb: { conditions: { path: '/x' } } }] },
          },
        },
      }),
    ).toBe(true)
  })

  it('returns true when an alb event is mixed with other event types', () => {
    expect(
      hasAlbEvents({
        service: {
          functions: {
            http: { events: [{ httpApi: { method: 'GET', path: '/h' } }] },
            albFn: { events: [{ alb: { conditions: { path: '/a' } } }] },
          },
        },
      }),
    ).toBe(true)
  })

  it('returns false when no function declares an alb event', () => {
    expect(
      hasAlbEvents({
        service: {
          functions: {
            fn: {
              events: [
                { httpApi: { method: 'POST', path: '/echo' } },
                { websocket: { route: '$connect' } },
              ],
            },
          },
        },
      }),
    ).toBe(false)
  })

  it('returns false for a service with no functions', () => {
    expect(hasAlbEvents({ service: { functions: {} } })).toBe(false)
  })

  it('tolerates missing service / functions / events shapes', () => {
    expect(hasAlbEvents(undefined)).toBe(false)
    expect(hasAlbEvents({})).toBe(false)
    expect(hasAlbEvents({ service: {} })).toBe(false)
    expect(hasAlbEvents({ service: { functions: { fn: {} } } })).toBe(false)
    expect(
      hasAlbEvents({ service: { functions: { fn: { events: [null] } } } }),
    ).toBe(false)
  })
})
