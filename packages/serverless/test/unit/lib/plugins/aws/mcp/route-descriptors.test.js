import { describe, it, expect } from '@jest/globals'
import { buildRouteDescriptors } from '../../../../../../lib/plugins/aws/mcp/lib/route-descriptors.js'

const base = { name: 'crm', timeout: 120 }

describe('buildRouteDescriptors', () => {
  it('emits one ANY streaming route per server', () => {
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

  // The protected-resource metadata is served by a MOCK route built in
  // `discovery-route.js`; nothing about it is a function-backed route, so it
  // never appears here - not even for a server that publishes it.
  it('emits nothing beyond the MCP route for a server with oauthDiscovery', () => {
    const events = buildRouteDescriptors({
      servers: [
        { ...base, oauthDiscovery: { issuer: 'https://acme.auth0.com' } },
      ],
    })
    expect(events).toHaveLength(1)
    expect(events[0].http.path).toBe('crm/mcp')
  })

  // A string names an authorizer function. It is wrapped rather than passed
  // through, because the seam reads a bare string carrying a colon as an ARN.
  it('wraps a string authorizer as a name on the MCP route', () => {
    const events = buildRouteDescriptors({
      servers: [{ ...base, authorizer: 'myAuth' }],
    })
    expect(events[0].http.authorizer).toEqual({ name: 'myAuth' })
  })

  // `aws_iam` is the one authorizer API Gateway resolves without an authorizer
  // resource of its own, and the http event spells it as the bare string - so
  // the descriptor carries the bare string too, which the seam's `getAuthorizer`
  // matches case-insensitively.
  it.each(['aws_iam', 'AWS_IAM', 'Aws_Iam'])(
    'passes the %s authorizer through as a bare string',
    (authorizer) => {
      const events = buildRouteDescriptors({
        servers: [{ ...base, authorizer }],
      })
      expect(events[0].http.authorizer).toBe(authorizer)
    },
  )

  it('passes an object authorizer through verbatim', () => {
    const authorizer = {
      type: 'request',
      name: 'myAuth',
      identitySource: 'method.request.header.Authorization',
      resultTtlInSeconds: 0,
    }
    const events = buildRouteDescriptors({
      servers: [{ ...base, authorizer }],
    })
    expect(events[0].http.authorizer).toBe(authorizer)
  })

  it('omits the authorizer key when no authorizer is configured', () => {
    const events = buildRouteDescriptors({ servers: [base] })
    expect(events[0].http).not.toHaveProperty('authorizer')
  })

  it('derives timeoutInMillis from timeout', () => {
    const events = buildRouteDescriptors({
      servers: [{ ...base, timeout: 300 }],
    })
    expect(events[0].http.timeoutInMillis).toBe(300000)
  })
})
