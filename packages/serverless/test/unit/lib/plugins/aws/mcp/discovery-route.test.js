import { describe, it, expect } from '@jest/globals'
import {
  buildDiscoveryDescriptors,
  resolveBaseUrls,
} from '../../../../../../lib/plugins/aws/mcp/lib/discovery-route.js'

const base = { name: 'crm', timeout: 60 }
const discovery = { issuer: 'https://acme.auth0.com' }
const DISCOVERY_PATH = '.well-known/oauth-protected-resource/crm/mcp'

// What `provider.getApiGatewayRestApiId()` returns for a service that owns its
// REST API - which is what the plugin hands in.
const OWN_REST_API_ID = { Ref: 'ApiGatewayRestApi' }

const build = (
  servers,
  provider = {},
  stage = 'dev',
  restApiId = OWN_REST_API_ID,
) => buildDiscoveryDescriptors({ servers, provider, stage, restApiId })

const methodOf = (descriptors, method, name = 'crm') =>
  descriptors.find(
    (descriptor) =>
      descriptor.http.method === method && descriptor.functionName === name,
  )

const documentOf = (descriptors, name = 'crm') =>
  methodOf(descriptors, 'get', name).http.response.statusCodes[200].template[
    'application/json'
  ]

describe('buildDiscoveryDescriptors', () => {
  it('emits nothing for a server without oauthDiscovery', () => {
    const { descriptors, sources } = build([base])
    expect(descriptors).toEqual([])
    expect(sources.size).toBe(0)
  })

  it('emits a GET and an OPTIONS route on the discovery path', () => {
    const { descriptors } = build([{ ...base, oauthDiscovery: discovery }])
    expect(descriptors.map(({ http }) => [http.method, http.path])).toEqual([
      ['get', DISCOVERY_PATH],
      ['options', DISCOVERY_PATH],
    ])
    // The route answers from API Gateway alone, but it is still attributed to
    // the server's function: the compiler reads `functionName` to reach the
    // function object behind every method it compiles.
    expect(
      descriptors.every(({ functionName }) => functionName === 'crm'),
    ).toBe(true)
  })

  // A MOCK integration has no backend: the request template names the status
  // code, and the integration response for that code carries the answer.
  it('serves the document from a MOCK integration with no authorizer', () => {
    const { descriptors } = build([{ ...base, oauthDiscovery: discovery }])
    const get = methodOf(descriptors, 'get')

    expect(get.http.integration).toBe('MOCK')
    expect(get.http).not.toHaveProperty('authorizer')
    expect(get.http.request.template).toEqual({
      'application/json': '{"statusCode": 200}',
    })
    expect(get.http.response.statusCodes[200].headers).toEqual({
      'Content-Type': "'application/json'",
      'Access-Control-Allow-Origin': "'*'",
    })
  })

  it('answers preflight with 204 and the MCP client headers', () => {
    const { descriptors } = build([{ ...base, oauthDiscovery: discovery }])
    const options = methodOf(descriptors, 'options')

    expect(options.http.integration).toBe('MOCK')
    expect(options.http).not.toHaveProperty('authorizer')
    expect(options.http.request.template).toEqual({
      'application/json': '{"statusCode": 204}',
    })
    expect(options.http.response.statusCodes[204]).toEqual({
      pattern: '',
      headers: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Methods': "'GET,OPTIONS'",
        'Access-Control-Allow-Headers':
          "'content-type,mcp-protocol-version,authorization'",
      },
    })
    // Nothing to send: the preflight is headers only.
    expect(options.http.response.statusCodes[204]).not.toHaveProperty(
      'template',
    )
  })

  // RFC 9728 protected-resource metadata. The key order is fixed so the
  // document is byte-stable across packages - a reordered document would churn
  // the method resource on every deploy.
  it('renders the metadata document with a stable key order', () => {
    const { descriptors } = build([
      {
        ...base,
        oauthDiscovery: { ...discovery, publicUrl: 'https://mcp.acme.com' },
      },
    ])
    expect(documentOf(descriptors)).toBe(
      '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
    )
  })

  // The map is the endpoint summary's input as much as the exposure warning's,
  // so it carries the resolved base URL alongside the source it came from.
  it('reports the base-URL source and URL per server', () => {
    const { sources } = build(
      [
        {
          ...base,
          oauthDiscovery: { ...discovery, publicUrl: 'https://mcp.acme.com' },
        },
        { name: 'billing', timeout: 60, oauthDiscovery: discovery },
        { name: 'docs', timeout: 60 },
      ],
      { domain: 'api.acme.com' },
    )
    expect([...sources]).toEqual([
      ['crm', { source: 'override', url: 'https://mcp.acme.com' }],
      ['billing', { source: 'domain', url: 'https://api.acme.com' }],
    ])
  })

  it('prefers publicUrl over a custom domain', () => {
    const { descriptors, sources } = build(
      [
        {
          ...base,
          oauthDiscovery: { ...discovery, publicUrl: 'https://mcp.acme.com' },
        },
      ],
      { domain: 'api.acme.com' },
    )
    expect(documentOf(descriptors)).toContain('"https://mcp.acme.com/crm/mcp"')
    expect(sources.get('crm')).toEqual({
      source: 'override',
      url: 'https://mcp.acme.com',
    })
  })

  // A user writes the URL they know; the path is appended to it, so a trailing
  // slash would publish "https://mcp.acme.com//crm/mcp".
  it.each([
    ['https://mcp.acme.com/', 'https://mcp.acme.com/crm/mcp'],
    ['https://mcp.acme.com///', 'https://mcp.acme.com/crm/mcp'],
    ['https://mcp.acme.com/v1/', 'https://mcp.acme.com/v1/crm/mcp'],
  ])('strips trailing slashes off publicUrl %s', (publicUrl, expected) => {
    const { descriptors } = build([
      { ...base, oauthDiscovery: { ...discovery, publicUrl } },
    ])
    expect(documentOf(descriptors)).toContain(`"resource":"${expected}"`)
  })

  it('falls back to the REST custom domain, base path included', () => {
    const { descriptors, sources } = build(
      [{ ...base, oauthDiscovery: discovery }],
      { domain: { name: 'api.acme.com', basePath: 'v1' } },
    )
    expect(documentOf(descriptors)).toContain(
      '"resource":"https://api.acme.com/v1/crm/mcp"',
    )
    expect(sources.get('crm')).toEqual({
      source: 'domain',
      url: 'https://api.acme.com/v1',
    })
  })

  // With no domain in front of the API the stage URL is the only address, and
  // the API id is not known until CloudFormation creates the RestApi - so the
  // document is emitted as an intrinsic and rendered during the deploy. The
  // variable-map form of `Fn::Sub` keeps the id itself out of the string, so
  // the same template works for an imported API too.
  it('falls back to the stage URL as an Fn::Sub over the resolved API id', () => {
    const { descriptors, sources } = build(
      [{ ...base, oauthDiscovery: discovery }],
      {},
      'prod',
    )
    expect(documentOf(descriptors)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://${RestApiId}.execute-api.${AWS::Region}.${AWS::URLSuffix}/prod/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
        { RestApiId: { Ref: 'ApiGatewayRestApi' } },
      ],
    })
    // The stage URL is a CloudFormation intrinsic, so there is no URL to report
    // back: whoever needs a printable one falls back to the stack output.
    expect(sources.get('crm')).toEqual({ source: 'stage', url: undefined })
  })

  // A service importing `provider.apiGateway.restApiId` never gets an
  // `ApiGatewayRestApi` resource (`api-gateway/lib/rest-api.js` returns before
  // creating it), so a template naming it would fail the deploy outright.
  it('substitutes an imported REST API id without naming the absent resource', () => {
    const { descriptors } = build(
      [{ ...base, oauthDiscovery: discovery }],
      {},
      'dev',
      'imported123',
    )
    const [template, variables] = documentOf(descriptors)['Fn::Sub']
    expect(variables).toEqual({ RestApiId: 'imported123' })
    expect(template).not.toContain('ApiGatewayRestApi')
  })

  // An issuer naming a resource this stack creates arrives as an intrinsic, so
  // the document has to render through `Fn::Sub` whatever the base URL is.
  //
  // An `Fn::Sub` issuer is INLINED into the document's own template string
  // rather than passed as a variable value. Nesting would also deploy -
  // CloudFormation permits `Fn::Sub` as a variable value - but the outer
  // substitution resolves `${AWS::Region}` and `${UserPool}` exactly as the
  // inner one would have, so one pass over one map is the simpler template.
  it('inlines an Fn::Sub issuer into the document under a publicUrl base', () => {
    const { descriptors } = build([
      {
        ...base,
        oauthDiscovery: {
          issuer: {
            'Fn::Sub':
              'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
          },
          publicUrl: 'https://mcp.acme.com',
        },
      },
    ])
    expect(documentOf(descriptors)).toEqual({
      'Fn::Sub':
        '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"],"bearer_methods_supported":["header"]}',
    })
  })

  it('inlines an Fn::Sub issuer beside the stage URL variable', () => {
    const { descriptors } = build([
      {
        ...base,
        oauthDiscovery: {
          issuer: {
            'Fn::Sub':
              'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
          },
        },
      },
    ])
    expect(documentOf(descriptors)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://${RestApiId}.execute-api.${AWS::Region}.${AWS::URLSuffix}/dev/crm/mcp","authorization_servers":["https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"],"bearer_methods_supported":["header"]}',
        { RestApiId: { Ref: 'ApiGatewayRestApi' } },
      ],
    })
  })

  // An `Fn::Sub` in its list form brings its own variables, which are merged
  // into the document's map along with its template text.
  it('merges the variables of a list-form Fn::Sub issuer', () => {
    const { descriptors } = build([
      {
        ...base,
        oauthDiscovery: {
          issuer: {
            'Fn::Sub': [
              'https://${IssuerHost}/oauth2',
              { IssuerHost: { Ref: 'IssuerHostParam' } },
            ],
          },
          publicUrl: 'https://mcp.acme.com',
        },
      },
    ])
    expect(documentOf(descriptors)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["https://${IssuerHost}/oauth2"],"bearer_methods_supported":["header"]}',
        { IssuerHost: { Ref: 'IssuerHostParam' } },
      ],
    })
  })

  // The document's own variable is the one name the builder owns, so a
  // list-form issuer reusing it would silently redefine the REST API id.
  it('refuses a list-form Fn::Sub issuer that redefines the document variable', () => {
    expect(() =>
      build([
        {
          ...base,
          oauthDiscovery: {
            issuer: {
              'Fn::Sub': ['https://${RestApiId}', { RestApiId: 'nope' }],
            },
          },
        },
      ]),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_ISSUER_VARIABLE_COLLISION',
        message: expect.stringContaining('RestApiId'),
      }),
    )
  })

  // Every other intrinsic goes in as a variable value, which is what a
  // `Fn::Sub` variable map is for.
  it.each([
    ['a Ref', { Ref: 'IssuerParameter' }],
    ['an Fn::GetAtt', { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] }],
    ['an Fn::ImportValue', { 'Fn::ImportValue': 'shared-issuer' }],
  ])('renders %s issuer as a document variable', (_label, issuer) => {
    const { descriptors } = build([
      {
        ...base,
        oauthDiscovery: { issuer, publicUrl: 'https://mcp.acme.com' },
      },
    ])
    expect(documentOf(descriptors)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["${McpOauthIssuer}"],"bearer_methods_supported":["header"]}',
        { McpOauthIssuer: issuer },
      ],
    })
  })

  it('carries both the stage URL and the issuer variable at once', () => {
    const { descriptors, sources } = build([
      { ...base, oauthDiscovery: { issuer: { Ref: 'IssuerParameter' } } },
    ])
    expect(documentOf(descriptors)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://${RestApiId}.execute-api.${AWS::Region}.${AWS::URLSuffix}/dev/crm/mcp","authorization_servers":["${McpOauthIssuer}"],"bearer_methods_supported":["header"]}',
        {
          RestApiId: { Ref: 'ApiGatewayRestApi' },
          McpOauthIssuer: { Ref: 'IssuerParameter' },
        },
      ],
    })
    expect(sources.get('crm')).toEqual({ source: 'stage', url: undefined })
  })

  // The base-URL guard still runs over the values it owns - an intrinsic
  // issuer does not buy a domain a pass.
  it('still rejects a Velocity-active custom domain under an intrinsic issuer', () => {
    expect(() =>
      build(
        [{ ...base, oauthDiscovery: { issuer: { Ref: 'IssuerParameter' } } }],
        { domain: 'api$.acme.com' },
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
      }),
    )
  })

  // Internal seam, not user config: a caller that forgot either value would
  // otherwise publish a document pointing at "undefined".
  it.each([
    ['stage', { stage: undefined }],
    ['restApiId', { restApiId: undefined }],
  ])('refuses to build without %s', (_label, override) => {
    expect(() =>
      buildDiscoveryDescriptors({
        servers: [{ ...base, oauthDiscovery: discovery }],
        provider: {},
        stage: 'dev',
        restApiId: OWN_REST_API_ID,
        ...override,
      }),
    ).toThrow(/buildDiscoveryDescriptors requires both "stage" and "restApiId"/)
  })

  // `validate.js` guards the two values it owns. A custom domain, the stage and
  // the server name reach the document from elsewhere, and the document is a
  // Velocity template - so they are checked here, where they are resolved.
  it.each([
    ['a domain name with a dollar sign', { domain: 'api$.acme.com' }],
    ['a domain name with a hash', { domain: 'api#.acme.com' }],
    [
      'a base path with a dollar sign',
      { domain: { name: 'api.acme.com', basePath: '$stage' } },
    ],
    [
      'a base path with a hash',
      { domain: { name: 'api.acme.com', basePath: '#v1' } },
    ],
  ])('rejects %s', (_label, provider) => {
    expect(() =>
      build([{ ...base, oauthDiscovery: discovery }], provider),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
        message: expect.stringContaining('provider.domain'),
      }),
    )
  })

  it('rejects a Velocity-active character in the stage name', () => {
    expect(() =>
      build([{ ...base, oauthDiscovery: discovery }], {}, 'dev$1'),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
        message: expect.stringContaining('the stage name'),
      }),
    )
  })

  it('rejects a Velocity-active character in the server name', () => {
    expect(() =>
      build([{ ...base, name: 'cr$m', oauthDiscovery: discovery }]),
    ).toThrow(
      expect.objectContaining({
        code: 'MCP_OAUTH_DISCOVERY_VTL_UNSAFE_VALUE',
        message: expect.stringContaining('the server name'),
      }),
    )
  })

  it('emits one route pair per discovery-enabled server, each with its own document', () => {
    const { descriptors, sources } = build([
      {
        ...base,
        oauthDiscovery: { ...discovery, publicUrl: 'https://mcp.acme.com' },
      },
      { name: 'docs', timeout: 60 },
      {
        name: 'billing',
        timeout: 60,
        oauthDiscovery: {
          issuer: 'https://billing.auth0.com',
          publicUrl: 'https://pay.acme.com',
        },
      },
    ])
    expect(
      descriptors.map(({ http }) => `${http.method} ${http.path}`),
    ).toEqual([
      `get ${DISCOVERY_PATH}`,
      `options ${DISCOVERY_PATH}`,
      'get .well-known/oauth-protected-resource/billing/mcp',
      'options .well-known/oauth-protected-resource/billing/mcp',
    ])
    // Each server advertises its own resource and its own issuer - the two
    // documents share nothing.
    expect(documentOf(descriptors, 'crm')).toBe(
      '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
    )
    expect(documentOf(descriptors, 'billing')).toBe(
      '{"resource":"https://pay.acme.com/billing/mcp","authorization_servers":["https://billing.auth0.com"],"bearer_methods_supported":["header"]}',
    )
    expect([...sources]).toEqual([
      ['crm', { source: 'override', url: 'https://mcp.acme.com' }],
      ['billing', { source: 'override', url: 'https://pay.acme.com' }],
    ])
  })
})

