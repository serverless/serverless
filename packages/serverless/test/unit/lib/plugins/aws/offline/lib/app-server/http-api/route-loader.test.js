import { jest } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { registerHttpApiRoutes } from '../../../../../../../../../lib/plugins/aws/offline/lib/app-server/http-api/route-loader.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal serverless stub.
 *
 * @param {Record<string, object>} [functions]
 * @returns {object}
 */
function makeServerless(functions = {}) {
  return {
    service: { functions },
    serverlessLog: jest.fn(),
  }
}

/**
 * Create a real (not started) Hapi server used for inject() tests.
 *
 * @returns {Promise<import('@hapi/hapi').Server>}
 */
async function makeServer() {
  return Hapi.server({ host: 'localhost', port: 0 })
}

/**
 * A stub server that records route() calls without actually running Hapi.
 */
function makeRouteStub() {
  const routes = []
  return {
    routes,
    route(cfg) {
      routes.push(cfg)
    },
  }
}

// ---------------------------------------------------------------------------
// 1. No httpApi events → no routes registered
// ---------------------------------------------------------------------------

it('1. no httpApi events: empty functions → no routes registered', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({}),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// 2. Single httpApi event (long form) → one route registered
// ---------------------------------------------------------------------------

it('2. single httpApi event (long form) registers one route with uppercase method', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: { method: 'get', path: '/users' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes).toHaveLength(1)
  expect(stub.routes[0].method).toBe('GET')
  expect(stub.routes[0].path).toBe('/users')
})

// ---------------------------------------------------------------------------
// 3. Short string form → method and path parsed correctly
// ---------------------------------------------------------------------------

it('3. short string form "POST /users/{id}" → method POST, path /users/{id}', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'POST /users/{id}' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes).toHaveLength(1)
  expect(stub.routes[0].method).toBe('POST')
  expect(stub.routes[0].path).toBe('/users/{id}')
})

// ---------------------------------------------------------------------------
// 4. method: 'ANY' → Hapi method '*'
// ---------------------------------------------------------------------------

it('4. method: "ANY" maps to Hapi method "*"', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: { method: 'ANY', path: '/catch' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].method).toBe('*')
})

// ---------------------------------------------------------------------------
// 5. method: '*' → Hapi method '*'
// ---------------------------------------------------------------------------

it('5. method: "*" maps to Hapi method "*"', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: { method: '*', path: '/catch' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].method).toBe('*')
})

// ---------------------------------------------------------------------------
// 6. {proxy+} → {proxy*} translation
// ---------------------------------------------------------------------------

it('6. {proxy+} in path is translated to {proxy*} for Hapi', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'GET /api/{proxy+}' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].path).toBe('/api/{proxy*}')
})

// ---------------------------------------------------------------------------
// 7. {id} passes through unchanged
// ---------------------------------------------------------------------------

it('7. {id} placeholder passes through unchanged to Hapi path', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'GET /users/{id}' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].path).toBe('/users/{id}')
})

// ---------------------------------------------------------------------------
// 8. Multiple functions with multiple httpApi events
// ---------------------------------------------------------------------------

it('8. multiple functions with multiple httpApi events all registered', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      fn1: {
        events: [
          { httpApi: { method: 'GET', path: '/a' } },
          { httpApi: { method: 'POST', path: '/b' } },
        ],
      },
      fn2: {
        events: [{ httpApi: 'DELETE /c/{id}' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes).toHaveLength(3)
})

// ---------------------------------------------------------------------------
// 9. Non-httpApi events ignored
// ---------------------------------------------------------------------------

it('9. non-httpApi events (e.g. sqs) are ignored', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [
          { sqs: { arn: 'arn:aws:sqs:us-east-1:000:MyQueue' } },
          { httpApi: { method: 'GET', path: '/users' } },
        ],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes).toHaveLength(1)
  expect(stub.routes[0].method).toBe('GET')
})

// ---------------------------------------------------------------------------
// 10. onRequest is called with (functionKey, event)
// ---------------------------------------------------------------------------

