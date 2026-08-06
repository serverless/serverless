import { jest } from '@jest/globals'

// The block is derived through the deploy's own base-URL resolver, which
// reaches `lib/packaging.js` and its logger. Stubbing the logger is what makes
// "the resolver never ran" observable from out here — see the resolution
// describe below. `ServerlessError` is linked by the same module graph.
jest.unstable_mockModule('@serverless/util', () => ({
  log: { debug: jest.fn(), warning: jest.fn(), info: jest.fn() },
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
}))

const { log } = await import('@serverless/util')
const {
  buildMcpAnalytics,
  classifyAuthorizer,
  classifyIssuer,
  deriveMcpBlock,
} = await import('../../../../../../lib/plugins/aws/mcp/analytics.js')

// A server config whose named property throws when read, for the total-function
// guarantee: analytics must degrade to omitted keys rather than into the CLI.
const throwingProperty = (base, key) => {
  const config = { ...base }
  Object.defineProperty(config, key, {
    enumerable: true,
    get() {
      throw new Error('boom')
    },
  })
  return config
}

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

describe('classifyAuthorizer — closed vocabulary, never the config', () => {
  test.each([
    // A bare string is a user authorizer function name, except for the one
    // reserved value.
    ['gate', 'function-token'],
    ['aws_iam', 'aws_iam'],
    ['AWS_IAM', 'aws_iam'],
    [{ type: 'aws_iam' }, 'aws_iam'],
    [{ type: 'AWS_IAM' }, 'aws_iam'],
    [
      { type: 'request', arn: 'arn:aws:lambda:us-east-1:1:function:gate' },
      'function-request',
    ],
    [{ type: 'REQUEST' }, 'function-request'],
    [{ type: 'token' }, 'function-token'],
    [{ type: 'ToKeN' }, 'function-token'],
    // Type-less object: TOKEN is the compiler's default, and so is ours.
    [{ arn: 'arn:aws:lambda:us-east-1:1:function:gate' }, 'function-token'],
    [{ authorizerId: 'abc123' }, 'function-token'],
    [{}, 'function-token'],
    [{ type: 'cognito_user_pools' }, 'cognito'],
    [{ type: 'COGNITO_USER_POOLS' }, 'cognito'],
    // Detected from the ARN alone, exactly as the api-gateway compiler does.
    [
      { arn: 'arn:aws:cognito-idp:us-east-1:1:userpool/us-east-1_ab12cd' },
      'cognito',
    ],
    [
      { arn: 'arn:aws-us-gov:cognito-idp:us-gov-west-1:1:userpool/x' },
      'cognito',
    ],
    // An intrinsic hides the service, so it cannot be read as a user pool.
    [{ arn: { 'Fn::GetAtt': ['Pool', 'Arn'] } }, 'function-token'],
  ])('%p → %s', (authorizer, expected) => {
    expect(classifyAuthorizer(authorizer)).toBe(expected)
  })

  test('returns undefined when there is no authorizer, or it is malformed', () => {
    expect(classifyAuthorizer(undefined)).toBeUndefined()
    expect(classifyAuthorizer(null)).toBeUndefined()
    expect(classifyAuthorizer('')).toBeUndefined()
    expect(classifyAuthorizer(42)).toBeUndefined()
    expect(classifyAuthorizer(['gate'])).toBeUndefined()
  })
})

describe('deriveMcpBlock — authorizer', () => {
  test('counts servers with an authorizer and reports the sorted unique classes', () => {
    const out = deriveMcpBlock({
      servers: {
        a: { server: 'a.mjs', authorizer: 'gate' },
        b: { server: 'b.mjs', authorizer: { type: 'request', arn: 'x' } },
        c: { server: 'c.mjs', authorizer: 'aws_iam' },
        d: { server: 'd.mjs', authorizer: 'other-gate' },
        e: { server: 'e.mjs' },
      },
    })
    expect(out.authorizer).toBe(4)
    expect(out.authorizerTypes).toEqual([
      'aws_iam',
      'function-request',
      'function-token',
    ])
  })

  test('never reports a user-authored authorizer name', () => {
    const out = deriveMcpBlock({
      servers: { a: { server: 'a.mjs', authorizer: 'my-secret-gate' } },
    })
    expect(JSON.stringify(out)).not.toContain('my-secret-gate')
  })

  test('omits authorizer keys when no server sets one', () => {
    const out = deriveMcpBlock({ servers: { a: { server: 'a.mjs' } } })
    expect(out.authorizer).toBeUndefined()
    expect(out.authorizerTypes).toBeUndefined()
  })

  test('the removed hosted-auth keys are gone, legacy config or not', () => {
    const out = deriveMcpBlock({
      servers: {
        a: {
          server: 'a.mjs',
          auth: { issuer: 'https://x.auth0.com', authorizer: 'gate' },
        },
      },
    })
    expect(out.auth).toBeUndefined()
    expect(out.authAuthorizer).toBeUndefined()
    // A stale `auth` block is not config any more, so it feeds nothing.
    expect(out.authorizer).toBeUndefined()
    expect(out.issuerTypes).toBeUndefined()
  })
})

