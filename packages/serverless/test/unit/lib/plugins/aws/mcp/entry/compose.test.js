import { describe, it, expect, jest } from '@jest/globals'
import path from 'node:path'
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'

const {
  readEntryEnv,
  resolveServerModulePath,
  clientFacingLocation,
  protectedResourceMetadataUrl,
  asOAuthTokenVerifier,
  isMetadataRequest,
  buildApp,
} =
  await import('../../../../../../../lib/plugins/aws/mcp/entry/lib/compose.mjs')

// A REST API (payload v1) event as API Gateway delivers it: `path` is the
// stage-less resource path, `requestContext.path` carries the stage prefix, and
// the scheme only exists as a forwarded header.
const restEvent = ({
  path = '/crm/mcp',
  stage = 'dev',
  domainName = 'abc123.execute-api.us-east-1.amazonaws.com',
  headers = {},
} = {}) => ({
  version: '1.0',
  httpMethod: 'POST',
  path,
  headers: {
    Host: domainName,
    'X-Forwarded-Proto': 'https',
    ...headers,
  },
  requestContext: { domainName, stage, path: `/${stage}${path}` },
})

describe('mcp entry composition', () => {
  describe('readEntryEnv', () => {
    it('names SERVERLESS_MCP_SERVER_MODULE when it is missing', () => {
      expect(() => readEntryEnv({})).toThrow(/SERVERLESS_MCP_SERVER_MODULE/)
    })

    it('names SERVERLESS_MCP_SERVER_MODULE when it is empty', () => {
      expect(() => readEntryEnv({ SERVERLESS_MCP_SERVER_MODULE: '' })).toThrow(
        /SERVERLESS_MCP_SERVER_MODULE/,
      )
    })

    it('reads the module path with no auth and no state key', () => {
      expect(
        readEntryEnv({ SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs' }),
      ).toEqual({
        serverModulePath: 'src/crm.mjs',
        auth: undefined,
        publicBaseUrl: undefined,
        stateKeyRef: undefined,
        region: undefined,
        taskRoot: undefined,
      })
    })

    it('carries the public base URL override through', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_PUBLIC_BASE_URL: 'https://api.acme.com/mcp',
        }).publicBaseUrl,
      ).toBe('https://api.acme.com/mcp')
    })

    it('treats an empty public base URL as unset', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_PUBLIC_BASE_URL: '',
        }).publicBaseUrl,
      ).toBeUndefined()
    })

    it('treats the presence of an issuer as auth being configured', () => {
      const config = readEntryEnv({
        SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
        SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
        SERVERLESS_MCP_AUTH_AUDIENCES: '["aud-one","aud-two"]',
      })
      expect(config.auth).toEqual({
        issuer: 'https://issuer.example.com',
        audiences: ['aud-one', 'aud-two'],
      })
    })

    // The plugin writes the list as JSON precisely so a separator inside an
    // audience survives (`../../lib/synthesize-functions.js`); splitting it here
    // would accept tokens for two audiences nobody configured.
    it('keeps an audience that contains a comma whole', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
          SERVERLESS_MCP_AUTH_AUDIENCES: '["api://foo,bar"]',
        }).auth.audiences,
      ).toEqual(['api://foo,bar'])
    })

    // Defense for a value this entry did not write - an artifact deployed by an
    // older release, or a hand-edited function configuration. A single audience
    // is the safe reading: it can only ever reject more than intended, while
    // splitting could accept a value nobody configured.
    it('treats a non-JSON value as one audience, never splitting it', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
          SERVERLESS_MCP_AUTH_AUDIENCES: ' api://foo,bar ',
        }).auth.audiences,
      ).toEqual(['api://foo,bar'])
    })

    it('reads a bare JSON string as one audience', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
          SERVERLESS_MCP_AUTH_AUDIENCES: '"api://foo,bar"',
        }).auth.audiences,
      ).toEqual(['api://foo,bar'])
    })

    it('drops non-string entries of a JSON list', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
          SERVERLESS_MCP_AUTH_AUDIENCES: '["aud-one",null,7,""]',
        }).auth.audiences,
      ).toEqual(['aud-one'])
    })

    it('leaves an issuer with no audiences to fail in the verifier', () => {
      const config = readEntryEnv({
        SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
        SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
      })
      expect(config.auth).toEqual({
        issuer: 'https://issuer.example.com',
        audiences: [],
      })
    })

    it('carries the state key reference, region and task root through', () => {
      expect(
        readEntryEnv({
          SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
          SERVERLESS_MCP_STATE_KEY_REF: 'arn:aws:secretsmanager:::secret:k',
          AWS_REGION: 'eu-west-1',
          LAMBDA_TASK_ROOT: '/var/task',
        }),
      ).toMatchObject({
        stateKeyRef: 'arn:aws:secretsmanager:::secret:k',
        region: 'eu-west-1',
        taskRoot: '/var/task',
      })
    })
  })

  describe('resolveServerModulePath', () => {
    const exists = (present) => (candidate) => present.includes(candidate)
    // Both the stubbed filesystem and the expectations are built with the
    // same `path.resolve` the resolver uses, so the assertions hold on every
    // runner: on Windows, resolving against '/var/task' yields a
    // drive-qualified backslash path, and a POSIX string literal would never
    // match it.
    const at = (relative) => path.resolve('/var/task', relative)

    it('resolves against the task root', () => {
      expect(
        resolveServerModulePath({
          modulePath: 'src/crm.mjs',
          taskRoot: '/var/task',
          exists: exists([at('src/crm.mjs')]),
        }),
      ).toBe(at('src/crm.mjs'))
    })

    it('finds the built JavaScript sibling of a TypeScript source path', () => {
      // `server:` names the source file, but what ships in the artifact is
      // whatever the bundler emitted next to it.
      expect(
        resolveServerModulePath({
          modulePath: 'src/crm.ts',
          taskRoot: '/var/task',
          exists: exists([at('src/crm.js')]),
        }),
      ).toBe(at('src/crm.js'))
    })

    it('prefers the configured path over a sibling', () => {
      expect(
        resolveServerModulePath({
          modulePath: 'src/crm.mjs',
          taskRoot: '/var/task',
          exists: exists([at('src/crm.mjs'), at('src/crm.js')]),
        }),
      ).toBe(at('src/crm.mjs'))
    })

    it('skips a TypeScript source that also reached the artifact', () => {
      // `package.patterns` can ship the sources alongside the build output. A
      // TypeScript path is never loadable at runtime — node20 refuses the
      // extension outright and node22+ type-strips it, importing unbundled
      // source with its bare imports unresolved — so it is not a candidate at
      // all and the built sibling wins.
      expect(
        resolveServerModulePath({
          modulePath: 'src/crm.ts',
          taskRoot: '/var/task',
          exists: exists([at('src/crm.ts'), at('src/crm.js')]),
        }),
      ).toBe(at('src/crm.js'))
    })

    it('probes .mjs ahead of .js', () => {
      expect(
        resolveServerModulePath({
          modulePath: 'src/crm.ts',
          taskRoot: '/var/task',
          exists: exists([at('src/crm.js'), at('src/crm.mjs')]),
        }),
      ).toBe(at('src/crm.mjs'))
    })

    it('falls back to the working directory with no task root', () => {
      const resolved = path.resolve(process.cwd(), 'src/crm.mjs')
      expect(
        resolveServerModulePath({
          modulePath: 'src/crm.mjs',
          taskRoot: undefined,
          exists: exists([resolved]),
        }),
      ).toBe(resolved)
    })

    it('names the configured path and every candidate when none exists', () => {
      let error
      try {
        resolveServerModulePath({
          modulePath: 'src/crm.ts',
          taskRoot: '/var/task',
          exists: exists([]),
        })
      } catch (thrown) {
        error = thrown
      }
      expect(error).toBeDefined()
      expect(error.message).toContain('src/crm.ts')
      expect(error.message).toContain(at('src/crm.js'))
      expect(error.message).toContain(at('src/crm.mjs'))
    })
  })

  describe('clientFacingLocation', () => {
    it('restores the stage prefix that the adapter URL drops', () => {
      const location = clientFacingLocation({
        event: restEvent(),
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
      })
      expect(location).toMatchObject({
        origin: 'https://abc123.execute-api.us-east-1.amazonaws.com',
        mountPrefix: '/dev',
        appPath: '/crm/mcp',
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp',
      })
    })

    // What this pins is the subtraction MECHANISM given a `requestContext.path`
    // that carries a prefix — not the path semantics of a live REST custom
    // domain, which are not verified here (Task 6's live probe is what settles
    // whether a base-path mapping survives in `requestContext.path`). Wherever
    // it does not, SERVERLESS_MCP_PUBLIC_BASE_URL is the authoritative answer.
    it('subtracts a prefix-bearing requestContext.path the same way', () => {
      const event = restEvent({ domainName: 'api.example.com' })
      event.requestContext.path = '/v1/crm/mcp'
      const location = clientFacingLocation({
        event,
        requestUrl: 'https://api.example.com/crm/mcp',
      })
      expect(location).toMatchObject({
        origin: 'https://api.example.com',
        mountPrefix: '/v1',
        requestUrl: 'https://api.example.com/v1/crm/mcp',
      })
    })

    it('keeps the query string the adapter already reconstructed', () => {
      const location = clientFacingLocation({
        event: restEvent(),
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp?a=1&b=2',
      })
      expect(location.requestUrl).toBe(
        'https://abc123.execute-api.us-east-1.amazonaws.com/dev/crm/mcp?a=1&b=2',
      )
    })

    it('ignores a forwarded http scheme on an API Gateway request', () => {
      // API Gateway serves HTTPS only, so `http` here is client-supplied noise;
      // honoring it would advertise an http resource identifier and metadata
      // URL, which MCP clients reject.
      const location = clientFacingLocation({
        event: restEvent({
          domainName: 'api.example.com',
          headers: { 'X-Forwarded-Proto': 'http' },
        }),
        requestUrl: 'https://api.example.com/crm/mcp',
      })
      expect(location.origin).toBe('https://api.example.com')
    })

    it('honors a forwarded http scheme with no API Gateway domain', () => {
      // Off API Gateway (a local emulator, a proxy in front of a plain server)
      // the forwarded header is all there is, and the adapter URL hardcodes
      // https.
      const location = clientFacingLocation({
        event: {
          path: '/crm/mcp',
          headers: { Host: 'localhost:3000', 'X-Forwarded-Proto': 'http' },
        },
        requestUrl: 'https://localhost:3000/crm/mcp',
      })
      expect(location.origin).toBe('http://localhost:3000')
    })

    it('ignores a client-supplied X-Forwarded-Host', () => {
      // API Gateway routes on the Host header, so `Host` is trustworthy while
      // X-Forwarded-Host is attacker-controlled — honoring it would let a
      // caller move the advertised metadata URL onto their own domain.
      const location = clientFacingLocation({
        event: restEvent({ headers: { 'X-Forwarded-Host': 'evil.example' } }),
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
      })
      expect(location.origin).toBe(
        'https://abc123.execute-api.us-east-1.amazonaws.com',
      )
    })

    it('falls back to the adapter URL when there is no Lambda event', () => {
      expect(
        clientFacingLocation({
          event: undefined,
          requestUrl: 'http://localhost:3000/crm/mcp?x=1',
        }),
      ).toMatchObject({
        origin: 'http://localhost:3000',
        mountPrefix: '',
        appPath: '/crm/mcp',
        requestUrl: 'http://localhost:3000/crm/mcp?x=1',
      })
    })

    it('reads a payload v2 event with no stage prefix', () => {
      const location = clientFacingLocation({
        event: {
          version: '2.0',
          rawPath: '/crm/mcp',
          headers: { host: 'abc.lambda-url.us-east-1.on.aws' },
          requestContext: {
            domainName: 'abc.lambda-url.us-east-1.on.aws',
            http: { path: '/crm/mcp', method: 'POST' },
          },
        },
        requestUrl: 'https://abc.lambda-url.us-east-1.on.aws/crm/mcp',
      })
      expect(location).toMatchObject({
        mountPrefix: '',
        appPath: '/crm/mcp',
        requestUrl: 'https://abc.lambda-url.us-east-1.on.aws/crm/mcp',
      })
    })

    // A REST custom domain strips its base-path mapping before the function
    // sees the request, so it is absent from `event.path` and may be absent
    // from `requestContext.path` too — wherever it is, reconstruction cannot
    // recover it. The deployment knows the mapping and hands it over as an
    // absolute URL, which then wins over anything the event says.
    describe('with a public base URL override', () => {
      const mappedEvent = () => {
        const event = restEvent()
        // The base-path mapping is already gone from both paths.
        event.requestContext.domainName = 'api.acme.com'
        event.requestContext.path = '/crm/mcp'
        event.headers.Host = 'api.acme.com'
        return event
      }

      it('uses the override verbatim ahead of the app-relative path', () => {
        expect(
          clientFacingLocation({
            event: mappedEvent(),
            requestUrl: 'https://api.acme.com/crm/mcp',
            publicBaseUrl: 'https://api.acme.com/assistant',
          }),
        ).toMatchObject({
          origin: 'https://api.acme.com',
          mountPrefix: '/assistant',
          appPath: '/crm/mcp',
          requestUrl: 'https://api.acme.com/assistant/crm/mcp',
        })
      })

      it('advertises the metadata URL under the override', () => {
        const location = clientFacingLocation({
          event: mappedEvent(),
          requestUrl: 'https://api.acme.com/crm/mcp',
          publicBaseUrl: 'https://api.acme.com/assistant',
        })
        expect(protectedResourceMetadataUrl(location)).toBe(
          'https://api.acme.com/assistant/.well-known/oauth-protected-resource/crm/mcp',
        )
      })

      it('keeps the query string the adapter reconstructed', () => {
        expect(
          clientFacingLocation({
            event: mappedEvent(),
            requestUrl: 'https://api.acme.com/crm/mcp?a=1',
            publicBaseUrl: 'https://api.acme.com/assistant',
          }).requestUrl,
        ).toBe('https://api.acme.com/assistant/crm/mcp?a=1')
      })

      // The override wins over everything the event says: that is the whole
      // point, since the event is what cannot see the mapping.
      it('overrides the host and the stage prefix the event carries', () => {
        expect(
          clientFacingLocation({
            event: restEvent(),
            requestUrl:
              'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
            publicBaseUrl: 'https://mcp.acme.com',
          }),
        ).toMatchObject({
          origin: 'https://mcp.acme.com',
          mountPrefix: '',
          requestUrl: 'https://mcp.acme.com/crm/mcp',
        })
      })

      it('tolerates a trailing slash on the override', () => {
        expect(
          clientFacingLocation({
            event: mappedEvent(),
            requestUrl: 'https://api.acme.com/crm/mcp',
            publicBaseUrl: 'https://api.acme.com/assistant/',
          }).requestUrl,
        ).toBe('https://api.acme.com/assistant/crm/mcp')
      })

      it('names the variable when the override is not an absolute URL', () => {
        expect(() =>
          clientFacingLocation({
            event: mappedEvent(),
            requestUrl: 'https://api.acme.com/crm/mcp',
            publicBaseUrl: '/assistant',
          }),
        ).toThrow(/SERVERLESS_MCP_PUBLIC_BASE_URL/)
      })

      // `new URL` accepts any scheme, and a bare host is parsed as one
      // (`api.acme.com/assistant` → protocol `api.acme.com:`), so parsing alone
      // would let a value through that no MCP client can reach.
      it.each(['mailto:someone@acme.com', 'api.acme.com/assistant'])(
        'names the variable when the override is not http or https (%s)',
        (publicBaseUrl) => {
          expect(() =>
            clientFacingLocation({
              event: mappedEvent(),
              requestUrl: 'https://api.acme.com/crm/mcp',
              publicBaseUrl,
            }),
          ).toThrow(/SERVERLESS_MCP_PUBLIC_BASE_URL/)
        },
      )
    })
  })

  describe('protectedResourceMetadataUrl', () => {
    it('inserts the well-known segment behind the mount prefix', () => {
      // This must be the path the Framework actually registered on the REST
      // API (`lib/plugins/aws/mcp/lib/route-descriptors.js`), under the stage.
      expect(
        protectedResourceMetadataUrl({
          origin: 'https://abc123.execute-api.us-east-1.amazonaws.com',
          mountPrefix: '/dev',
          appPath: '/crm/mcp',
        }),
      ).toBe(
        'https://abc123.execute-api.us-east-1.amazonaws.com/dev/.well-known/oauth-protected-resource/crm/mcp',
      )
    })

    it('needs no prefix when the app is mounted at the root', () => {
      expect(
        protectedResourceMetadataUrl({
          origin: 'https://api.example.com',
          mountPrefix: '',
          appPath: '/crm/mcp',
        }),
      ).toBe(
        'https://api.example.com/.well-known/oauth-protected-resource/crm/mcp',
      )
    })

    it('round-trips: the advertised URL resolves back to the resource', () => {
      const location = clientFacingLocation({
        event: restEvent(),
        requestUrl:
          'https://abc123.execute-api.us-east-1.amazonaws.com/crm/mcp',
      })
      const advertised = protectedResourceMetadataUrl(location)
      const metadataEvent = restEvent({
        path: '/.well-known/oauth-protected-resource/crm/mcp',
      })
      const metadataLocation = clientFacingLocation({
        event: metadataEvent,
        requestUrl: `https://abc123.execute-api.us-east-1.amazonaws.com${metadataEvent.path}`,
      })
      expect(metadataLocation.requestUrl).toBe(advertised)
    })
  })

  describe('isMetadataRequest', () => {
    it.each([
      ['GET', '/.well-known/oauth-protected-resource/crm/mcp', true],
      ['POST', '/.well-known/oauth-protected-resource/crm/mcp', false],
      ['GET', '/crm/mcp', false],
      ['GET', '/.well-known/oauth-protected-resourceX/crm/mcp', false],
      ['GET', '/x.well-known/oauth-protected-resource/crm/mcp', false],
    ])('%s %s -> %s', (method, path, expected) => {
      expect(isMetadataRequest({ method, path })).toBe(expected)
    })
  })

  describe('asOAuthTokenVerifier', () => {
    it('exposes the verifier under the SDK verifier method name', async () => {
      const authInfo = { token: 't', clientId: 'c', scopes: [], expiresAt: 1 }
      const verifier = asOAuthTokenVerifier(async () => authInfo)
      await expect(verifier.verifyAccessToken('t')).resolves.toBe(authInfo)
    })

    it('rethrows a plain Error as an invalid_token OAuthError', async () => {
      // Without this the SDK's challenge builder answers 500 server_error and
      // the 401 + WWW-Authenticate discovery flow never fires.
      const verifier = asOAuthTokenVerifier(async () => {
        throw new Error('the token is stale')
      })
      const error = await verifier.verifyAccessToken('t').catch((e) => e)
      expect(OAuthError.isInstance(error)).toBe(true)
      expect(error.code).toBe(OAuthErrorCode.InvalidToken)
      expect(error.message).toBe('the token is stale')
    })

    it('strips double quotes out of the rethrown message', async () => {
      // The message becomes `error_description` inside a quoted-string in the
      // WWW-Authenticate challenge, and RFC 9110 quoted-strings have no escape
      // that every client parser honors — an embedded quote would end the
      // parameter early and hand the client a truncated description.
      const verifier = asOAuthTokenVerifier(async () => {
        throw new Error('audience "shop-api" is not in the allowed list')
      })
      const error = await verifier.verifyAccessToken('t').catch((e) => e)
      expect(error.message).toBe('audience shop-api is not in the allowed list')
    })

    // Stripping the quotes alone leaves the unquoted `token` alternative of
    // RFC 9110's auth-param open: a parser taking it reads up to whitespace and
    // then looks for further `name=value` pairs, so an `=` still inside the
    // text would graft a parameter onto the challenge.
    it('strips equals signs so no auth-param can be grafted on', async () => {
      const verifier = asOAuthTokenVerifier(async () => {
        throw new Error('bad token, realm=evil error=insufficient_scope')
      })
      const error = await verifier.verifyAccessToken('t').catch((e) => e)
      expect(error.message).toBe('bad token, realmevil errorinsufficient_scope')
    })

    it('caps the length of the rethrown message', async () => {
      const verifier = asOAuthTokenVerifier(async () => {
        throw new Error('x'.repeat(500))
      })
      const error = await verifier.verifyAccessToken('t').catch((e) => e)
      expect(error.message).toBe('x'.repeat(256))
    })

    it('leaves an OAuthError from the verifier untouched', async () => {
      const thrown = new OAuthError(OAuthErrorCode.InsufficientScope, 'nope')
      const verifier = asOAuthTokenVerifier(async () => {
        throw thrown
      })
      await expect(verifier.verifyAccessToken('t')).rejects.toBe(thrown)
    })
  })

  describe('buildApp', () => {
    const issuer = 'https://issuer.example.com'
    const origin = 'https://abc123.execute-api.us-east-1.amazonaws.com'
    const metadataPath = '/.well-known/oauth-protected-resource/crm/mcp'

    const fakeHandler = () => ({
      calls: [],
      fetch(request, options) {
        this.calls.push({ request, options })
        return new Response('ok', { status: 202 })
      },
    })

    const post = (app, { body = { jsonrpc: '2.0' }, headers = {} } = {}) =>
      app.request(
        `${origin}/crm/mcp`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body),
        },
        { event: restEvent() },
      )

    it('builds without logging the host-guard warning at cold start', async () => {
      // `createMcpHonoApp({ host: '0.0.0.0' })` warns about "binding without
      // DNS rebinding protection" — advice that does not apply behind API
      // Gateway and that fires even with bearer auth configured. Every cold
      // start would print it to the user's logs.
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        buildApp({
          mcpHandler: fakeHandler(),
          verifier: asOAuthTokenVerifier(jest.fn()),
          issuer,
        })
        buildApp({ mcpHandler: fakeHandler() })
        expect(warn).not.toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })

    it('forwards to the handler with the pre-parsed body when auth is off', async () => {
      const mcpHandler = fakeHandler()
      const app = buildApp({ mcpHandler })
      const response = await post(app)
      expect(response.status).toBe(202)
      expect(mcpHandler.calls).toHaveLength(1)
      expect(mcpHandler.calls[0].options.parsedBody).toEqual({
        jsonrpc: '2.0',
      })
      expect(mcpHandler.calls[0].options.authInfo).toBeUndefined()
    })

    it('has no metadata route at all when auth is off', async () => {
      const mcpHandler = fakeHandler()
      const app = buildApp({ mcpHandler })
      const response = await app.request(
        `${origin}${metadataPath}`,
        { method: 'GET' },
        { event: restEvent({ path: metadataPath, headers: {} }) },
      )
      expect(response.status).toBe(202)
      expect(mcpHandler.calls).toHaveLength(1)
    })

    it('answers an unauthenticated request with a stage-aware challenge', async () => {
      const mcpHandler = fakeHandler()
      const verify = jest.fn()
      const app = buildApp({
        mcpHandler,
        verifier: asOAuthTokenVerifier(verify),
        issuer,
      })
      const response = await post(app)
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toContain(
        `resource_metadata="${origin}/dev${metadataPath}"`,
      )
      expect(verify).not.toHaveBeenCalled()
      expect(mcpHandler.calls).toHaveLength(0)
    })

    it('answers a rejected token with 401 rather than 500', async () => {
      const mcpHandler = fakeHandler()
      const app = buildApp({
        mcpHandler,
        verifier: asOAuthTokenVerifier(async () => {
          throw new Error('aud mismatch')
        }),
        issuer,
      })
      const response = await post(app, {
        headers: { authorization: 'Bearer nope' },
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: 'invalid_token',
        error_description: 'aud mismatch',
      })
      expect(mcpHandler.calls).toHaveLength(0)
    })

    it('forwards the verified AuthInfo to the handler', async () => {
      const mcpHandler = fakeHandler()
      const authInfo = {
        token: 'good',
        clientId: 'c',
        scopes: ['mcp'],
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      }
      const app = buildApp({
        mcpHandler,
        verifier: asOAuthTokenVerifier(async () => authInfo),
        issuer,
      })
      const response = await post(app, {
        headers: { authorization: 'Bearer good' },
      })
      expect(response.status).toBe(202)
      expect(mcpHandler.calls[0].options.authInfo).toBe(authInfo)
      expect(mcpHandler.calls[0].options.parsedBody).toEqual({
        jsonrpc: '2.0',
      })
    })

    it('serves the metadata document without a token', async () => {
      const mcpHandler = fakeHandler()
      const verify = jest.fn()
      const app = buildApp({
        mcpHandler,
        verifier: asOAuthTokenVerifier(verify),
        issuer,
      })
      const response = await app.request(
        `${origin}${metadataPath}`,
        { method: 'GET' },
        { event: restEvent({ path: metadataPath }) },
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(await response.json()).toEqual({
        resource: `${origin}/dev/crm/mcp`,
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
      })
      expect(verify).not.toHaveBeenCalled()
      expect(mcpHandler.calls).toHaveLength(0)
    })

    it('advertises the public base URL in both the challenge and the document', async () => {
      const publicBaseUrl = 'https://api.acme.com/assistant'
      const app = buildApp({
        mcpHandler: fakeHandler(),
        verifier: asOAuthTokenVerifier(jest.fn()),
        issuer,
        publicBaseUrl,
      })
      const challenge = await post(app)
      expect(challenge.headers.get('www-authenticate')).toContain(
        `resource_metadata="${publicBaseUrl}${metadataPath}"`,
      )
      const document = await app.request(
        `${origin}${metadataPath}`,
        { method: 'GET' },
        { event: restEvent({ path: metadataPath }) },
      )
      expect(await document.json()).toMatchObject({
        resource: `${publicBaseUrl}/crm/mcp`,
      })
    })
  })
})
