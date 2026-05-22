import commandsSchema from '../../../../lib/cli/commands-schema.js'

describe('commands-schema offline entry', () => {
  const entry = commandsSchema.get('offline')

  it('registers the offline command', () => {
    expect(entry).toBeDefined()
  })

  it('declares the offline lifecycle event', () => {
    expect(entry.lifecycleEvents).toEqual(['offline'])
  })

  it('requires a service to be present', () => {
    expect(entry.serviceDependencyMode).toBe('required')
  })

  it('participates in the aws provider extension chain', () => {
    expect(entry.hasAwsExtension).toBe(true)
  })

  it('provides a usage string', () => {
    expect(typeof entry.usage).toBe('string')
    expect(entry.usage.length).toBeGreaterThan(0)
  })

  it('belongs to the main command group in `sls help` output', () => {
    expect(entry.groupName).toBe('main')
  })
})
