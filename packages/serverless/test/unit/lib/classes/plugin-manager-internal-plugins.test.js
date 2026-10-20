import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'

const { default: Serverless } = await import('../../../../lib/serverless.js')
const { default: PluginManager } =
  await import('../../../../lib/classes/plugin-manager.js')
const { default: AwsLogs } = await import('../../../../lib/plugins/aws/logs.js')
const { default: AwsLogsAgent } =
  await import('../../../../lib/plugins/aws/logs-agent.js')
const { default: AwsLogsSandbox } =
  await import('../../../../lib/plugins/aws/logs-sandbox.js')
const { default: AwsLogsWebApp } =
  await import('../../../../lib/plugins/aws/logs-web-app.js')

/**
 * The duplicate-plugin check rejects a plugin when an already loaded plugin
 * is an `instanceof` its class. As long as no internal plugin is an instance
 * of another internal plugin's class, the order of the internal plugin list
 * cannot matter.
 */
describe('PluginManager: internal plugins', () => {
  let serviceDir
  let serverless

  beforeAll(async () => {
    serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-plugins-'))
    serverless = new Serverless({
      commands: ['logs'],
      options: {},
      servicePath: serviceDir,
      serviceConfigFileName: 'serverless.yml',
      service: {
        service: 'internal-plugins',
        provider: { name: 'aws', region: 'us-east-1' },
      },
      credentialProviders: { aws: { getCredentials: async () => ({}) } },
    })
    await serverless.init()
  }, 60000)

  afterAll(() => {
    fs.rmSync(serviceDir, { recursive: true, force: true })
  })

  it('loads the full internal list, including every logs plugin', () => {
    const classes = serverless.pluginManager
      .getPlugins()
      .map((plugin) => plugin.constructor)
    for (const Plugin of [AwsLogs, AwsLogsAgent, AwsLogsSandbox, AwsLogsWebApp])
      expect(classes).toContain(Plugin)
  })

  it('has no plugin that is an instance of another plugin class', () => {
    const plugins = serverless.pluginManager.getPlugins()
    const overlaps = plugins.flatMap((plugin) =>
      plugins
        .filter(
          (other) =>
            other !== plugin &&
            other.constructor !== plugin.constructor &&
            plugin instanceof other.constructor,
        )
        .map(
          (other) => `${plugin.constructor.name} -> ${other.constructor.name}`,
        ),
    )
    expect(overlaps).toEqual([])
  })

  it.each([
    ['functions first', [AwsLogs, AwsLogsAgent, AwsLogsSandbox, AwsLogsWebApp]],
    ['web apps first', [AwsLogsWebApp, AwsLogsSandbox, AwsLogsAgent, AwsLogs]],
  ])('loads the logs plugins in either order (%s)', (_, order) => {
    const pluginManager = new PluginManager(serverless)
    pluginManager.setCliOptions({})
    pluginManager.setCliCommands(['logs'])
    for (const Plugin of order) pluginManager.addPlugin(Plugin)
    expect(
      pluginManager.getPlugins().map((plugin) => plugin.constructor),
    ).toEqual(order)
  })
})
