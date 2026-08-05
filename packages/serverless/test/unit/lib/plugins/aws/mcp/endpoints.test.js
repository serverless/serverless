import { describe, it, expect } from '@jest/globals'
import {
  formatMcpEndpoints,
  serviceEndpointOf,
} from '../../../../../../lib/plugins/aws/mcp/lib/endpoints.js'

describe('formatMcpEndpoints', () => {
  // The entries feed `addServiceOutputSection('mcp', ...)`, whose renderer
  // prints `mcp:` as the section header - so the entries themselves carry no
  // `mcp: ` prefix of their own.
  it('formats one entry per server from the service endpoint', () => {
    const lines = formatMcpEndpoints({
      servers: [{ name: 'crm' }, { name: 'billing' }],
      serviceEndpoint: 'https://abc123.execute-api.us-east-1.amazonaws.com/dev',
    })
    expect(lines).toEqual([
      'crm → https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp',
      'billing → https://abc123.execute-api.us-east-1.amazonaws.com/dev/billing/mcp',
    ])
  })

  it('returns [] when the service endpoint is unknown', () => {
    expect(
      formatMcpEndpoints({
        servers: [{ name: 'crm' }],
        serviceEndpoint: undefined,
      }),
    ).toEqual([])
  })

  // Behind a custom domain the execute-api URL is not the URL clients use - and
  // with `disableDefaultEndpoint` it is not reachable at all - so the public
  // base URL wins wherever one is known.
  it('prefers the public base URL of a custom domain', () => {
    expect(
      formatMcpEndpoints({
        servers: [{ name: 'crm' }],
        serviceEndpoint:
          'https://abc123.execute-api.us-east-1.amazonaws.com/dev',
        publicBaseUrl: 'https://api.acme.com/assistant',
      }),
    ).toEqual(['crm → https://api.acme.com/assistant/crm/mcp'])
  })

  it('formats from the public base URL with no stack output at all', () => {
    expect(
      formatMcpEndpoints({
        servers: [{ name: 'crm' }],
        serviceEndpoint: undefined,
        publicBaseUrl: 'https://api.acme.com',
      }),
    ).toEqual(['crm → https://api.acme.com/crm/mcp'])
  })

  // A service behind CloudFront, or fronted by two REST domains, names its own
  // origin per server - and that is the origin the deployed server advertises,
  // so it is the one the summary has to print.
  describe('a server that names its own public base URL', () => {
    const withOverride = (url) => ({
      name: 'crm',
      environment: { SERVERLESS_MCP_PUBLIC_BASE_URL: url },
    })

    it('wins over the execute-api URL', () => {
      expect(
        formatMcpEndpoints({
          servers: [withOverride('https://mcp.acme.com')],
          serviceEndpoint:
            'https://abc123.execute-api.us-east-1.amazonaws.com/dev',
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    it('wins over a custom domain', () => {
      expect(
        formatMcpEndpoints({
          servers: [withOverride('https://mcp.acme.com')],
          serviceEndpoint:
            'https://abc123.execute-api.us-east-1.amazonaws.com/dev',
          publicBaseUrl: 'https://api.acme.com/assistant',
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    it('drops a trailing slash before the route', () => {
      expect(
        formatMcpEndpoints({
          servers: [withOverride('https://mcp.acme.com/')],
          serviceEndpoint: undefined,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    // `environment` values reach CloudFormation as-is, so one can be an
    // intrinsic - which has no URL to print.
    it('is ignored when it is a CloudFormation intrinsic', () => {
      expect(
        formatMcpEndpoints({
          servers: [withOverride({ Ref: 'PublicBaseUrl' })],
          serviceEndpoint:
            'https://abc123.execute-api.us-east-1.amazonaws.com/dev',
        }),
      ).toEqual([
        'crm → https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp',
      ])
    })

    // Nothing else is knowable here - no domain, no gathered stack output - and
    // the server still has a printable URL of its own.
    it('prints with no domain and no stack output', () => {
      expect(
        formatMcpEndpoints({
          servers: [withOverride('https://mcp.acme.com')],
          serviceEndpoint: undefined,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    // One service can hold both, so a server with nothing to print is skipped
    // on its own rather than emptying the section.
    it('does not stop the servers that have no origin from being skipped', () => {
      expect(
        formatMcpEndpoints({
          servers: [withOverride('https://mcp.acme.com'), { name: 'docs' }],
          serviceEndpoint: undefined,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })
  })
})

describe('serviceEndpointOf', () => {
  const restEndpoint = 'https://abc123.execute-api.us-east-1.amazonaws.com/dev'

  it('reads the REST API ServiceEndpoint stack output', () => {
    expect(
      serviceEndpointOf([
        { OutputKey: 'CrmMcpStateSecretArn', OutputValue: 'arn:aws:secret' },
        { OutputKey: 'ServiceEndpoint', OutputValue: restEndpoint },
      ]),
    ).toBe(restEndpoint)
  })

  // MCP routes are compiled onto the REST API only, so the HTTP API's own
  // endpoint output must never stand in for it.
  it('ignores the HTTP API endpoint output', () => {
    expect(
      serviceEndpointOf([
        {
          OutputKey: 'HttpApiUrl',
          OutputValue: 'https://xyz.execute-api.us-east-1.amazonaws.com',
        },
      ]),
    ).toBeUndefined()
  })

  it('returns undefined without outputs', () => {
    expect(serviceEndpointOf()).toBeUndefined()
    expect(serviceEndpointOf([])).toBeUndefined()
  })
})
