import { describe, it, expect, jest } from '@jest/globals'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'

const composeModulePath =
  '../../../../../../../lib/plugins/aws/mcp/entry/lib/compose.mjs'

const composeModule = await import(composeModulePath)
const { readEntryEnv, resolveServerModulePath, buildApp } = composeModule

// A REST API (payload v1) event as API Gateway delivers it: `path` is the
// stage-less resource path and `requestContext.path` carries the stage prefix.
// The entry no longer reconstructs a client-facing URL from any of that, so the
// event exists here only to prove the app is indifferent to it.
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
  // The entry is transport and lifecycle only: token verification and
  // protected-resource discovery are the deployment's to configure on the API,
  // not this function's to perform. Nothing may reintroduce them here.
  it('exports nothing but the environment, module and app composition', () => {
    expect(Object.keys(composeModule).sort()).toEqual([
      'buildApp',
      'readEntryEnv',
      'resolveServerModulePath',
    ])
  })

  describe('readEntryEnv', () => {
    it('names SERVERLESS_MCP_SERVER_MODULE when it is missing', () => {
      expect(() => readEntryEnv({})).toThrow(/SERVERLESS_MCP_SERVER_MODULE/)
    })

    it('names SERVERLESS_MCP_SERVER_MODULE when it is empty', () => {
      expect(() => readEntryEnv({ SERVERLESS_MCP_SERVER_MODULE: '' })).toThrow(
        /SERVERLESS_MCP_SERVER_MODULE/,
      )
    })

    it('teaches what the variable is and who sets it', () => {
      expect(() => readEntryEnv({})).toThrow(/"server:" property/)
    })

    it('reads the module path with no state key', () => {
      expect(
        readEntryEnv({ SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs' }),
      ).toEqual({
        serverModulePath: 'src/crm.mjs',
        stateKeyRef: undefined,
        region: undefined,
        taskRoot: undefined,
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
      ).toEqual({
        serverModulePath: 'src/crm.mjs',
        stateKeyRef: 'arn:aws:secretsmanager:::secret:k',
        region: 'eu-west-1',
        taskRoot: '/var/task',
      })
    })

    // A function deployed by an earlier release still carries these in its
    // environment. They describe verification this entry no longer performs, so
    // they must not reappear in the configuration it reads.
    it('reads nothing from the auth variables of an earlier release', () => {
      const config = readEntryEnv({
        SERVERLESS_MCP_SERVER_MODULE: 'src/crm.mjs',
        SERVERLESS_MCP_AUTH_ISSUER: 'https://issuer.example.com',
        SERVERLESS_MCP_AUTH_AUDIENCES: '["aud-one"]',
        SERVERLESS_MCP_PUBLIC_BASE_URL: 'https://api.acme.com/assistant',
      })
      expect(Object.keys(config).sort()).toEqual([
        'region',
        'serverModulePath',
        'stateKeyRef',
        'taskRoot',
      ])
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

  describe('buildApp', () => {
    const origin = 'https://abc123.execute-api.us-east-1.amazonaws.com'

    const fakeHandler = (response) => ({
      calls: [],
      fetch(request, options) {
        this.calls.push({ request, options })
        return response ?? new Response('ok', { status: 202 })
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

    it('builds without logging the host-guard warning at cold start', () => {
      // `createMcpHonoApp({ host: '0.0.0.0' })` warns about "binding without
      // DNS rebinding protection" — advice that does not apply behind API
      // Gateway. Every cold start would print it to the user's logs.
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        buildApp({ mcpHandler: fakeHandler() })
        expect(warn).not.toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })

    it('forwards to the handler with the pre-parsed body', async () => {
      const mcpHandler = fakeHandler()
      const app = buildApp({ mcpHandler })
      const response = await post(app)
      expect(response.status).toBe(202)
      expect(mcpHandler.calls).toHaveLength(1)
      expect(mcpHandler.calls[0].options).toEqual({
        parsedBody: { jsonrpc: '2.0' },
      })
    })

    it('returns the handler response verbatim', async () => {
      const handlerResponse = new Response('body', {
        status: 207,
        headers: { 'x-marker': 'from-handler' },
      })
      const app = buildApp({ mcpHandler: fakeHandler(handlerResponse) })
      const response = await post(app)
      expect(response).toBe(handlerResponse)
      expect(response.headers.get('x-marker')).toBe('from-handler')
    })

    it('hands the untouched raw request to the handler', async () => {
      const mcpHandler = fakeHandler()
      const app = buildApp({ mcpHandler })
      await post(app, { headers: { authorization: 'Bearer whatever' } })
      const [{ request }] = mcpHandler.calls
      expect(request.method).toBe('POST')
      expect(new URL(request.url).pathname).toBe('/crm/mcp')
      // The entry does not read, strip or act on the Authorization header — it
      // belongs to the user's server (and to the API's own authorizer).
      expect(request.headers.get('authorization')).toBe('Bearer whatever')
    })

    // One MCP server per function means one catch-all route: there is no path
    // or method the app answers on its own.
    it.each([
      ['GET', '/crm/mcp'],
      ['DELETE', '/crm/mcp'],
      ['OPTIONS', '/crm/mcp'],
      ['GET', '/.well-known/oauth-protected-resource/crm/mcp'],
      ['POST', '/anything/else'],
    ])('routes %s %s to the handler', async (method, requestPath) => {
      const mcpHandler = fakeHandler()
      const app = buildApp({ mcpHandler })
      const response = await app.request(
        `${origin}${requestPath}`,
        { method },
        { event: restEvent({ path: requestPath }) },
      )
      expect(response.status).toBe(202)
      expect(mcpHandler.calls).toHaveLength(1)
    })

    // Hono's `#handleError` rethrows anything that is not an `Error`, so these
    // escape `app.fetch` unless the route catches them — and the Lambda bridge
    // answers an escaped rejection with error text and no prelude, i.e. a 200.
    it.each([
      ['a thrown string', 'boom'],
      ['a rejected plain object', { code: -32000 }],
      ['a rejected null', null],
    ])(
      'answers a 500 when the handler fails with %s',
      async (_label, thrown) => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
          const app = buildApp({
            mcpHandler: {
              fetch: async () => {
                throw thrown
              },
            },
          })
          const response = await post(app)

          expect(response.status).toBe(500)
          // Nothing of the throwable reaches the client.
          expect(await response.text()).toBe('Internal Server Error')
          // The body is text, and says so - the sibling 500 hono answers for a
          // plain `Error` carries the same content type, so the two 500s a
          // client can see are not told apart by their headers.
          expect(response.headers.get('content-type')).toBe(
            'text/plain; charset=UTF-8',
          )
          expect(error).toHaveBeenCalled()
        } finally {
          error.mockRestore()
        }
      },
    )

    // A plain `Error` is Hono's to answer, and it answers 500 — so the status a
    // client sees does not depend on what the server threw.
    it('leaves a plain Error to hono, which answers 500', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const app = buildApp({
          mcpHandler: {
            fetch: async () => {
              throw new Error('boom')
            },
          },
        })
        const response = await post(app)

        expect(response.status).toBe(500)
        // The content type the guard's own 500 is matched against.
        expect(response.headers.get('content-type')).toBe(
          'text/plain; charset=UTF-8',
        )
      } finally {
        error.mockRestore()
      }
    })

    // The reason the guard has to stop at `Error`: Hono's error handler serves
    // anything carrying `getResponse` verbatim, which is how a server emits its
    // own challenge. Swallowing it would turn a documented 401 into a flat 500.
    it('serves an HTTPException from the handler verbatim', async () => {
      const app = buildApp({
        mcpHandler: {
          fetch: async () => {
            throw new HTTPException(401, {
              res: new Response('nope', {
                status: 401,
                headers: {
                  'www-authenticate':
                    'Bearer resource_metadata="https://api.acme.com/.well-known/oauth-protected-resource"',
                },
              }),
            })
          },
        },
      })
      const response = await post(app)

      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe(
        'Bearer resource_metadata="https://api.acme.com/.well-known/oauth-protected-resource"',
      )
      expect(await response.text()).toBe('nope')
    })

    it('never answers a request without a token itself', async () => {
      const mcpHandler = fakeHandler()
      const app = buildApp({ mcpHandler })
      const response = await post(app)
      expect(response.status).toBe(202)
      expect(response.headers.get('www-authenticate')).toBeNull()
    })
  })
})
