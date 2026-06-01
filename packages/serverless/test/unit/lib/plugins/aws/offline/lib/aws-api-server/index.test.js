import { jest } from '@jest/globals'
import { createAwsApiServer } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/index.js'

/**
 * Create a minimal logger stub that satisfies the server's expectations.
 *
 * @returns {{ debug: jest.Mock }}
 */
function makeLogger() {
  return { debug: jest.fn() }
}

// ---------------------------------------------------------------------------
// 1. Server boots and stops cleanly
// ---------------------------------------------------------------------------

it('1. server boots and stops cleanly using OS-assigned random port (port 0)', async () => {
  const server = await createAwsApiServer({
    lambdaPort: 0,
    host: 'localhost',
    logger: makeLogger(),
  })

  expect(server).toBeDefined()
  expect(typeof server.stop).toBe('function')
  await server.stop({ timeout: 5000 })
})

// ---------------------------------------------------------------------------
// 2. An unmatched path returns a clean AWS-shaped 404.
// ---------------------------------------------------------------------------

it('2. returns 404 with an AWS-shaped body for an unknown path', async () => {
  const server = await createAwsApiServer({
    lambdaPort: 0,
    host: 'localhost',
    logger: makeLogger(),
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/anything',
      payload: '{}',
    })
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.payload)
    expect(typeof body.message).toBe('string')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 3. When lambdaInvoke is supplied, the specific invocation path is routed by
//    the Lambda Invoke routes (registered before the catch-all), NOT
//    swallowed by the 404.
// ---------------------------------------------------------------------------

it('3. routes Lambda invoke paths to the invoke handler when lambdaInvoke is supplied', async () => {
  const invoke = jest.fn(async () => ({ ok: true }))
  const getLambdaFunction = jest.fn(() => ({ invoke }))

  const server = await createAwsApiServer({
    lambdaPort: 0,
    host: 'localhost',
    logger: makeLogger(),
    lambdaInvoke: {
      getLambdaFunction,
      functionNameMap: new Map([['svc-dev-worker', 'worker']]),
    },
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/2015-03-31/functions/svc-dev-worker/invocations',
      payload: JSON.stringify({ hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
    expect(getLambdaFunction).toHaveBeenCalledWith('worker')
    expect(invoke).toHaveBeenCalledTimes(1)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

it('3b. routes a Lambda invoke path with a trailing slash (the SDK appends one)', async () => {
  const invoke = jest.fn(async () => ({ ok: true }))
  const getLambdaFunction = jest.fn(() => ({ invoke }))

  const server = await createAwsApiServer({
    lambdaPort: 0,
    host: 'localhost',
    logger: makeLogger(),
    lambdaInvoke: {
      getLambdaFunction,
      functionNameMap: new Map([['svc-dev-worker', 'worker']]),
    },
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/2015-03-31/functions/svc-dev-worker/invocations/',
      payload: JSON.stringify({ hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(invoke).toHaveBeenCalledTimes(1)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

it('exposes the bound URL via server.info.uri (the boot summary owns the log line)', async () => {
  const notice = jest.fn()
  const server = await createAwsApiServer({
    lambdaPort: 0,
    host: 'localhost',
    logger: { notice },
  })
  try {
    // The server module no longer logs its own "listening on …" line —
    // the consolidated boot summary printed by OfflinePlugin owns that.
    expect(notice).not.toHaveBeenCalled()
    expect(server.info.uri).toMatch(
      new RegExp(`^http://localhost:${server.info.port}$`),
    )
  } finally {
    await server.stop({ timeout: 5000 })
  }
})
