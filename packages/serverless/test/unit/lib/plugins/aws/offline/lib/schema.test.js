import offlineSchema from '../../../../../../../lib/plugins/aws/offline/lib/schema.js'

describe('offline schema', () => {
  it('is an object type', () => {
    expect(offlineSchema.type).toBe('object')
  })

  it('rejects unknown top-level keys', () => {
    expect(offlineSchema.additionalProperties).toBe(false)
  })

  it('starts with an empty properties map (later milestones add keys)', () => {
    expect(offlineSchema.properties).toEqual({})
  })
})
