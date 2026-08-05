import {
  buildMcpAnalytics,
  classifyIssuer,
  deriveMcpBlock,
} from '../../../../../../lib/plugins/aws/mcp/analytics.js'

describe('deriveMcpBlock — envelope', () => {
  test('returns undefined for absent/empty/malformed top-level config', () => {
    expect(deriveMcpBlock(undefined)).toBeUndefined()
    expect(deriveMcpBlock(null)).toBeUndefined()
    expect(deriveMcpBlock({})).toBeUndefined()
    expect(deriveMcpBlock({ servers: {} })).toBeUndefined()
    expect(deriveMcpBlock({ servers: 'nope' })).toBeUndefined()
    expect(deriveMcpBlock({ servers: [{ server: 'x' }] })).toBeUndefined()
    expect(deriveMcpBlock('nope')).toBeUndefined()
    expect(deriveMcpBlock(42)).toBeUndefined()
  })

  test('count reflects the number of defined servers, malformed entries included', () => {
    const out = deriveMcpBlock({
      servers: { crm: { server: 'src/crm.mjs' }, broken: 42 },
    })
    expect(out.count).toBe(2)
    // ...but the malformed entry contributes nothing to knob derivation.
    expect(out.timeouts).toBeUndefined()
  })
})

describe('deriveMcpBlock — auth', () => {
  test('counts servers with an auth block, and those naming an authorizer', () => {
    const out = deriveMcpBlock({
      servers: {
        a: {
          server: 'a.mjs',
          auth: { issuer: 'https://x.auth0.com', audiences: ['aud'] },
        },
        b: {
          server: 'b.mjs',
          auth: {
            issuer: 'https://x.auth0.com',
            audiences: ['aud'],
            authorizer: 'gate',
          },
        },
        c: { server: 'c.mjs' },
      },
    })
    expect(out.auth).toBe(2)
    expect(out.authAuthorizer).toBe(1)
  })

  test('omits auth keys when no server has an auth block', () => {
    const out = deriveMcpBlock({ servers: { a: { server: 'a.mjs' } } })
    expect(out.auth).toBeUndefined()
    expect(out.authAuthorizer).toBeUndefined()
    expect(out.issuerTypes).toBeUndefined()
  })
})

describe('classifyIssuer — closed vocabulary, never the URL', () => {
  test.each([
    ['https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ab12cd', 'cognito'],
    ['https://acme.eu.auth0.com', 'auth0'],
    ['https://dev-123456.okta.com/oauth2/default', 'okta'],
    ['https://acme.oktapreview.com', 'okta'],
    ['https://login.microsoftonline.com/tenant-id/v2.0', 'entra'],
    ['https://sts.windows.net/tenant-id/', 'entra'],
    ['https://acme.ciamlogin.com/tenant-id/v2.0', 'entra'],
    ['https://auth.example.com', 'other'],
    // A lookalike that merely contains a provider's name stays 'other'.
    ['https://auth0.example.com', 'other'],
  ])('%s → %s', (issuer, expected) => {
    expect(classifyIssuer(issuer)).toBe(expected)
  })

  test('returns undefined for non-URLs and non-strings', () => {
    expect(classifyIssuer('not a url')).toBeUndefined()
    expect(classifyIssuer(undefined)).toBeUndefined()
    expect(classifyIssuer(42)).toBeUndefined()
  })

  test('issuerTypes aggregates as sorted unique classes', () => {
    const out = deriveMcpBlock({
      servers: {
        a: { server: 'a.mjs', auth: { issuer: 'https://x.auth0.com' } },
        b: {
          server: 'b.mjs',
          auth: {
            issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_x',
          },
        },
        c: { server: 'c.mjs', auth: { issuer: 'https://y.auth0.com' } },
      },
    })
    expect(out.issuerTypes).toEqual(['auth0', 'cognito'])
  })
})

