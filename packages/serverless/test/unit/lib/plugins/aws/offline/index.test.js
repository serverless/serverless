import { jest } from '@jest/globals'
import OfflinePlugin, {
  resolveOfflineOptions,
  buildProxyBannerLines,
} from '../../../../../../lib/plugins/aws/offline/index.js'

const makeServerless = () => ({
  configSchemaHandler: {
    defineTopLevelProperty: jest.fn(),
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
  it('does not register the offline top-level schema (the shell owns it)', () => {
    const sls = makeServerless()
    new OfflinePlugin(sls, {})
    expect(
      sls.configSchemaHandler.defineTopLevelProperty,
    ).not.toHaveBeenCalled()
  })

  it('stores serverless, options, aws provider', () => {
    const sls = makeServerless()
    const plugin = new OfflinePlugin(sls, { appPort: 4000 })
    expect(plugin.serverless).toBe(sls)
    expect(plugin.options).toEqual({ appPort: 4000 })
    expect(plugin.provider).toEqual({ name: 'aws' })
  })

  it('declares a hook for offline:offline', () => {
    const sls = makeServerless()
    const plugin = new OfflinePlugin(sls, {})
    expect(typeof plugin.hooks['offline:offline']).toBe('function')
  })

  it('throws OFFLINE_PORT_COLLISION when appPort and awsApiPort resolve to the same value', async () => {
    const sls = makeServerless()
    // Both flags point to the same port — guard must fire before either
    // Hapi server is constructed (the second .listen() would otherwise fail
    // with an opaque EADDRINUSE from somewhere deep inside Hapi).
    const plugin = new OfflinePlugin(sls, {
      appPort: '4000',
      awsApiPort: '4000',
    })

    await expect(plugin.hooks['offline:offline']()).rejects.toMatchObject({
      code: 'OFFLINE_PORT_COLLISION',
      message: expect.stringContaining('4000'),
    })
  })

  it('throws OFFLINE_PORT_COLLISION when defaults collide because user matched one via flag', async () => {
    // The default appPort is 3000 and awsApiPort is 3002. A user who passes
    // --awsApiPort 3000 (matching the default appPort) hits the collision.
    const sls = makeServerless()
    const plugin = new OfflinePlugin(sls, { awsApiPort: '3000' })

    await expect(plugin.hooks['offline:offline']()).rejects.toMatchObject({
      code: 'OFFLINE_PORT_COLLISION',
    })
  })
})

describe('resolveOfflineOptions', () => {
  it('resolves option-parity defaults when CLI and YAML omit them', () => {
    const resolved = resolveOfflineOptions({ cliOptions: {}, offline: {} })
    // The cors* overrides are left undefined by default so each route's own
    // `cors` config (and its AWS-correct defaults) is used as-is; they only
    // take effect when the user explicitly sets them.
    expect(resolved.corsAllowHeaders).toBeUndefined()
    expect(resolved.corsAllowOrigin).toBeUndefined()
    expect(resolved.corsDisallowCredentials).toBeUndefined()
    expect(resolved.corsExposedHeaders).toBeUndefined()
    expect(resolved).toMatchObject({
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
      webSocketHardTimeout: 7200,
      webSocketIdleTimeout: 600,
    })
  })

  it('honors noTimeout from YAML and lets CLI override it', () => {
    expect(
      resolveOfflineOptions({ cliOptions: {}, offline: { noTimeout: true } })
        .noTimeout,
    ).toBe(true)
    expect(
      resolveOfflineOptions({
        cliOptions: { noTimeout: true },
        offline: {},
      }).noTimeout,
    ).toBe(true)
    expect(
      resolveOfflineOptions({ cliOptions: {}, offline: {} }).noTimeout,
    ).toBe(false)
  })

  it('lets CLI values override YAML values for option-parity flags', () => {
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
        offline: {
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

  it('uses YAML docker option values when CLI values are omitted', () => {
    expect(
      resolveOfflineOptions({
        cliOptions: {},
        offline: {
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

  it('resolves proxyToAws: default false, "unsupported" honored, anything else false', () => {
    expect(resolveOfflineOptions({}).proxyToAws).toBe(false)
    expect(
      resolveOfflineOptions({ offline: { proxyToAws: 'unsupported' } })
        .proxyToAws,
    ).toBe('unsupported')
    expect(
      resolveOfflineOptions({ cliOptions: { proxyToAws: 'unsupported' } })
        .proxyToAws,
    ).toBe('unsupported')
    expect(
      resolveOfflineOptions({
        cliOptions: { proxyToAws: 'unsupported' },
        offline: { proxyToAws: false },
      }).proxyToAws,
    ).toBe('unsupported')
    expect(
      resolveOfflineOptions({ cliOptions: { proxyToAws: 'true' } }).proxyToAws,
    ).toBe(false)
    expect(
      resolveOfflineOptions({ offline: { proxyToAws: 'nope' } }).proxyToAws,
    ).toBe(false)
  })
})

describe('buildProxyBannerLines', () => {
  it('off → no lines', () => {
    expect(buildProxyBannerLines({ proxyToAws: false })).toEqual([])
  })

  it('unsupported with creds → account + region + real-AWS warning', () => {
    const text = buildProxyBannerLines({
      proxyToAws: 'unsupported',
      accountId: '123456789012',
      region: 'us-east-1',
    }).join('\n')
    expect(text).toContain('123456789012')
    expect(text).toContain('us-east-1')
    expect(text.toLowerCase()).toContain('real aws')
  })

  it('unsupported without creds → unavailable note', () => {
    const text = buildProxyBannerLines({
      proxyToAws: 'unsupported',
      accountId: null,
      region: 'us-east-1',
    }).join('\n')
    expect(text.toLowerCase()).toContain('unavailable')
  })
})