describe('deriveMcpBlock — oauthDiscovery', () => {
  test('counts servers publishing discovery, malformed blocks excluded', () => {
    const out = deriveMcpBlock({
      servers: {
        a: {
          server: 'a.mjs',
          oauthDiscovery: { issuer: 'https://x.auth0.com' },
        },
        b: {
          server: 'b.mjs',
          oauthDiscovery: { issuer: 'https://y.auth0.com' },
        },
        c: { server: 'c.mjs' },
        d: { server: 'd.mjs', oauthDiscovery: 'nope' },
      },
    })
    expect(out.oauthDiscovery).toBe(2)
  })

  test('omits the discovery keys when no server publishes it', () => {
    const out = deriveMcpBlock({ servers: { a: { server: 'a.mjs' } } })
    expect(out.oauthDiscovery).toBeUndefined()
    expect(out.oauthDiscoveryUrlSources).toBeUndefined()
    expect(out.issuerTypes).toBeUndefined()
  })

  test('publicUrl overrides, a custom domain is the domain source', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: {
              issuer: 'https://x.auth0.com',
              publicUrl: 'https://mcp.acme.com/',
            },
          },
          b: {
            server: 'b.mjs',
            oauthDiscovery: { issuer: 'https://y.auth0.com' },
          },
        },
      },
      { domain: 'api.acme.com' },
    )
    expect(out.oauthDiscoveryUrlSources).toEqual(['domain', 'override'])
  })

  test('no domain and no publicUrl leaves the stage URL', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: { issuer: 'https://x.auth0.com' },
          },
        },
      },
      {},
    )
    expect(out.oauthDiscoveryUrlSources).toEqual(['stage'])
  })

  test('a domain fronting the REST API applies to every non-overriding server', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: { issuer: 'https://x.auth0.com' },
          },
          b: {
            server: 'b.mjs',
            oauthDiscovery: { issuer: 'https://y.auth0.com' },
          },
        },
      },
      { domains: [{ name: 'api.acme.com', apiType: 'rest' }] },
    )
    expect(out.oauthDiscoveryUrlSources).toEqual(['domain'])
  })

  test('servers without discovery contribute no source', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: {
              issuer: 'https://x.auth0.com',
              publicUrl: 'https://mcp.acme.com',
            },
          },
          b: { server: 'b.mjs' },
        },
      },
      {},
    )
    expect(out.oauthDiscoveryUrlSources).toEqual(['override'])
  })

  test('a malformed publicUrl drops that server rather than guessing a source', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: { issuer: 'https://x.auth0.com', publicUrl: 42 },
          },
        },
      },
      {},
    )
    expect(out.oauthDiscovery).toBe(1)
    expect(out.oauthDiscoveryUrlSources).toBeUndefined()
  })

  test('an empty publicUrl is no override, so it reports no override', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: { issuer: 'https://x.auth0.com', publicUrl: '' },
          },
          b: {
            server: 'b.mjs',
            oauthDiscovery: { issuer: 'https://y.auth0.com' },
          },
        },
      },
      { domain: 'api.acme.com' },
    )
    expect(out.oauthDiscovery).toBe(2)
    // The schema accepts no empty `publicUrl`, so an `override` source here
    // would name a decision nobody could have made.
    expect(out.oauthDiscoveryUrlSources).toEqual(['domain'])
  })

  test('never reports a publicUrl or an issuer', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: {
              issuer: 'https://tenant.acme.auth0.com',
              publicUrl: 'https://mcp.acme.com',
            },
          },
        },
      },
      {},
    )
    const json = JSON.stringify(out)
    expect(json).not.toContain('acme')
  })
})

/**
 * The base-URL resolver is deploy machinery: it inspects the provider's custom
 * domains and, when more than one fronts the REST API, says so on the debug
 * log. Analytics runs on EVERY command, so calling it for a service that has
 * no discovery to report is both wasted work and a debug line about domains
 * that nothing was going to publish on. That log line is the only externally
 * visible trace the resolver leaves, which is what these two tests read: the
 * first asserts it is silent, the second is the control proving the silence
 * means something.
 */
