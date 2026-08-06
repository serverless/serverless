import { describe, it, expect } from '@jest/globals'
import { synthesizeFunctions } from '../../../../../../lib/plugins/aws/mcp/lib/synthesize-functions.js'

const server = {
  name: 'crm',
  server: 'src/server.mjs',
  timeout: 120,
  runtime: 'nodejs24.x',
  environment: { DB: 'orders' },
}

describe('synthesizeFunctions', () => {
  // Defense in depth against a name that resolves to a prototype accessor: a
  // null-prototype map cannot dispatch an assignment to a setter.
  it('returns a null-prototype map', () => {
    const fns = synthesizeFunctions({
      servers: [server],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(Object.getPrototypeOf(fns)).toBeNull()
  })

  it('builds one function per server with explicit name and runtime', () => {
    const fns = synthesizeFunctions({
      servers: [server],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(fns.crm).toEqual(
      expect.objectContaining({
        name: 'acme-dev-crm',
        runtime: 'nodejs24.x',
        timeout: 120,
        handler: 'src/server.default',
      }),
    )
  })

  it('sets the framework env namespace and merges user environment', () => {
    const fns = synthesizeFunctions({
      servers: [server],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(fns.crm.environment).toEqual({
      DB: 'orders',
      SERVERLESS_MCP_SERVER_MODULE: 'src/server.mjs',
    })
  })

  // Authorization is the API Gateway authorizer's and the server module's
  // business now: nothing about the issuer or its audiences is handed to the
  // entry, so a fully authorized server's environment is no different.
  it('writes no auth environment for an authorized server publishing discovery', () => {
    const fns = synthesizeFunctions({
      servers: [
        {
          ...server,
          authorizer: { name: 'jwt' },
          oauthDiscovery: {
            issuer: 'https://acme.auth0.com',
            publicUrl: 'https://mcp.acme.com',
          },
        },
      ],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(fns.crm.environment).toEqual({
      DB: 'orders',
      SERVERLESS_MCP_SERVER_MODULE: 'src/server.mjs',
    })
  })

  // The handler points at the user's module minus its extension, and the
  // extension set has to match the one the esbuild plugin recognizes - otherwise
  // the extension survives into the handler and the function is silently
  // misconfigured.
  it.each([
    ['src/app.mjs', 'src/app.default'],
    ['src/app.cjs', 'src/app.default'],
    ['src/app.js', 'src/app.default'],
    ['src/app.ts', 'src/app.default'],
    ['src/app.mts', 'src/app.default'],
    ['src/app.cts', 'src/app.default'],
    ['src/app.jsx', 'src/app.default'],
    ['src/app.tsx', 'src/app.default'],
  ])('derives the handler for %s', (serverPath, expected) => {
    const fns = synthesizeFunctions({
      servers: [{ ...server, server: serverPath }],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(fns.crm.handler).toBe(expected)
  })

  // The module path is the binding between the synthesized function and the
  // user's server; a user-supplied environment entry must not be able to
  // repoint it.
  it('wins over a user environment entry for the framework namespace', () => {
    const fns = synthesizeFunctions({
      servers: [
        {
          ...server,
          environment: {
            ...server.environment,
            SERVERLESS_MCP_SERVER_MODULE: 'src/attacker.mjs',
          },
        },
      ],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(fns.crm.environment.SERVERLESS_MCP_SERVER_MODULE).toBe(
      'src/server.mjs',
    )
  })
})
