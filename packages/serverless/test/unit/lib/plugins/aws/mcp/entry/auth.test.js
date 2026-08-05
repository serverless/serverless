import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals'

// The rule under test is the audience decision and the discovery/caching
// wiring — not RSA math — so jose's verification step is mocked wholesale.
const createRemoteJWKSet = jest.fn((url) => ({ __jwksFor: url.toString() }))
const jwtVerify = jest.fn()
jest.unstable_mockModule('jose', () => ({ createRemoteJWKSet, jwtVerify }))

const { checkAudience, checkTokenClass, createTokenVerifier } =
  await import('../../../../../../../lib/plugins/aws/mcp/entry/lib/auth.mjs')

const issuer = 'https://example.auth0.com/'
const audiences = ['https://mcp.acme.com', 'clientAbc']

describe('checkAudience', () => {
  it('accepts a string aud that matches a configured audience', () => {
    expect(() =>
      checkAudience({ aud: 'https://mcp.acme.com' }, audiences),
    ).not.toThrow()
  })

  it('accepts an array aud when any entry matches', () => {
    expect(() =>
      checkAudience({ aud: ['https://other', 'clientAbc'] }, audiences),
    ).not.toThrow()
  })

  // aud is authoritative when present: a matching client_id must never buy a
  // token past a non-matching audience, or the confused-deputy hole the
  // audience check exists to close reopens.
  it('rejects a non-matching aud even when client_id matches', () => {
    expect(() =>
      checkAudience(
        { aud: 'https://someone-elses-api', client_id: 'clientAbc' },
        audiences,
      ),
    ).toThrow(/"aud"/)
  })

  // Cognito access tokens carry client_id and no aud at all.
  it('accepts a token with no aud whose client_id matches', () => {
    expect(() =>
      checkAudience({ client_id: 'clientAbc' }, audiences),
    ).not.toThrow()
  })

  it('rejects a token with no aud whose client_id does not match', () => {
    expect(() =>
      checkAudience({ client_id: 'otherClient' }, audiences),
    ).toThrow(/"client_id"/)
  })

  it('rejects a token carrying neither aud nor client_id', () => {
    expect(() => checkAudience({ sub: 'user-1' }, audiences)).toThrow(
      /"client_id"/,
    )
  })

  // An empty aud array carries no audience, so it takes the client_id path
  // rather than passing unchecked.
  it('treats an empty aud array as absent and falls back to client_id', () => {
    expect(() =>
      checkAudience({ aud: [], client_id: 'clientAbc' }, audiences),
    ).not.toThrow()
    expect(() =>
      checkAudience({ aud: [], client_id: 'otherClient' }, audiences),
    ).toThrow(/"client_id"/)
  })

  it('names the configured audiences in the rejection', () => {
    expect(() => checkAudience({ aud: 'nope' }, audiences)).toThrow(
      /https:\/\/mcp\.acme\.com/,
    )
  })
})

describe('checkTokenClass', () => {
  // A Cognito ID token's `aud` is the app client id — the same value that has
  // to be in auth.audiences for the pool's access tokens to pass at all — so
  // the audience rule alone cannot tell the two apart.
  it('rejects an ID token', () => {
    expect(() => checkTokenClass({ token_use: 'id' })).toThrow(/"token_use"/)
  })

  it('names the rejected claim value', () => {
    expect(() => checkTokenClass({ token_use: 'id' })).toThrow(/"id"/)
  })

  it('accepts an access token', () => {
    expect(() => checkTokenClass({ token_use: 'access' })).not.toThrow()
  })

  // Only Cognito issues the claim; every other issuer's access tokens have no
  // token_use at all and must not be affected by this rule.
  it('leaves a token carrying no token_use claim alone', () => {
    expect(() => checkTokenClass({ sub: 'user-1' })).not.toThrow()
  })

  it('rejects any other token class', () => {
    expect(() => checkTokenClass({ token_use: 'refresh' })).toThrow(/refresh/)
  })
})

