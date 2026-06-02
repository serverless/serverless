import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { jest } from '@jest/globals'
import { createAppServer } from '../../../../../../../../lib/plugins/aws/offline/lib/app-server/index.js'

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUef7GTPdXk5++2z6RHmrD3a8TjnwwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDUyODE0MDMyNloXDTI2MDUy
OTE0MDMyNlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAm+ogoa150lpEODEnu9LmCZc+CCMg2T3di2tkRkPg0xz5
3Ckq77znGghWTRLYOnHpHSQG19X+WfQZICv3FoQBq2lM20ZuAEhkvLTDg9aLy6NA
1LvxF8iX+E27VXP8q942dfX9HrQg7B/nGm0UwvHjDUbjwIrfMHc95XDvH2vc1TbA
5S8Wa/N2IRTUwrdxG3UW9r4iilVnAwrx/jh+ZWlZa0joMy2XFChzxQNEqrjSxuUW
aZRvDoY8qhDjWS2yEdHd+4ubmVy4NKliX/XZuSDEyeIbIWY5IXGzUORBnJjJwwxs
C0RfqiJR26smVfCcwXVZm8Bl276q2LBMAQRHc5KsIwIDAQABo1MwUTAdBgNVHQ4E
FgQU2gF6BSgOB4uENDUfZ6VYlt6zmQ8wHwYDVR0jBBgwFoAU2gF6BSgOB4uENDUf
Z6VYlt6zmQ8wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAbonP
y5sxkNVIm5Z059qFwVbKmvAe6OKtzL1O1jY/RpT4tAVBLXvGrQfKa5auOmMMWXTr
I9Twoe6LPZLSEz6OCtcmbCMZaSWX3sZyKIHBsn/bFp25NiqabKdIRr8UpQS/UwNO
umE0OXqqUtSerb8IpoaQ1sGAk3Bjb8cHzHTUAbm9ErIvdpdIgerk/39t52YU16hl
g4XyulxiEnratIzpansJ75VJOq5GYKitZUfMdyQWpyckQ29vxK+TMi5yENlcb25H
+bUmpRmgewkpvegKxj96uQwM45YcMo/VzgcTd82iKkADGpNZ1SFART3bGrSckJ1C
w+nvFp1a2OkpP/K9Mg==
-----END CERTIFICATE-----
`

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCb6iChrXnSWkQ4
MSe70uYJlz4IIyDZPd2La2RGQ+DTHPncKSrvvOcaCFZNEtg6cekdJAbX1f5Z9Bkg
K/cWhAGraUzbRm4ASGS8tMOD1ovLo0DUu/EXyJf4TbtVc/yr3jZ19f0etCDsH+ca
bRTC8eMNRuPAit8wdz3lcO8fa9zVNsDlLxZr83YhFNTCt3EbdRb2viKKVWcDCvH+
OH5laVlrSOgzLZcUKHPFA0SquNLG5RZplG8OhjyqEONZLbIR0d37i5uZXLg0qWJf
9dm5IMTJ4hshZjkhcbNQ5EGcmMnDDGwLRF+qIlHbqyZV8JzBdVmbwGXbvqrYsEwB
BEdzkqwjAgMBAAECggEAPTNY3b3XjM9r6da5rwtoyqj4a39GfJ/BH+HmuYIZdSTx
mw750KMI3/oXzicwgziFda/Xk89nCO49EpjPY6IreZpa1dO+iBPinwQhntWPiD6r
yxV+3IQbyxbQCwn9S4VtQT5uviecqLMZJxFcTe1e365M5h5c34xe2npLEr1nMLWx
gt2GPEEmE7Xgf7Y7IYOcQnCLxI65pZxFBedSLPU2aHCu9hwdfwZ6DcfPkyu5MbmF
UOHGe7l4mkaOPQn4sQljxMNCING907kHwPwxURu7KBu+dVSYaJm+KWXfNGNX+0HZ
n/qcHoJvIUpG0zguQFqmbzB6MYMJFKd0w3lp3/zOuQKBgQDK910SgEGD1iUqvc3H
eZDoEPtXu/QwYYZW6iGMqi0tauaIzS7IqpiHMCXQuKRHDvTElMgb9WClyV8WUECb
c9GW2taLmv42K+JUBZFGa61JOZ0I8rUUzduHh7SwBL/BM5YGDr9vOJGjQSt/v5iD
stkw2mt4VpsYlpuf04ilMAhXhwKBgQDEp2x65uULLDJdyRj2ltP0ZxJKvY6UcISh
G3hbmgX5DcIPuDQCrP5Du78eEzm17YzBYe2ZNfyJWzRrAfAqgAG5BSbMV9qBisOo
a7BfTa30WviWvALqTELH1SCOViIXz1eermiJdI4Wm8InpGU9L3DQHp38vGMLo3hI
MlFMDP/1hQKBgBdrV3ftCKI3sW4vHHFp24iLfRTwgQqcFi4tMdXTRQc6kIM0ebN5
y8O9kH927q2sUh3ktPpU4+P9SlV+yRWm1YY8lgjhx3dktObRBaREhGgwl6gSqUZP
Qodu5zBwO9gFJchpJzmkI1ndCTHiX6zClEEI0uG9zIOXzTkx5VB6LFw9AoGBAJw0
hQWmzD6wr50xdIPC0L+s86msokmkiqVSJatVT/NBi2ljHuUVNq7kve2MxeWNuKWP
POTbLiqI6L0q//MyVKv7vJLKIgWODNaGG8XH9SpI7HcHBqXHR7BlyYNmRZR2HRot
XVn53Dd3J6THf6c3PLwD5ehwV5hSE+P9G/h1xwblAoGANMtPZhqMOT2SEf5wzBjD
3X3GUG3+zDp2Gx6+py4PoF3lqntFHsV4hJruq7d+hBskLdMWi/uCXFCCMWSmWM9z
0kOL8uR8YbrtDzlzSLoiyrU0kYxgdLpdacd9n0HFIOaCwy6W69m9TKC4lMywvfIt
/hCYxqzKqGaUfbXcnhgz+TU=
-----END PRIVATE KEY-----
`

