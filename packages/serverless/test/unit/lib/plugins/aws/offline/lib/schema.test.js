import offlineSchema from '../../../../../../../lib/plugins/aws/offline/lib/schema.js'

describe('offline schema', () => {
  it('is an object type', () => {
    expect(offlineSchema.type).toBe('object')
  })

  it('rejects unknown top-level keys', () => {
    expect(offlineSchema.additionalProperties).toBe(false)
  })

  it('defines all six top-level properties', () => {
    expect(offlineSchema.properties).toEqual({
      awsApiPort: { type: 'integer', minimum: 1, maximum: 65535 },
      appPort: { type: 'integer', minimum: 1, maximum: 65535 },
      host: { type: 'string' },
      watch: { type: 'boolean' },
      noWatch: { type: 'boolean' },
      terminateIdleLambdaTime: { type: 'integer', minimum: 0 },
    })
  })

  it('accepts valid port values for awsApiPort and appPort', () => {
    expect(offlineSchema.properties.awsApiPort).toEqual({
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
      offlineSchema.properties.awsApiPort.minimum,
    )
    expect(3002).toBeLessThanOrEqual(
      offlineSchema.properties.awsApiPort.maximum,
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
})
