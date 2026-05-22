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
// 6. {proxy+} → {any*} translation
// ---------------------------------------------------------------------------

it('6. {proxy+} in path is translated to {any*} for Hapi', () => {
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
  expect(stub.routes[0].path).toBe('/api/{any*}')
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

it('16. string return → 200 with text/plain body', async () => {
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
    expect(res.headers['content-type']).toMatch(/text\/plain/)
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
// 18. onRequest throws → 500 Internal Server Error
// ---------------------------------------------------------------------------

it('18. onRequest throws → response 500 with {"message":"Internal Server Error"}', async () => {
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
    expect(res.statusCode).toBe(500)
    const body = JSON.parse(res.payload)
    expect(body.message).toBe('Internal Server Error')
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