/**
 * Build a minimal logger stub that satisfies the app-server's expectations.
 *
 * @returns {{ notice: jest.Mock }}
 */
function makeLogger() {
  return { notice: jest.fn() }
}

let server

afterEach(async () => {
  if (server) {
    await server.stop({ timeout: 5000 })
    server = null
  }
})

// ---------------------------------------------------------------------------
// 1. Server boots on port 0 (OS-assigned port)
// ---------------------------------------------------------------------------

it('1. server boots on OS-assigned port when port is 0', async () => {
  server = await createAppServer({
    port: 0,
    host: 'localhost',
    logger: makeLogger(),
    registerRoutes: async () => {},
  })

  expect(server).toBeDefined()
  expect(typeof server.stop).toBe('function')
  expect(server.info.port).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 2. registerRoutes callback runs before server.start(), verified by
//    injecting a request right after createAppServer resolves
// ---------------------------------------------------------------------------

it('2. routes registered via callback are reachable immediately after createAppServer resolves', async () => {
  const callOrder = []

  server = await createAppServer({
    port: 0,
    host: 'localhost',
    logger: makeLogger(),
    registerRoutes: async (hapiServer) => {
      callOrder.push('registerRoutes')
      hapiServer.route({
        method: 'GET',
        path: '/ping',
        handler: (_request, h) => h.response({ ok: true }).code(200),
      })
    },
  })

  callOrder.push('createAppServer resolved')

  // The route was registered before server.start() — it must be reachable.
  const res = await server.inject({ method: 'GET', url: '/ping' })
  expect(res.statusCode).toBe(200)
  expect(JSON.parse(res.payload)).toEqual({ ok: true })

  // registerRoutes ran before the promise resolved
  expect(callOrder.indexOf('registerRoutes')).toBeLessThan(
    callOrder.indexOf('createAppServer resolved'),
  )
})

// ---------------------------------------------------------------------------
// 3. Uses the provided host
// ---------------------------------------------------------------------------

it('3. server.info.host matches the provided host option', async () => {
  server = await createAppServer({
    port: 0,
    host: '127.0.0.1',
    logger: makeLogger(),
    registerRoutes: async () => {},
  })

  expect(server.info.host).toBe('127.0.0.1')
})

// ---------------------------------------------------------------------------
// 4. Server exposes its bound URL via server.info.uri (the boot summary
//    consumes this; the server module itself does not log on boot).
// ---------------------------------------------------------------------------

it('4. server.info.uri exposes the bound URL so the boot summary can print it', async () => {
  const logger = makeLogger()

  server = await createAppServer({
    port: 0,
    host: 'localhost',
    logger,
    registerRoutes: async () => {},
  })

  // The module no longer logs on boot — the consolidated boot summary owns
  // that responsibility. Just expose the bound URL.
  expect(logger.notice).not.toHaveBeenCalled()
  expect(server.info.uri).toMatch(
    new RegExp(`^http://localhost:${server.info.port}$`),
  )
})

it('5. serves HTTPS when httpsProtocol points at TLS certs', async () => {
  const certDir = await mkdtemp(join(tmpdir(), 'offline-app-tls-'))
  try {
    await writeFile(join(certDir, 'cert.pem'), TEST_CERT)
    await writeFile(join(certDir, 'key.pem'), TEST_KEY)

    server = await createAppServer({
      port: 0,
      host: 'localhost',
      httpsProtocol: certDir,
      logger: makeLogger(),
      registerRoutes: async () => {},
    })

    expect(server.info.uri).toMatch(
      new RegExp(`^https://localhost:${server.info.port}$`),
    )
  } finally {
    await rm(certDir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 7. A trailing slash is insignificant during route matching: a request to
//    GET /items/ matches a route declared at GET /items (and returns 200,
//    not 404), mirroring API Gateway.
// ---------------------------------------------------------------------------

it('7. matches a route declared at /items when the request has a trailing slash', async () => {
  server = await createAppServer({
    port: 0,
    host: 'localhost',
    logger: makeLogger(),
    registerRoutes: async (hapiServer) => {
      hapiServer.route({
        method: 'GET',
        path: '/items',
        handler: (_request, h) => h.response({ ok: true }).code(200),
      })
    },
  })

  const res = await server.inject({ method: 'GET', url: '/items/' })
  expect(res.statusCode).toBe(200)
  expect(JSON.parse(res.payload)).toEqual({ ok: true })
})

// ---------------------------------------------------------------------------
// 6. Throws when registerRoutes is not a function
// ---------------------------------------------------------------------------

it('6. throws when registerRoutes is not a function', async () => {
  await expect(
    createAppServer({
      port: 0,
      host: 'localhost',
      logger: makeLogger(),
      registerRoutes: 'not-a-function',
    }),
  ).rejects.toThrow()
})
