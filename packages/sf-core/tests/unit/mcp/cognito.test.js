import {
  mintToken,
  issuerOf,
  tokenEndpointOf,
  readCognitoPrerequisite,
  DEFAULT_PREFIX,
} from '../../integration/mcp/lib/cognito.mjs'

// The live pool is exercised by tests/integration/mcp/mcp-auth.test.js. What is
// unit-testable here — with no network and no live pool — is the pure request
// shape mintToken puts on the wire (URL, HTTP Basic auth header, form body), the
// two derived-host helpers, and the skip-versus-fail split of the SSM read,
// replayed against a stubbed global fetch and an injected SSM client.

const TOKEN_ENDPOINT =
  'https://mcp-integration-test-123456789012.auth.us-east-1.amazoncognito.com/oauth2/token'

let originalFetch
let lastCall

const stubFetch = (impl) => {
  lastCall = undefined
  globalThis.fetch = async (input, init) => {
    lastCall = { url: String(input), init }
    return impl({ url: String(input), init })
  }
}

const tokenResponse = (payload, init = {}) =>
  new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('cognito.mintToken request shape', () => {
  test('POSTs client_credentials with HTTP Basic auth and returns the access token', async () => {
    stubFetch(() =>
      tokenResponse({ access_token: 'the-token', token_type: 'Bearer' }),
    )

    const token = await mintToken({
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: 'client-a',
      clientSecret: 's3cr3t',
      scope: 'mcp/invoke',
    })

    expect(token).toBe('the-token')
    expect(lastCall.url).toBe(TOKEN_ENDPOINT)
    expect(lastCall.init.method).toBe('POST')

    const headers = lastCall.init.headers
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded')
    const expectedBasic = Buffer.from('client-a:s3cr3t').toString('base64')
    expect(headers.authorization).toBe(`Basic ${expectedBasic}`)

    const body = new URLSearchParams(lastCall.init.body)
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('scope')).toBe('mcp/invoke')
  })

  test('throws when the endpoint answers non-2xx', async () => {
    stubFetch(() => tokenResponse({ error: 'invalid_client' }, { status: 400 }))
    await expect(
      mintToken({
        tokenEndpoint: TOKEN_ENDPOINT,
        clientId: 'client-b',
        clientSecret: 'wrong',
        scope: 'mcp/invoke',
      }),
    ).rejects.toThrow(/token mint failed \(HTTP 400\)/)
  })

  test('throws when a 200 carries no access_token', async () => {
    stubFetch(() => tokenResponse({ token_type: 'Bearer' }))
    await expect(
      mintToken({
        tokenEndpoint: TOKEN_ENDPOINT,
        clientId: 'client-a',
        clientSecret: 's3cr3t',
        scope: 'mcp/invoke',
      }),
    ).rejects.toThrow(/token mint failed/)
  })
})

describe('readCognitoPrerequisite skips vs fails', () => {
  const ALL_KEYS = {
    poolId: 'us-east-1_ABC',
    domain: 'mcp-integration-test-123456789012',
    region: 'us-east-1',
    clientAId: 'client-a',
    clientASecret: 'secret-a',
    clientBId: 'client-b',
    clientBSecret: 'secret-b',
    scope: 'mcp/invoke',
  }

  const ssmReturning = (keys) => ({
    send: async () => ({
      Parameters: Object.entries(keys).map(([name, value]) => ({
        Name: `${DEFAULT_PREFIX}/${name}`,
        Value: value,
      })),
    }),
  })

  const ssmThrowing = (name) => ({
    send: async () => {
      const error = new Error(name)
      error.name = name
      throw error
    },
  })

  test('returns the derived prerequisite when all eight parameters are present', async () => {
    const prereq = await readCognitoPrerequisite({
      ssm: ssmReturning(ALL_KEYS),
    })
    expect(prereq.issuer).toBe(
      'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC',
    )
    expect(prereq.tokenEndpoint).toBe(TOKEN_ENDPOINT)
    expect(typeof prereq.mintClientA).toBe('function')
    expect(typeof prereq.mintClientB).toBe('function')
  })

  test('returns null when the prefix holds only some of the parameters', async () => {
    const { clientBSecret, ...incomplete } = ALL_KEYS
    expect(clientBSecret).toBeTruthy()
    await expect(
      readCognitoPrerequisite({ ssm: ssmReturning(incomplete) }),
    ).resolves.toBeNull()
  })

  test('returns null when the prefix is empty — the account opted out', async () => {
    await expect(
      readCognitoPrerequisite({ ssm: ssmReturning({}) }),
    ).resolves.toBeNull()
  })

  // The allow-list: the credential chain could not produce credentials at all
  // (`CredentialsProviderError`, @smithy/core) and the prefix does not exist
  // (`ParameterNotFound`, SSM) are the only shapes that mean "the prerequisite
  // genuinely is not available here".
  test.each(['CredentialsProviderError', 'ParameterNotFound'])(
    'returns null on %s — the prerequisite is genuinely absent',
    async (name) => {
      await expect(
        readCognitoPrerequisite({ ssm: ssmThrowing(name) }),
      ).resolves.toBeNull()
    },
  )

  // Everything else is a read that should have worked. Skipping on these would
  // report auth coverage this workflow exists to guarantee and never had.
  test.each([
    ['AccessDeniedException', 'a role that cannot read the prefix'],
    ['ThrottlingException', 'a throttled read'],
    ['ExpiredTokenException', 'expired credentials'],
    ['TimeoutError', 'a network failure'],
  ])('rethrows %s — %s must not look like an opt-out', async (name) => {
    await expect(
      readCognitoPrerequisite({ ssm: ssmThrowing(name) }),
    ).rejects.toThrow(name)
  })
})

describe('cognito derived hosts', () => {
  test('issuerOf builds the token-validation issuer from region + poolId', () => {
    expect(issuerOf({ region: 'us-east-1', poolId: 'us-east-1_ABC' })).toBe(
      'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC',
    )
  })

  test('tokenEndpointOf builds the minting endpoint from domain + region', () => {
    expect(tokenEndpointOf({ domain: 'my-domain', region: 'us-east-1' })).toBe(
      'https://my-domain.auth.us-east-1.amazoncognito.com/oauth2/token',
    )
  })
})