describe('createTokenVerifier', () => {
  let fetchMock
  const originalFetch = globalThis.fetch

  const metadataResponse = (body, ok = true, status = 200) => ({
    ok,
    status,
    json: async () => body,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = jest.fn(async () =>
      metadataResponse({
        issuer,
        jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
      }),
    )
    globalThis.fetch = fetchMock
    jwtVerify.mockResolvedValue({
      payload: {
        aud: 'https://mcp.acme.com',
        client_id: 'clientAbc',
        scope: 'mcp profile',
        exp: 1893456000,
        sub: 'user-1',
      },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fails at construction when issuer or audiences are missing', () => {
    expect(() => createTokenVerifier({ audiences })).toThrow(/issuer/)
    expect(() => createTokenVerifier({ issuer, audiences: [] })).toThrow(
      /audiences/,
    )
  })

  it('discovers jwks_uri from the issuer OpenID configuration', async () => {
    await createTokenVerifier({ issuer, audiences })('token-1')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.auth0.com/.well-known/openid-configuration',
    )
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1)
    expect(createRemoteJWKSet.mock.calls[0][0].toString()).toBe(
      'https://example.auth0.com/.well-known/jwks.json',
    )
  })

  // Discovery happens on the request path, so an issuer that accepts the
  // connection and then stalls must not hold the Lambda open to its timeout.
  it('bounds the discovery request with an abort signal', async () => {
    await createTokenVerifier({ issuer, audiences })('token-1')
    const { signal } = fetchMock.mock.calls[0][1]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('appends the discovery path to an issuer without a trailing slash', async () => {
    const bare = 'https://example.auth0.com'
    fetchMock.mockResolvedValue(
      metadataResponse({
        issuer: bare,
        jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
      }),
    )
    await createTokenVerifier({ issuer: bare, audiences })('token-1')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.auth0.com/.well-known/openid-configuration',
    )
  })

  // RFC 8414 §3.3 / OIDC Discovery §4.3: the document's own issuer must match
  // the one it was fetched for, byte for byte. A mismatch means the metadata
  // belongs to some other issuer, so its keys must not be trusted for it.
  it('rejects a discovery document whose issuer does not match', async () => {
    fetchMock.mockResolvedValue(
      metadataResponse({
        issuer: 'https://attacker.example.com/',
        jwks_uri: 'https://attacker.example.com/.well-known/jwks.json',
      }),
    )
    const error = await createTokenVerifier({ issuer, audiences })(
      'token-1',
    ).catch((e) => e)
    expect(error.message).toContain('https://attacker.example.com/')
    expect(error.message).toContain(issuer)
    expect(createRemoteJWKSet).not.toHaveBeenCalled()
  })

  it('rejects a discovery document declaring no issuer', async () => {
    fetchMock.mockResolvedValue(
      metadataResponse({
        jwks_uri: 'https://example.auth0.com/.well-known/jwks.json',
      }),
    )
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).rejects.toThrow(/"issuer"/)
  })

  it('discovers once and reuses the key set across verifications', async () => {
    const verify = createTokenVerifier({ issuer, audiences })
    await verify('token-1')
    await verify('token-2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1)
    expect(jwtVerify).toHaveBeenCalledTimes(2)
  })

  // jose's `audience` option makes `aud` presence mandatory, which would
  // reject every Cognito access token — the rule lives in checkAudience.
  it('verifies against the issuer without passing jose an audience option', async () => {
    await createTokenVerifier({ issuer, audiences })('token-1')
    const [token, jwks, options] = jwtVerify.mock.calls[0]
    expect(token).toBe('token-1')
    expect(jwks).toEqual({
      __jwksFor: 'https://example.auth0.com/.well-known/jwks.json',
    })
    // `exp` is required at verification: the SDK's bearer gate turns a missing
    // expiresAt into an opaque 401, so jose must reject it with a clear reason.
    expect(options).toEqual({ issuer, requiredClaims: ['exp'] })
    expect(Object.keys(options)).not.toContain('audience')
  })

  it('returns the SDK AuthInfo shape', async () => {
    expect(await createTokenVerifier({ issuer, audiences })('token-1')).toEqual(
      {
        token: 'token-1',
        clientId: 'clientAbc',
        scopes: ['mcp', 'profile'],
        // The SDK's bearer gate refuses a token whose expiresAt is not a number.
        expiresAt: 1893456000,
        extra: {
          claims: {
            aud: 'https://mcp.acme.com',
            client_id: 'clientAbc',
            scope: 'mcp profile',
            exp: 1893456000,
            sub: 'user-1',
          },
        },
      },
    )
  })

  it('falls back to azp for the client id and reads array scp scopes', async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        aud: 'https://mcp.acme.com',
        azp: 'authZeroClient',
        scp: ['mcp'],
      },
    })
    const authInfo = await createTokenVerifier({ issuer, audiences })('token-1')
    expect(authInfo.clientId).toBe('authZeroClient')
    expect(authInfo.scopes).toEqual(['mcp'])
  })

  it('reports no scopes when the token carries none', async () => {
    jwtVerify.mockResolvedValue({
      payload: { aud: 'https://mcp.acme.com', client_id: 'clientAbc' },
    })
    expect(
      (await createTokenVerifier({ issuer, audiences })('token-1')).scopes,
    ).toEqual([])
  })

  it('applies the audience rule to the verified payload', async () => {
    jwtVerify.mockResolvedValue({
      payload: { aud: 'https://someone-elses-api', client_id: 'clientAbc' },
    })
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).rejects.toThrow(/"aud"/)
  })

  // The whole point of the token-class rule: a Cognito ID token's aud is the
  // app client id, so it satisfies the audience check on its own.
  it('rejects a Cognito ID token whose aud matches a configured audience', async () => {
    jwtVerify.mockResolvedValue({
      payload: { aud: 'clientAbc', token_use: 'id', exp: 1 },
    })
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).rejects.toThrow(/"token_use"/)
  })

  it('accepts the same issuer access token', async () => {
    jwtVerify.mockResolvedValue({
      payload: { client_id: 'clientAbc', token_use: 'access', exp: 1 },
    })
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).resolves.toMatchObject({ clientId: 'clientAbc' })
  })

  it('propagates a signature or issuer failure from jose', async () => {
    jwtVerify.mockRejectedValue(new Error('signature verification failed'))
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).rejects.toThrow(/signature verification failed/)
  })

  it('names the metadata URL when discovery fails', async () => {
    fetchMock.mockResolvedValue(metadataResponse({}, false, 404))
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).rejects.toThrow(/\.well-known\/openid-configuration/)
  })

  it('rejects an OpenID configuration without jwks_uri', async () => {
    fetchMock.mockResolvedValue(metadataResponse({ issuer }))
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).rejects.toThrow(/jwks_uri/)
  })

  // A relative or otherwise unparseable jwks_uri must not escape as a bare
  // TypeError from the URL constructor.
  it('rejects a jwks_uri that is not an absolute URL', async () => {
    fetchMock.mockResolvedValue(
      metadataResponse({ issuer, jwks_uri: '/.well-known/jwks.json' }),
    )
    const error = await createTokenVerifier({ issuer, audiences })(
      'token-1',
    ).catch((e) => e)
    expect(error).not.toBeInstanceOf(TypeError)
    expect(error.message).toContain('.well-known/openid-configuration')
    expect(error.message).toContain('/.well-known/jwks.json')
    expect(createRemoteJWKSet).not.toHaveBeenCalled()
  })

  // Signing keys fetched over plaintext can be substituted in transit, and a
  // substituted key set mints tokens this server accepts - so a discovery
  // document advertising an http:// jwks_uri is refused rather than followed.
  it('rejects a jwks_uri that is not HTTPS', async () => {
    fetchMock.mockResolvedValue(
      metadataResponse({
        issuer,
        jwks_uri: 'http://example.auth0.com/.well-known/jwks.json',
      }),
    )
    const error = await createTokenVerifier({ issuer, audiences })(
      'token-1',
    ).catch((e) => e)
    expect(error.message).toContain(
      'http://example.auth0.com/.well-known/jwks.json',
    )
    expect(error.message).toContain('HTTPS')
    expect(createRemoteJWKSet).not.toHaveBeenCalled()
  })

  it('accepts an https jwks_uri', async () => {
    await expect(
      createTokenVerifier({ issuer, audiences })('token-1'),
    ).resolves.toMatchObject({ clientId: 'clientAbc' })
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1)
  })

  // A transient discovery failure must not wedge the container for its whole
  // life: the next request retries.
  it('retries discovery after a failure instead of caching the rejection', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    const verify = createTokenVerifier({ issuer, audiences })
    await expect(verify('token-1')).rejects.toThrow(/ECONNRESET/)
    await expect(verify('token-2')).resolves.toMatchObject({
      clientId: 'clientAbc',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