describe('deriveMcpBlock — state', () => {
  test('splits provisioned (true) from bring-your-own (ARN string)', () => {
    const out = deriveMcpBlock({
      servers: {
        a: { server: 'a.mjs', state: true },
        b: { server: 'b.mjs', state: 'arn:aws:ssm:us-east-1:1:parameter/k' },
        c: { server: 'c.mjs' },
      },
    })
    expect(out.state).toEqual({ true: 1, arn: 1 })
  })

  test('omits state entirely when no server sets it', () => {
    const out = deriveMcpBlock({ servers: { a: { server: 'a.mjs' } } })
    expect(out.state).toBeUndefined()
  })
})

describe('deriveMcpBlock — timeouts and memorySizes (explicit-only)', () => {
  test('reports only explicitly set values, sorted unique', () => {
    const out = deriveMcpBlock({
      servers: {
        a: { server: 'a.mjs', timeout: 900, memorySize: 1024 },
        b: { server: 'b.mjs', timeout: 120 },
        c: { server: 'c.mjs' }, // defaults by omission — contribute nothing
        d: { server: 'd.mjs', timeout: 120 },
      },
    })
    expect(out.timeouts).toEqual([120, 900])
    expect(out.memorySizes).toEqual([1024])
  })

  test('explicitly setting the default (60) IS reported', () => {
    const out = deriveMcpBlock({
      servers: { a: { server: 'a.mjs', timeout: 60 } },
    })
    expect(out.timeouts).toEqual([60])
  })
})

describe('deriveMcpBlock — endpointType (effective, default applied)', () => {
  test('defaults to EDGE when the provider does not set it', () => {
    const out = deriveMcpBlock({ servers: { a: { server: 'a.mjs' } } }, {})
    expect(out.endpointType).toBe('EDGE')
  })

  test('reports the provider value case-insensitively', () => {
    const servers = { servers: { a: { server: 'a.mjs' } } }
    expect(
      deriveMcpBlock(servers, { endpointType: 'REGIONAL' }).endpointType,
    ).toBe('REGIONAL')
    expect(
      deriveMcpBlock(servers, { endpointType: 'regional' }).endpointType,
    ).toBe('REGIONAL')
    expect(
      deriveMcpBlock(servers, { endpointType: 'Private' }).endpointType,
    ).toBe('PRIVATE')
  })

  test('reports nothing for a set-but-unrecognized value', () => {
    const out = deriveMcpBlock(
      { servers: { a: { server: 'a.mjs' } } },
      { endpointType: 'GLOBAL' },
    )
    expect(out.endpointType).toBeUndefined()
  })
})

describe('deriveMcpBlock — domain presence', () => {
  test('true when provider.domain or provider.domains is present, else omitted', () => {
    const servers = { servers: { a: { server: 'a.mjs' } } }
    expect(deriveMcpBlock(servers, { domain: 'mcp.example.com' }).domain).toBe(
      true,
    )
    expect(
      deriveMcpBlock(servers, { domain: { name: 'mcp.example.com' } }).domain,
    ).toBe(true)
    expect(deriveMcpBlock(servers, { domains: [{}] }).domain).toBe(true)
    expect(deriveMcpBlock(servers, {}).domain).toBeUndefined()
  })
})

describe('buildMcpAnalytics — total, spreadable', () => {
  test('returns {} when the service defines no mcp block', () => {
    expect(buildMcpAnalytics({ service: 'svc' })).toEqual({})
    expect(buildMcpAnalytics(undefined)).toEqual({})
  })

  test('wraps the block under the mcp key', () => {
    const out = buildMcpAnalytics({
      provider: { endpointType: 'REGIONAL' },
      mcp: { servers: { crm: { server: 'src/crm.mjs', state: true } } },
    })
    expect(out).toEqual({
      mcp: {
        count: 1,
        state: { true: 1 },
        endpointType: 'REGIONAL',
      },
    })
  })

  test('a throwing config getter degrades to {} (never throws into the CLI)', () => {
    const config = {}
    Object.defineProperty(config, 'mcp', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    expect(buildMcpAnalytics(config)).toEqual({})
  })

  test('a throwing provider getter degrades to {} as well', () => {
    const config = { mcp: { servers: { a: { server: 'a.mjs' } } } }
    Object.defineProperty(config, 'provider', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    expect(buildMcpAnalytics(config)).toEqual({})
  })
})