// The one place a server's public base URL is decided. The discovery document
// and the deploy/info endpoint summary are both rendered from what it returns,
// which is what keeps the URL a client is told about and the URL the summary
// prints the same string.
describe('resolveBaseUrls', () => {
  it('resolves publicUrl, the custom domain and the stage in that order', () => {
    const baseUrls = resolveBaseUrls({
      servers: [
        {
          name: 'crm',
          oauthDiscovery: {
            issuer: 'https://acme.auth0.com',
            publicUrl: 'https://mcp.acme.com/',
          },
        },
        { name: 'billing' },
      ],
      provider: { domain: { name: 'api.acme.com', basePath: 'v1' } },
    })
    expect([...baseUrls]).toEqual([
      ['crm', { source: 'override', url: 'https://mcp.acme.com' }],
      ['billing', { source: 'domain', url: 'https://api.acme.com/v1' }],
    ])
  })

  // A server publishes no discovery document, and is still reached somewhere -
  // the summary prints that URL, so every server is resolved, not just the ones
  // with an `oauthDiscovery` block.
  it('resolves a server that publishes no discovery document', () => {
    expect([
      ...resolveBaseUrls({
        servers: [{ name: 'docs' }],
        provider: { domains: ['mcp.acme.com'] },
      }),
    ]).toEqual([['docs', { source: 'domain', url: 'https://mcp.acme.com' }]])
  })

  it('reports the stage with no printable URL when nothing fronts the API', () => {
    expect(
      resolveBaseUrls({ servers: [{ name: 'crm' }], provider: {} }).get('crm'),
    ).toEqual({ source: 'stage', url: undefined })
  })
})
