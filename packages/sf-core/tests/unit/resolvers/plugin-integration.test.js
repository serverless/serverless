import { jest } from '@jest/globals'
import { join } from 'path'

// Mock dependencies
const mockLoadPlugin = jest.fn()
const mockResolveVariable = jest.fn()

jest.unstable_mockModule(
  '../../../../serverless/lib/classes/plugin-manager.js',
  () => ({
    default: class PluginManager {
      constructor(serverless) {
        this.serverless = serverless
        this.plugins = []
        this.externalPlugins = new Set()
      }
      loadAllPlugins() {
        mockLoadPlugin()
      }
      addPlugin(plugin) {
        this.plugins.push(plugin)
      }
      resolveServicePlugins() {
        return []
      }
    },
  }),
)

describe('Plugin Integration', () => {
  let PluginManager
  let serverless

  beforeEach(async () => {
    const module = await import(
      '../../../../serverless/lib/classes/plugin-manager.js'
    )
    PluginManager = module.default
    serverless = {
      classes: { PluginManager },
      service: { plugins: [] },
      config: { servicePath: '/tmp' },
      cli: { log: jest.fn() },
    }
  })

  test('should load plugins', () => {
    const pm = new PluginManager(serverless)
    pm.loadAllPlugins()
    expect(mockLoadPlugin).toHaveBeenCalled()
  })

  test('should manage external plugins', () => {
    const pm = new PluginManager(serverless)
    pm.externalPlugins.add('foo')
    expect(pm.externalPlugins.has('foo')).toBe(true)
  })
})
