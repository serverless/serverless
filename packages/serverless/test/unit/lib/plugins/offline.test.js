import { jest } from '@jest/globals'
import Offline from '../../../../lib/plugins/offline.js'
import cliCommandsSchema from '../../../../lib/cli/commands-schema.js'
import offlineSchema from '../../../../lib/plugins/aws/offline/lib/schema.js'

describe('Offline top-level command plugin', () => {
  it('registers the offline command with the runtime plugin manager', () => {
    const plugin = new Offline({})
    expect(plugin.commands.offline).toBeDefined()
  })

  it('mirrors the static commands-schema entry for offline', () => {
    const plugin = new Offline({})
    expect(plugin.commands.offline).toEqual({
      ...cliCommandsSchema.get('offline'),
    })
  })

  it('stores the serverless instance', () => {
    const fakeServerless = { service: {} }
    const plugin = new Offline(fakeServerless)
    expect(plugin.serverless).toBe(fakeServerless)
  })

  it('registers the offline top-level schema once', () => {
    const defineTopLevelProperty = jest.fn()
    new Offline({ configSchemaHandler: { defineTopLevelProperty } })
    expect(defineTopLevelProperty).toHaveBeenCalledTimes(1)
    expect(defineTopLevelProperty).toHaveBeenCalledWith(
      'offline',
      offlineSchema,
    )
  })
})
