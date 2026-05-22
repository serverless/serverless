import offlineSchema from '../../../../../../../lib/plugins/aws/offline/lib/schema.js'

describe('offline schema', () => {
  it('is an object type', () => {
    expect(offlineSchema.type).toBe('object')
  })

  it('rejects unknown top-level keys', () => {
    expect(offlineSchema.additionalProperties).toBe(false)
  })

  it('defines appPort and awsApiPort properties', () => {
    expect(offlineSchema.properties).toEqual({
      awsApiPort: { type: 'integer', minimum: 1, maximum: 65535 },
      appPort: { type: 'integer', minimum: 1, maximum: 65535 },
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
})
