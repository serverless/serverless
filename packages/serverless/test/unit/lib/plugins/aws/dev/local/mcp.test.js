import { describe, expect, test } from '@jest/globals'
import {
  localMcpVariables,
  mcpServersOf,
} from '../../../../../../../lib/plugins/aws/dev/local/mcp.js'

const crmServer = { name: 'crm', server: 'src/server.mjs' }
const esbuildLike = (extension) => ({
  functions: async () => ({ crm: {} }),
  _buildProperties: async () => ({}),
  _outputExtension: () => extension,
})
const serverlessWith = ({ servers = [crmServer], plugins = [] } = {}) => ({
  pluginManager: { plugins: [{ validated: { servers } }, ...plugins] },
})
const crm = { handler: 'src/server.default' }

describe('mcpServersOf', () => {
  // A function config key is a public surface: only the mcp plugin's own registry says which
  // functions are MCP servers.
  test("follows the mcp plugin's registry", () => {
    const servers = mcpServersOf(serverlessWith())
    expect(servers.has('crm')).toBe(true)
    expect(servers.has('plain')).toBe(false)
  })

  test('is empty without the mcp plugin, and never throws', () => {
    expect(mcpServersOf({ pluginManager: { plugins: [{}] } }).size).toBe(0)
    expect(mcpServersOf({}).size).toBe(0)
    expect(
      mcpServersOf({
        pluginManager: {
          get plugins() {
            throw new Error('boom')
          },
        },
      }).size,
    ).toBe(0)
  })
})

describe('localMcpVariables', () => {
  test('names the emitted file for a bundled MCP function', async () => {
    expect(
      await localMcpVariables({
        serverless: serverlessWith({ plugins: [esbuildLike('.js')] }),
        functionKey: 'crm',
        functionConfig: crm,
        built: true,
      }),
    ).toEqual({ SERVERLESS_MCP_SERVER_MODULE: 'src/server.js' })
  })

  test('follows the configured outExtension', async () => {
    expect(
      await localMcpVariables({
        serverless: serverlessWith({ plugins: [esbuildLike('.mjs')] }),
        functionKey: 'crm',
        functionConfig: crm,
        built: true,
      }),
    ).toEqual({ SERVERLESS_MCP_SERVER_MODULE: 'src/server.mjs' })
  })

  test('adds nothing in classic mode, without a bundler, or for a plain function', async () => {
    expect(
      await localMcpVariables({
        serverless: serverlessWith({ plugins: [esbuildLike('.js')] }),
        functionKey: 'crm',
        functionConfig: crm,
      }),
    ).toEqual({})
    expect(
      await localMcpVariables({
        serverless: serverlessWith(),
        functionKey: 'crm',
        functionConfig: crm,
        built: true,
      }),
    ).toEqual({})
    expect(
      await localMcpVariables({
        serverless: serverlessWith({ plugins: [esbuildLike('.js')] }),
        functionKey: 'plain',
        functionConfig: { handler: 'handler.hello' },
        built: true,
      }),
    ).toEqual({})
  })
})
