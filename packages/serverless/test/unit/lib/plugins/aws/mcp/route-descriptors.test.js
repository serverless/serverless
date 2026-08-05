import { describe, it, expect } from '@jest/globals'
import { buildRouteDescriptors } from '../../../../../../lib/plugins/aws/mcp/lib/route-descriptors.js'

const base = { name: 'crm', timeout: 120 }

describe('buildRouteDescriptors', () => {
  it('emits one ANY streaming route per server without auth', () => {
    const events = buildRouteDescriptors({ servers: [base] })
    expect(events).toEqual([
      {
        functionName: 'crm',
        http: {
          path: 'crm/mcp',
          method: 'any',
          integration: 'AWS_PROXY',
          timeoutInMillis: 120000,
          response: { transferMode: 'STREAM' },
        },
      },
    ])
  })

  it('adds the unauthenticated discovery route when auth is set', () => {
    const events = buildRouteDescriptors({
      servers: [{ ...base, auth: { issuer: 'https://i', audiences: ['a'] } }],
    })
    expect(events).toHaveLength(2)
    expect(events[1].http.path).toBe(
      '.well-known/oauth-protected-resource/crm/mcp',
    )
    expect(events[1].http.method).toBe('get')
    expect(events[1].http.authorizer).toBeUndefined()
    expect(events[1].http.response).toEqual({ transferMode: 'STREAM' })
  })

  it('wires a user-provided authorizer to the MCP route only', () => {
    const events = buildRouteDescriptors({
      servers: [
        {
          ...base,
          auth: { issuer: 'https://i', audiences: ['a'], authorizer: 'myAuth' },
        },
      ],
    })
    expect(events[0].http.authorizer).toEqual({ name: 'myAuth' })
    expect(events[1].http.authorizer).toBeUndefined()
  })

  it('derives timeoutInMillis from timeout', () => {
    const events = buildRouteDescriptors({
      servers: [{ ...base, timeout: 300 }],
    })
    expect(events[0].http.timeoutInMillis).toBe(300000)
  })
})