describe('deriveMcpBlock — the URL resolver runs only when its answer is reported', () => {
  const twoRestDomains = {
    domains: [
      { name: 'one.acme.com', apiType: 'rest' },
      { name: 'two.acme.com', apiType: 'rest' },
    ],
  }

  beforeEach(() => log.debug.mockClear())

  test('no server publishing discovery leaves the resolver untouched', () => {
    const out = deriveMcpBlock(
      { servers: { a: { server: 'a.mjs' }, b: { server: 'b.mjs' } } },
      twoRestDomains,
    )
    expect(out.oauthDiscoveryUrlSources).toBeUndefined()
    // Domain presence is still reported - it is read directly, not resolved.
    expect(out.domain).toBe(true)
    expect(log.debug).not.toHaveBeenCalled()
  })

  test('one server publishing discovery does reach the resolver', () => {
    const out = deriveMcpBlock(
      {
        servers: {
          a: {
            server: 'a.mjs',
            oauthDiscovery: { issuer: 'https://x.auth0.com' },
          },
        },
      },
      twoRestDomains,
    )
    // Two domains resolve to no single base URL, so the stage URL is the source.
    expect(out.oauthDiscoveryUrlSources).toEqual(['stage'])
    // That the resolver ran at all is the point; the count of debug lines it
    // emits belongs to the resolver's own module graph, not to this contract.
    expect(log.debug).toHaveBeenCalled()
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

  test('issuerTypes aggregates the oauthDiscovery issuers as sorted unique classes', () => {
    const out = deriveMcpBlock({
      servers: {
        a: {
          server: 'a.mjs',
          oauthDiscovery: { issuer: 'https://x.auth0.com' },
        },
        b: {
          server: 'b.mjs',
          oauthDiscovery: {
            issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_x',
          },
        },
        c: {
          server: 'c.mjs',
          oauthDiscovery: { issuer: 'https://y.auth0.com' },
        },
        d: {
          server: 'd.mjs',
          oauthDiscovery: {
            issuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
          },
        },
        e: { server: 'e.mjs', oauthDiscovery: { issuer: 'not a url' } },
      },
    })
    expect(out.issuerTypes).toEqual(['auth0', 'cognito', 'entra'])
  })

  // An intrinsic issuer resolves inside CloudFormation, so its provider family
  // is not knowable here. Guessing from the intrinsic's shape would file a
  // server under a provider nobody can confirm, so it reports nothing at all -
  // while the server still counts as publishing discovery.
  test.each([
    [
      'an Fn::Sub naming a same-stack pool',
      {
        'Fn::Sub':
          'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
      },
    ],
    ['a Ref', { Ref: 'IssuerParameter' }],
    ['an Fn::GetAtt', { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] }],
  ])('an issuer that is %s contributes no issuer type', (_label, issuer) => {
    expect(classifyIssuer(issuer)).toBeUndefined()
    const out = deriveMcpBlock({
      servers: { a: { server: 'a.mjs', oauthDiscovery: { issuer } } },
    })
    expect(out.count).toBe(1)
    expect(out.oauthDiscovery).toBe(1)
    expect(out.issuerTypes).toBeUndefined()
  })

  test('a literal issuer beside an intrinsic one still reports its own class', () => {
    const out = deriveMcpBlock({
      servers: {
        a: {
          server: 'a.mjs',
          oauthDiscovery: { issuer: { Ref: 'IssuerParameter' } },
        },
        b: {
          server: 'b.mjs',
          oauthDiscovery: { issuer: 'https://x.auth0.com' },
        },
      },
    })
    expect(out.oauthDiscovery).toBe(2)
    expect(out.issuerTypes).toEqual(['auth0'])
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

describe('deriveMcpBlock — total on hostile input', () => {
  test.each(['authorizer', 'oauthDiscovery', 'state', 'timeout'])(
    'a throwing "%s" getter on a server never escapes',
    (key) => {
      const servers = {
        servers: { a: throwingProperty({ server: 'a.mjs' }, key) },
      }
      expect(() => deriveMcpBlock(servers, {})).not.toThrow()
      // The outer handler owns this: one hostile getter costs the whole block,
      // not just the key it guards. Pinned so a move to partial degradation is
      // a deliberate change rather than a silent one.
      expect(deriveMcpBlock(servers, {})).toBeUndefined()
    },
  )

  test('a throwing provider.domain getter never escapes', () => {
    const provider = throwingProperty({ endpointType: 'REGIONAL' }, 'domain')
    const servers = {
      servers: {
        a: {
          server: 'a.mjs',
          oauthDiscovery: { issuer: 'https://x.auth0.com' },
        },
      },
    }
    expect(() => deriveMcpBlock(servers, provider)).not.toThrow()
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

  test('wraps a full block, authorizer and discovery dimensions included', () => {
    const out = buildMcpAnalytics({
      provider: { endpointType: 'REGIONAL', domain: 'api.acme.com' },
      mcp: {
        servers: {
          crm: {
            server: 'src/crm.mjs',
            authorizer: 'aws_iam',
            oauthDiscovery: { issuer: 'https://acme.okta.com' },
            timeout: 120,
          },
          docs: {
            server: 'src/docs.mjs',
            authorizer: { type: 'request', arn: 'x' },
            oauthDiscovery: {
              issuer: 'https://acme.okta.com',
              publicUrl: 'https://mcp.acme.com',
            },
            memorySize: 512,
          },
        },
      },
    })
    expect(out).toEqual({
      mcp: {
        count: 2,
        authorizer: 2,
        authorizerTypes: ['aws_iam', 'function-request'],
        oauthDiscovery: 2,
        oauthDiscoveryUrlSources: ['domain', 'override'],
        issuerTypes: ['okta'],
        timeouts: [120],
        memorySizes: [512],
        endpointType: 'REGIONAL',
        domain: true,
      },
    })
  })

  test('a throwing server-property getter degrades to {} as well', () => {
    expect(
      buildMcpAnalytics({
        provider: {},
        mcp: {
          servers: { a: throwingProperty({ server: 'a.mjs' }, 'authorizer') },
        },
      }),
    ).toEqual({})
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
