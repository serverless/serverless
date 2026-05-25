import { jest } from '@jest/globals'
import OfflinePlugin from '../../../../../../lib/plugins/aws/offline/index.js'
import offlineSchema from '../../../../../../lib/plugins/aws/offline/lib/schema.js'

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
  it('registers the offline top-level schema exactly once', () => {
    const sls = makeServerless()
    new OfflinePlugin(sls, {})
    expect(
      sls.configSchemaHandler.defineTopLevelProperty,
    ).toHaveBeenCalledTimes(1)
    expect(sls.configSchemaHandler.defineTopLevelProperty).toHaveBeenCalledWith(
      'offline',
      offlineSchema,
    )
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
