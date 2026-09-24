import { describe, expect, it } from '@jest/globals'

const { default: PluginManager } =
  await import('../../../../lib/classes/plugin-manager.js')

const managerFor = (build) => new PluginManager({ service: { build } })

const legacyBundler = () => {
  class Plugin {}
  Plugin._serverlessExternalPluginName = 'serverless-esbuild'
  return Plugin
}

describe('PluginManager: legacy bundler next to the built-in esbuild', () => {
  it('rejects the plugin with a config error that has no stack trace', () => {
    let error
    try {
      managerFor(undefined).addPlugin(legacyBundler())
    } catch (caught) {
      error = caught
    }
    expect(error.code).toBe('PLUGIN_TYPESCRIPT_CONFLICT')
    expect(error.message).toContain(
      "conflicts with the plugin 'serverless-esbuild'",
    )
    expect(error.message).toContain("set 'build.esbuild' to false")
    expect(error.stack).toBeUndefined()
  })

  it('does not raise the conflict when build.esbuild is false', () => {
    let error
    try {
      managerFor({ esbuild: false }).addPlugin(legacyBundler())
    } catch (caught) {
      error = caught
    }
    expect(error?.code).not.toBe('PLUGIN_TYPESCRIPT_CONFLICT')
  })
})
