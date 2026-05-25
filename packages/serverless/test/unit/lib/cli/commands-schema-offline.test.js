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

  it('exposes the basic runtime-knob options as CLI flags', () => {
    expect(entry.options).toMatchObject({
      appPort: { type: 'string' },
      awsApiPort: { type: 'string' },
      host: { type: 'string' },
      noTimeout: { type: 'boolean' },
      watch: { type: 'boolean' },
      noWatch: { type: 'boolean' },
    })
  })

  it('every option has a non-empty usage string for sls --help', () => {
    for (const [name, def] of Object.entries(entry.options)) {
      expect(typeof def.usage).toBe('string')
      expect(def.usage.length).toBeGreaterThan(0)
      // Make sure the usage text is the one we wrote, not a placeholder.
      expect(def.usage).not.toBe(name)
    }
  })
})
