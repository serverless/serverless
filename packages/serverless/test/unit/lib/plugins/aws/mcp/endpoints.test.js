import { describe, it, expect } from '@jest/globals'
import {
  formatMcpEndpoints,
  serviceEndpointOf,
} from '../../../../../../lib/plugins/aws/mcp/lib/endpoints.js'
import {
  buildDiscoveryDescriptors,
  resolveBaseUrls,
} from '../../../../../../lib/plugins/aws/mcp/lib/discovery-route.js'

const serviceEndpoint = 'https://abc123.execute-api.us-east-1.amazonaws.com/dev'

// The summary is formatted from exactly what the discovery routes are built
// from, so the tests resolve it the same way the plugin does rather than
// hand-writing a map.
const format = ({ servers, provider = {}, ...rest }) =>
  formatMcpEndpoints({
    servers,
    baseUrls: resolveBaseUrls({ servers, provider }),
    ...rest,
  })

// What CloudFormation substitutes into a stage-sourced document on deploy. The
// values are the ones `serviceEndpoint` above is made of, because the stack
// output and the rendered document describe the same address.
const DEPLOYED = {
  RestApiId: 'abc123',
  'AWS::Region': 'us-east-1',
  'AWS::URLSuffix': 'amazonaws.com',
}

// The document as a client would read it, deploy-time substitution included.
const publishedResourceOf = ({ servers, provider = {} }, name) => {
  const template = buildDiscoveryDescriptors({
    servers,
    provider,
    stage: 'dev',
    restApiId: { Ref: 'ApiGatewayRestApi' },
  }).descriptors.find(
    ({ functionName, http }) => functionName === name && http.method === 'get',
  ).http.response.statusCodes[200].template['application/json']
  const document =
    typeof template === 'string'
      ? template
      : Object.entries(DEPLOYED).reduce(
          (rendered, [variable, value]) =>
            rendered.replaceAll(`\${${variable}}`, value),
          template['Fn::Sub'][0],
        )
  return JSON.parse(document).resource
}

describe('formatMcpEndpoints', () => {
  // The entries feed `addServiceOutputSection('mcp', ...)`, whose renderer
  // prints `mcp:` as the section header - so the entries themselves carry no
  // `mcp: ` prefix of their own.
  it('formats one entry per server from the service endpoint', () => {
    expect(
      format({
        servers: [{ name: 'crm' }, { name: 'billing' }],
        serviceEndpoint,
      }),
    ).toEqual([
      `crm → ${serviceEndpoint}/crm/mcp`,
      `billing → ${serviceEndpoint}/billing/mcp`,
    ])
  })

  it('returns [] when the service endpoint is unknown', () => {
    expect(
      format({ servers: [{ name: 'crm' }], serviceEndpoint: undefined }),
    ).toEqual([])
  })

  // Behind a custom domain the execute-api URL is not the URL clients use - and
  // with `disableDefaultEndpoint` it is not reachable at all - so the resolved
  // base URL wins wherever one is known.
  it('prefers the public base URL of a custom domain', () => {
    expect(
      format({
        servers: [{ name: 'crm' }],
        provider: { domain: { name: 'api.acme.com', basePath: 'assistant' } },
        serviceEndpoint,
      }),
    ).toEqual(['crm → https://api.acme.com/assistant/crm/mcp'])
  })

  it('formats from the public base URL with no stack output at all', () => {
    expect(
      format({
        servers: [{ name: 'crm' }],
        provider: { domain: 'api.acme.com' },
        serviceEndpoint: undefined,
      }),
    ).toEqual(['crm → https://api.acme.com/crm/mcp'])
  })

  // A service behind CloudFront, or fronted by two REST domains, names its own
  // origin per server - and that is the origin the published discovery document
  // advertises, so it is the one the summary has to print.
  describe('a server that names its own public URL', () => {
    const withOverride = (publicUrl) => ({
      name: 'crm',
      oauthDiscovery: { issuer: 'https://acme.auth0.com', publicUrl },
    })

    it('wins over the execute-api URL', () => {
      expect(
        format({
          servers: [withOverride('https://mcp.acme.com')],
          serviceEndpoint,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    it('wins over a custom domain', () => {
      expect(
        format({
          servers: [withOverride('https://mcp.acme.com')],
          provider: { domain: { name: 'api.acme.com', basePath: 'assistant' } },
          serviceEndpoint,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    it('drops a trailing slash before the route', () => {
      expect(
        format({
          servers: [withOverride('https://mcp.acme.com/')],
          serviceEndpoint: undefined,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })

    // One service can hold both, so a server with nothing to print is skipped
    // on its own rather than emptying the section.
    it('does not stop the servers that have no origin from being skipped', () => {
      expect(
        format({
          servers: [withOverride('https://mcp.acme.com'), { name: 'docs' }],
          serviceEndpoint: undefined,
        }),
      ).toEqual(['crm → https://mcp.acme.com/crm/mcp'])
    })
  })

  // Not a coincidence to be kept in step by hand: both sides read the same
  // resolution, so a URL the summary prints for a discovery-publishing server
  // is the URL that server's document names as its resource.
  describe('agrees with the published discovery document', () => {
    it.each([
      [
        'an overridden public URL',
        {
          servers: [
            {
              name: 'crm',
              oauthDiscovery: {
                issuer: 'https://acme.auth0.com',
                publicUrl: 'https://mcp.acme.com/',
              },
            },
          ],
        },
      ],
      [
        'a custom domain',
        {
          servers: [
            {
              name: 'crm',
              oauthDiscovery: { issuer: 'https://acme.auth0.com' },
            },
          ],
          provider: { domain: { name: 'api.acme.com', basePath: 'v1' } },
        },
      ],
      // The one case where the two sides are not the same string at rest: the
      // document holds an intrinsic and the summary holds the stack output. They
      // still have to name the same address once the deploy has rendered it -
      // which is what the stack output already is.
      [
        'the stage URL',
        {
          servers: [
            {
              name: 'crm',
              oauthDiscovery: { issuer: 'https://acme.auth0.com' },
            },
          ],
        },
      ],
    ])('for %s', (_label, config) => {
      const [line] = format({ ...config, serviceEndpoint })
      expect(line).toBe(`crm → ${publishedResourceOf(config, 'crm')}`)
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
