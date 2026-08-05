import { describe, it, expect } from '@jest/globals'
import { synthesizeFunctions } from '../../../../../../lib/plugins/aws/mcp/lib/synthesize-functions.js'
// The two halves of the audience contract, exercised together below: the entry
// reads back what this module writes, so the encoding is only correct if a
// round trip through it is lossless.
import { readEntryEnv } from '../../../../../../lib/plugins/aws/mcp/entry/lib/compose.mjs'
import { checkAudience } from '../../../../../../lib/plugins/aws/mcp/entry/lib/auth.mjs'

const server = {
  name: 'crm',
  server: 'src/server.mjs',
  timeout: 120,
  runtime: 'nodejs24.x',
  environment: { DB: 'orders' },
  auth: {
    issuer: 'https://acme.auth0.com',
    audiences: ['https://mcp.acme.com', 'api://x'],
  },
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
      SERVERLESS_MCP_AUTH_ISSUER: 'https://acme.auth0.com',
      SERVERLESS_MCP_AUTH_AUDIENCES: '["https://mcp.acme.com","api://x"]',
    })
  })

  // An audience is an opaque string the issuer decides, and the schema accepts
  // any string - so a separator-carrying value has to survive the trip into the
  // environment. A delimited list cannot carry it: the entry would read two
  // audiences and accept tokens for values nobody configured.
  describe('an audience that contains the list separator', () => {
    const commaServer = {
      ...server,
      auth: { ...server.auth, audiences: ['api://foo,bar'] },
    }

    it('is carried as JSON rather than a delimited list', () => {
      const fns = synthesizeFunctions({
        servers: [commaServer],
        serviceName: 'acme',
        stage: 'dev',
      })
      expect(fns.crm.environment.SERVERLESS_MCP_AUTH_AUDIENCES).toBe(
        '["api://foo,bar"]',
      )
    })

    it('reaches the entry as one audience, matched whole', () => {
      const fns = synthesizeFunctions({
        servers: [commaServer],
        serviceName: 'acme',
        stage: 'dev',
      })
      const { auth } = readEntryEnv(fns.crm.environment)
      expect(auth.audiences).toEqual(['api://foo,bar'])
      expect(() =>
        checkAudience({ aud: 'api://foo,bar' }, auth.audiences),
      ).not.toThrow()
      // The halves of the configured value are not audiences of their own.
      for (const half of ['api://foo', 'bar']) {
        expect(() => checkAudience({ aud: half }, auth.audiences)).toThrow(
          /matches none/,
        )
      }
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

  it('omits auth env vars when auth is unset', () => {
    const fns = synthesizeFunctions({
      servers: [{ ...server, auth: undefined }],
      serviceName: 'acme',
      stage: 'dev',
    })
    expect(fns.crm.environment.SERVERLESS_MCP_AUTH_ISSUER).toBeUndefined()
  })
})
