import offlineSchema from '../../../../../../../lib/plugins/aws/offline/lib/schema.js'

describe('offline schema', () => {
  it('is an object type', () => {
    expect(offlineSchema.type).toBe('object')
  })

  it('rejects unknown top-level keys', () => {
    expect(offlineSchema.additionalProperties).toBe(false)
  })

  it('defines all top-level properties', () => {
    expect(offlineSchema.properties).toEqual({
      appPort: { type: 'integer', minimum: 1, maximum: 65535 },
      corsAllowHeaders: { type: 'string' },
      corsAllowOrigin: { type: 'string' },
      corsDisallowCredentials: { type: 'boolean' },
      corsExposedHeaders: { type: 'string' },
      customAuthenticationProvider: { type: 'string' },
      disableCookieValidation: { type: 'boolean' },
      dockerHost: { type: 'string' },
      dockerHostServicePath: { type: 'string' },
      dockerNetwork: { type: 'string' },
      dockerReadOnly: { type: 'boolean' },
      enforceSecureCookies: { type: 'boolean' },
      host: { type: 'string' },
      httpsProtocol: { type: 'string' },
      ignoreJWTSignature: { type: 'boolean' },
      lambdaPort: { type: 'integer', minimum: 1, maximum: 65535 },
      layersDir: { type: 'string' },
      localEnvironment: { type: 'boolean' },
      noAuth: { type: 'boolean' },
      noPrependStageInUrl: { type: 'boolean' },
      noTimeout: { type: 'boolean' },
      noWatch: { type: 'boolean' },
      prefix: { type: 'string' },
      terminateIdleLambdaTime: { type: 'integer', minimum: 0 },
      useDocker: { type: 'boolean' },
      useInProcess: { type: 'boolean' },
      watch: { type: 'boolean' },
      webSocketHardTimeout: { type: 'integer', minimum: 1 },
      webSocketIdleTimeout: { type: 'integer', minimum: 1 },
    })
  })

  it('declares the 29 expected keys at the top level', () => {
    expect(Object.keys(offlineSchema.properties).sort()).toEqual([
      'appPort',
      'corsAllowHeaders',
      'corsAllowOrigin',
      'corsDisallowCredentials',
      'corsExposedHeaders',
      'customAuthenticationProvider',
      'disableCookieValidation',
      'dockerHost',
      'dockerHostServicePath',
      'dockerNetwork',
      'dockerReadOnly',
      'enforceSecureCookies',
      'host',
      'httpsProtocol',
      'ignoreJWTSignature',
      'lambdaPort',
      'layersDir',
      'localEnvironment',
      'noAuth',
      'noPrependStageInUrl',
      'noTimeout',
      'noWatch',
      'prefix',
      'terminateIdleLambdaTime',
      'useDocker',
      'useInProcess',
      'watch',
      'webSocketHardTimeout',
      'webSocketIdleTimeout',
    ])
  })

  it('declares option-parity boolean keys with type: boolean', () => {
    for (const key of [
      'corsDisallowCredentials',
      'disableCookieValidation',
      'dockerReadOnly',
      'enforceSecureCookies',
      'ignoreJWTSignature',
      'localEnvironment',
      'noAuth',
      'useDocker',
    ]) {
      expect(offlineSchema.properties[key]).toEqual({ type: 'boolean' })
    }
  })

  it('declares option-parity string keys with type: string', () => {
    for (const key of [
      'corsAllowHeaders',
      'corsAllowOrigin',
      'corsExposedHeaders',
      'dockerHost',
      'dockerHostServicePath',
      'dockerNetwork',
      'httpsProtocol',
    ]) {
      expect(offlineSchema.properties[key]).toEqual({ type: 'string' })
    }
  })

  it('declares websocket timeout keys with type: integer and minimum 1', () => {
    expect(offlineSchema.properties.webSocketHardTimeout).toEqual({
      type: 'integer',
      minimum: 1,
    })
    expect(offlineSchema.properties.webSocketIdleTimeout).toEqual({
      type: 'integer',
      minimum: 1,
    })
  })

  it('schema includes customAuthenticationProvider as a string', () => {
    expect(offlineSchema.properties.customAuthenticationProvider).toEqual({
      type: 'string',
    })
  })

  it('accepts prefix and noPrependStageInUrl', () => {
    expect(offlineSchema.properties.prefix).toEqual({ type: 'string' })
    expect(offlineSchema.properties.noPrependStageInUrl).toEqual({
      type: 'boolean',
    })
  })

  it('accepts valid port values for lambdaPort and appPort', () => {
    expect(offlineSchema.properties.lambdaPort).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 65535,
    })
    expect(offlineSchema.properties.appPort).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 65535,
    })
    // Spot-check that the defaults fit within the schema constraints.
    expect(3002).toBeGreaterThanOrEqual(
      offlineSchema.properties.lambdaPort.minimum,
    )
    expect(3002).toBeLessThanOrEqual(
      offlineSchema.properties.lambdaPort.maximum,
    )
    expect(3000).toBeGreaterThanOrEqual(
      offlineSchema.properties.appPort.minimum,
    )
    expect(3000).toBeLessThanOrEqual(offlineSchema.properties.appPort.maximum)
  })

  it('defines host as a string property', () => {
    expect(offlineSchema.properties.host).toEqual({ type: 'string' })
  })

  it('defines watch as a boolean property', () => {
    expect(offlineSchema.properties.watch).toEqual({ type: 'boolean' })
  })

  it('defines noWatch as a boolean property', () => {
    expect(offlineSchema.properties.noWatch).toEqual({ type: 'boolean' })
  })

  it('defines terminateIdleLambdaTime as a non-negative integer property', () => {
    expect(offlineSchema.properties.terminateIdleLambdaTime).toEqual({
      type: 'integer',
      minimum: 0,
    })
  })

  it('defines useInProcess as a boolean property', () => {
    expect(offlineSchema.properties.useInProcess).toEqual({ type: 'boolean' })
  })
})