it('10. onRequest is called with (functionKey, event) when a request arrives', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: { method: 'GET', path: '/ping' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    await server.inject({ method: 'GET', url: '/ping' })
    expect(onRequest).toHaveBeenCalledTimes(1)
    const [fnKey, event] = onRequest.mock.calls[0]
    expect(fnKey).toBe('myFn')
    expect(event).toBeDefined()
    expect(event.version).toBe('2.0')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 11. event.routeKey uses the ORIGINAL APIGW path
// ---------------------------------------------------------------------------

it('11. event.routeKey uses the original APIGW path, not the Hapi-translated one', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'GET /users/{id}' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    await server.inject({ method: 'GET', url: '/users/42' })
    const [, event] = onRequest.mock.calls[0]
    // routeKey must reference the APIGW form {id}, not Hapi form {id} (same here)
    expect(event.routeKey).toBe('GET /users/{id}')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

it('11b. event.routeKey for {proxy+} still uses APIGW path "GET /api/{proxy+}"', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'GET /api/{proxy+}' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    await server.inject({ method: 'GET', url: '/api/foo/bar' })
    const [, event] = onRequest.mock.calls[0]
    expect(event.routeKey).toBe('GET /api/{proxy+}')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 12. Lambda response with statusCode, body, headers → correct Hapi response
// ---------------------------------------------------------------------------

it('12. lambda response {statusCode:201, body:"created", headers:{"x-custom":"yes"}} → status 201 with header', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({
    statusCode: 201,
    body: 'created',
    headers: { 'x-custom': 'yes' },
  })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'POST', path: '/items' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'POST', url: '/items' })
    expect(res.statusCode).toBe(201)
    expect(res.result).toBe('created')
    expect(res.headers['x-custom']).toBe('yes')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 13. isBase64Encoded: true → body decoded from base64
// ---------------------------------------------------------------------------

it('13. isBase64Encoded:true → body is decoded from base64 before sending', async () => {
  const server = await makeServer()
  const originalBody = 'hello base64'
  const encoded = Buffer.from(originalBody).toString('base64')
  const onRequest = jest.fn().mockResolvedValue({
    statusCode: 200,
    body: encoded,
    isBase64Encoded: true,
  })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/data' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/data' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe(originalBody)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 14. Lambda response with cookies → Set-Cookie headers
// ---------------------------------------------------------------------------

it('14. lambda response with cookies:["k=v","a=b"] → response has two Set-Cookie headers', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({
    statusCode: 200,
    body: 'ok',
    cookies: ['k=v', 'a=b'],
  })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/cookies' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/cookies' })
    expect(res.statusCode).toBe(200)
    // Hapi may merge Set-Cookie into an array or comma-list; check both formats
    const setCookie = res.headers['set-cookie']
    const cookieList = Array.isArray(setCookie)
      ? setCookie
      : setCookie.split(',').map((s) => s.trim())
    expect(cookieList).toContain('k=v')
    expect(cookieList).toContain('a=b')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 15. Plain JSON return (no statusCode) → 200 application/json
// ---------------------------------------------------------------------------

it('15. plain JSON return (no statusCode) → 200 with application/json body', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ hello: 'world' })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/greet' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/greet' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('{"hello":"world"}')
    expect(res.headers['content-type']).toMatch(/application\/json/)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 16. String return → 200 text/plain
// ---------------------------------------------------------------------------

it('16. string return → 200 with application/json body', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue('hello')

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/str' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/str' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    expect(res.headers['content-type']).toMatch(/application\/json/)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 17. null return → 200 with empty body
// ---------------------------------------------------------------------------

it('17. null return → 200 with empty body', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue(null)

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/null' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/null' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 18. onRequest throws → 502 Internal server error (matches real APIGW)
// ---------------------------------------------------------------------------

it('18. onRequest throws → response 502 with {"message":"Internal server error"}', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockRejectedValue(new Error('boom'))

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/boom' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(502)
    const body = JSON.parse(res.payload)
    expect(body.message).toBe('Internal server error')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 18b. Non-string body in shaped response → 502
// ---------------------------------------------------------------------------

it('18b. shaped response with non-string body → 502 with {"message":"Internal server error"}', async () => {
  const server = await makeServer()
  // Handler returns body as a plain object instead of JSON.stringify(...)
  const onRequest = jest
    .fn()
    .mockResolvedValue({ statusCode: 200, body: { json: 'object' } })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/bad-body' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/bad-body' })
    expect(res.statusCode).toBe(502)
    const body = JSON.parse(res.payload)
    expect(body.message).toBe('Internal server error')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 19. Body 10 MB allowed; body > 10 MB rejected by Hapi with 413
// ---------------------------------------------------------------------------

it('19a. body exactly at 10 MB limit is accepted (statusCode < 400)', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'POST', path: '/upload' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const tenMB = Buffer.alloc(10 * 1024 * 1024, 'x')
    const res = await server.inject({
      method: 'POST',
      url: '/upload',
      payload: tenMB,
      headers: { 'content-type': 'application/octet-stream' },
    })
    expect(res.statusCode).toBeLessThan(400)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

it('19b. body > 10 MB is rejected by Hapi with 413', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'POST', path: '/upload' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const overLimit = Buffer.alloc(10 * 1024 * 1024 + 1, 'x')
    const res = await server.inject({
      method: 'POST',
      url: '/upload',
      payload: overLimit,
      headers: { 'content-type': 'application/octet-stream' },
    })
    expect(res.statusCode).toBe(413)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 20. HEAD long-form: registered as GET in Hapi; routeKey preserves HEAD
// ---------------------------------------------------------------------------

it('20. HEAD long form: Hapi route uses GET; event.routeKey is "HEAD /ping"', async () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: { method: 'HEAD', path: '/ping' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  // Bug A: Hapi route must be GET, not HEAD
  expect(stub.routes[0].method).toBe('GET')

  // Inject a real HEAD request and verify routeKey
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })
  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: { method: 'HEAD', path: '/ping' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })
  await server.start()
  try {
    const res = await server.inject({ method: 'HEAD', url: '/ping' })
    expect(res.statusCode).toBe(200)
    expect(onRequest).toHaveBeenCalledTimes(1)
    const [, event] = onRequest.mock.calls[0]
    expect(event.routeKey).toBe('HEAD /ping')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 21. HEAD short string form: same outcome as long form
// ---------------------------------------------------------------------------

it('21. HEAD short string "HEAD /ping": Hapi uses GET; routeKey is "HEAD /ping"', async () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'HEAD /ping' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].method).toBe('GET')

  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })
  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'HEAD /ping' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })
  await server.start()
  try {
    const res = await server.inject({ method: 'HEAD', url: '/ping' })
    expect(res.statusCode).toBe(200)
    const [, event] = onRequest.mock.calls[0]
    expect(event.routeKey).toBe('HEAD /ping')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 22. Bare '*' short form registers Hapi catch-all
// ---------------------------------------------------------------------------

it('22. bare "*" httpApi: registers Hapi method "*" with path "/{any*}"', async () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: '*' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].method).toBe('*')
  expect(stub.routes[0].path).toBe('/{any*}')

  // Verify both GET and POST requests match on a real server
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' })
  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: '*' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })
  await server.start()
  try {
    const r1 = await server.inject({ method: 'GET', url: '/anything' })
    const r2 = await server.inject({ method: 'POST', url: '/other/path' })
    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(200)
    expect(onRequest).toHaveBeenCalledTimes(2)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 23. Regression: "GET /ping" still produces a GET Hapi route
// ---------------------------------------------------------------------------

it('23. regression: "GET /ping" still produces a Hapi GET route', () => {
  const stub = makeRouteStub()
  registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      myFn: {
        events: [{ httpApi: 'GET /ping' }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(stub.routes[0].method).toBe('GET')
  expect(stub.routes[0].path).toBe('/ping')
})

// ---------------------------------------------------------------------------
// 26. registerHttpApiRoutes returns the list of registered routes
//     so OfflinePlugin can print the boot diagnostics table.
// ---------------------------------------------------------------------------

it('26. returns the list of registered routes for boot diagnostics', () => {
  const stub = makeRouteStub()
  const registered = registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({
      listUsers: {
        events: [{ httpApi: 'GET /users' }],
      },
      getUser: {
        events: [{ httpApi: { method: 'GET', path: '/users/{id}' } }],
      },
      createUser: {
        events: [{ httpApi: { method: 'POST', path: '/users' } }],
      },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })

  expect(registered).toEqual([
    { method: 'GET', path: '/users', functionKey: 'listUsers' },
    { method: 'GET', path: '/users/{id}', functionKey: 'getUser' },
    { method: 'POST', path: '/users', functionKey: 'createUser' },
  ])
})

it('27. returns an empty array when no httpApi events are declared', () => {
  const stub = makeRouteStub()
  const registered = registerHttpApiRoutes({
    server: stub,
    serverless: makeServerless({}),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest: jest.fn(),
  })
  expect(registered).toEqual([])
})

// ---------------------------------------------------------------------------
// 24. multiValueHeaders sends one header line per value
// ---------------------------------------------------------------------------

it('24. response.multiValueHeaders emits one header line per value', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({
    statusCode: 200,
    body: 'ok',
    multiValueHeaders: {
      'x-tag': ['alpha', 'beta', 'gamma'],
    },
  })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/multi' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/multi' })
    expect(res.statusCode).toBe(200)
    const tagHeader = res.headers['x-tag']
    const values = Array.isArray(tagHeader)
      ? tagHeader
      : tagHeader.split(',').map((s) => s.trim())
    expect(values).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']))
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 25. headers + multiValueHeaders are both applied (multi appended after single)
// ---------------------------------------------------------------------------

it('25. headers and multiValueHeaders combine — single value plus appended ones', async () => {
  const server = await makeServer()
  const onRequest = jest.fn().mockResolvedValue({
    statusCode: 200,
    body: 'ok',
    headers: { 'x-trace': 'primary' },
    multiValueHeaders: { 'x-trace': ['secondary', 'tertiary'] },
  })

  registerHttpApiRoutes({
    server,
    serverless: makeServerless({
      myFn: { events: [{ httpApi: { method: 'GET', path: '/trace' } }] },
    }),
    stage: 'dev',
    domainName: 'localhost:3000',
    onRequest,
  })

  await server.start()
  try {
    const res = await server.inject({ method: 'GET', url: '/trace' })
    expect(res.statusCode).toBe(200)
    const trace = res.headers['x-trace']
    const values = Array.isArray(trace)
      ? trace
      : trace.split(',').map((s) => s.trim())
    expect(values).toEqual(
      expect.arrayContaining(['primary', 'secondary', 'tertiary']),
    )
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

describe('registerHttpApiRoutes — provider.httpApi.cors (closes audit #16)', () => {
  it('cors:true registers an OPTIONS route for every httpApi path', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: {
        service: {
          provider: { httpApi: { cors: true } },
          functions: {
            a: { events: [{ httpApi: 'GET /a' }] },
            b: { events: [{ httpApi: { method: 'POST', path: '/b' } }] },
          },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: jest.fn(),
    })
    const options = stub.routes.filter((r) => r.method === 'OPTIONS')
    expect(options.map((r) => r.path).sort()).toEqual(['/a', '/b'])
  })

  it('cors:false does not register any OPTIONS routes', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: {
        service: {
          provider: { httpApi: { cors: false } },
          functions: { a: { events: [{ httpApi: 'GET /a' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: jest.fn(),
    })
    expect(stub.routes.find((r) => r.method === 'OPTIONS')).toBeUndefined()
  })

  it('cors absent does not register any OPTIONS routes', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: {
        service: {
          functions: { a: { events: [{ httpApi: 'GET /a' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: jest.fn(),
    })
    expect(stub.routes.find((r) => r.method === 'OPTIONS')).toBeUndefined()
  })

  it('two routes sharing a path share one OPTIONS handler', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: {
        service: {
          provider: { httpApi: { cors: true } },
          functions: {
            list: { events: [{ httpApi: { method: 'GET', path: '/x' } }] },
            create: {
              events: [{ httpApi: { method: 'POST', path: '/x' } }],
            },
          },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: jest.fn(),
    })
    const options = stub.routes.filter((r) => r.method === 'OPTIONS')
    expect(options).toHaveLength(1)
    expect(options[0].path).toBe('/x')
  })

  it('cors object form is honored (custom origin echoes back)', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: {
        service: {
          provider: {
            httpApi: { cors: { origin: 'https://example.com' } },
          },
          functions: { a: { events: [{ httpApi: 'GET /a' }] } },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: jest.fn(),
    })
    const opts = stub.routes.find((r) => r.method === 'OPTIONS')
    expect(opts).toBeDefined()
    const fakeH = () => {
      const calls = { headers: [] }
      const builder = {
        code: (c) => {
          calls.statusCode = c
          return builder
        },
        header: (n, v) => {
          calls.headers.push({ name: n, value: v })
          return builder
        },
      }
      return {
        calls,
        response: (p) => {
          calls.payload = p
          return builder
        },
      }
    }
    const h = fakeH()
    opts.handler({ headers: { origin: 'https://example.com' } }, h)
    const allowOrigin = h.calls.headers.find(
      (x) => x.name.toLowerCase() === 'access-control-allow-origin',
    )
    expect(allowOrigin?.value).toBe('https://example.com')
  })

  it('cors:true also adds CORS headers to non-OPTIONS responses', async () => {
    const server = await makeServer()
    registerHttpApiRoutes({
      server,
      serverless: {
        service: {
          provider: { httpApi: { cors: true } },
          functions: {
            a: { events: [{ httpApi: 'GET /a' }] },
          },
        },
      },
      stage: 'dev',
      domainName: 'localhost:3000',
      onRequest: async () => ({ statusCode: 200, body: 'ok' }),
    })
    await server.start()
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/a',
        headers: { origin: 'https://example.com' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['access-control-allow-origin']).toBe('*')
    } finally {
      await server.stop({ timeout: 5000 })
    }
  })
})

describe('registerHttpApiRoutes — auth strategy wiring', () => {
  it('sets options.auth to the v2 JWT strategy when route declares JWT authorizer', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: {
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/p',
                authorizer: { name: 'jwt-1' },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      domainName: 'localhost',
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: null,
        authorizerStrategies: new Map(),
        v2AuthorizerStrategies: new Map([['jwt-1', 'jwt:jwt-1']]),
      },
    })
    expect(stub.routes[0].options.auth).toBe('jwt:jwt-1')
  })

  it('sets options.auth to the v2 Lambda strategy when route declares Lambda authorizer', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: {
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/p',
                authorizer: { name: 'authFn' },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      domainName: 'localhost',
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: null,
        authorizerStrategies: new Map(),
        v2AuthorizerStrategies: new Map([
          ['authFn', 'lambda-authorizer:v2:authFn'],
        ]),
      },
    })
    expect(stub.routes[0].options.auth).toBe('lambda-authorizer:v2:authFn')
  })

  it('leaves HTTP API authorizer routes public when noAuth is true', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: {
          events: [
            {
              httpApi: {
                method: 'GET',
                path: '/p',
                authorizer: { name: 'jwt-1' },
              },
            },
          ],
        },
      }),
      stage: 'dev',
      domainName: 'localhost',
      noAuth: true,
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: null,
        authorizerStrategies: new Map(),
        v2AuthorizerStrategies: new Map([['jwt-1', 'jwt:jwt-1']]),
      },
    })
    expect(stub.routes[0].options.auth).toBeUndefined()
  })

  it('leaves options.auth undefined for v2 routes without authorizer', () => {
    const stub = makeRouteStub()
    registerHttpApiRoutes({
      server: stub,
      serverless: makeServerless({
        a: { events: [{ httpApi: { method: 'GET', path: '/p' } }] },
      }),
      stage: 'dev',
      domainName: 'localhost',
      onRequest: jest.fn(),
      authStrategies: {
        privateStrategy: null,
        authorizerStrategies: new Map(),
        v2AuthorizerStrategies: new Map(),
      },
    })
    expect(stub.routes[0].options.auth).toBeUndefined()
  })

  it('falls back gracefully when authStrategies is omitted (back-compat)', () => {
    const stub = makeRouteStub()
    expect(() =>
      registerHttpApiRoutes({
        server: stub,
        serverless: makeServerless({
          a: { events: [{ httpApi: { method: 'GET', path: '/p' } }] },
        }),
        stage: 'dev',
        domainName: 'localhost',
        onRequest: jest.fn(),
      }),
    ).not.toThrow()
    expect(stub.routes[0].options.auth).toBeUndefined()
  })
})
