import { jest } from '@jest/globals'
import { createAwsApiServer } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/index.js'

/**
 * Build a SigV4 Authorization header targeting the given service.
 *
 * @param {string} service
 * @returns {string}
 */
function sigV4Header(service) {
  return (
    `AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260522/us-east-1/${service}/aws4_request, ` +
    'SignedHeaders=content-type;host;x-amz-date, ' +
    'Signature=abc123def456'
  )
}

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
    awsApiPort: 0,
    host: 'localhost',
    handlers: {},
    logger: makeLogger(),
  })

  expect(server).toBeDefined()
  expect(typeof server.stop).toBe('function')
  await server.stop({ timeout: 5000 })
})

// ---------------------------------------------------------------------------
// 2. Routes to the correct handler based on Authorization header
// ---------------------------------------------------------------------------

it('2. routes to the right handler based on Authorization header', async () => {
  const sqsHandler = jest.fn((_request, h) =>
    h.response({ service: 'sqs' }).code(200),
  )
  const snsHandler = jest.fn((_request, h) =>
    h.response({ service: 'sns' }).code(200),
  )

  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: { sqs: sqsHandler, sns: snsHandler },
    logger: makeLogger(),
  })

  try {
    const sqsRes = await server.inject({
      method: 'POST',
      url: '/anything',
      headers: { authorization: sigV4Header('sqs') },
      payload: '{}',
    })
    expect(sqsRes.statusCode).toBe(200)
    expect(JSON.parse(sqsRes.payload).service).toBe('sqs')

    const snsRes = await server.inject({
      method: 'POST',
      url: '/anything',
      headers: { authorization: sigV4Header('sns') },
      payload: '{}',
    })
    expect(snsRes.statusCode).toBe(200)
    expect(JSON.parse(snsRes.payload).service).toBe('sns')

    expect(sqsHandler).toHaveBeenCalledTimes(1)
    expect(snsHandler).toHaveBeenCalledTimes(1)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 3. Returns 400 with OFFLINE_UNROUTED_REQUEST for missing / unparseable
//    Authorization header
// ---------------------------------------------------------------------------

it('3. returns 400 OFFLINE_UNROUTED_REQUEST for missing Authorization header', async () => {
  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: {},
    logger: makeLogger(),
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/any',
      payload: '{}',
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.payload)
    expect(body.error.code).toBe('OFFLINE_UNROUTED_REQUEST')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

it('3b. returns 400 OFFLINE_UNROUTED_REQUEST for non-SigV4 Authorization header', async () => {
  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: {},
    logger: makeLogger(),
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/any',
      headers: { authorization: 'Bearer sometoken' },
      payload: '{}',
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.payload)
    expect(body.error.code).toBe('OFFLINE_UNROUTED_REQUEST')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 4. Returns 501 with OFFLINE_UNSUPPORTED_SERVICE for a recognised service
//    that has no handler registered
// ---------------------------------------------------------------------------

it('4. returns 501 OFFLINE_UNSUPPORTED_SERVICE when service is recognised but has no handler', async () => {
  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: {}, // no sqs handler registered
    logger: makeLogger(),
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/any',
      headers: { authorization: sigV4Header('sqs') },
      payload: '{}',
    })
    expect(res.statusCode).toBe(501)
    const body = JSON.parse(res.payload)
    expect(body.error.code).toBe('OFFLINE_UNSUPPORTED_SERVICE')
    expect(body.error.message).toContain('sqs')
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 5. Content-Type: application/x-amz-json-1.0 is accepted and body is parsed
//    (regression guard for the AWS SDK v3 / SQS 415 bug)
// ---------------------------------------------------------------------------

it('5. parses body as JSON when Content-Type is application/x-amz-json-1.0', async () => {
  const sqsHandler = jest.fn((request, h) =>
    h.response({ received: request.payload }).code(200),
  )

  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: { sqs: sqsHandler },
    logger: makeLogger(),
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/anything',
      headers: {
        authorization: sigV4Header('sqs'),
        'content-type': 'application/x-amz-json-1.0',
      },
      payload: JSON.stringify({ Foo: 'bar' }),
    })

    expect(res.statusCode).toBe(200)
    expect(sqsHandler).toHaveBeenCalledTimes(1)
    const [[calledRequest]] = sqsHandler.mock.calls
    expect(calledRequest.payload).toEqual({ Foo: 'bar' })
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

// ---------------------------------------------------------------------------
// 6. Content-Type: text/plain is accepted and body is still parsed as JSON
// ---------------------------------------------------------------------------

it('6. parses body as JSON when Content-Type is text/plain', async () => {
  const sqsHandler = jest.fn((request, h) =>
    h.response({ received: request.payload }).code(200),
  )

  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: { sqs: sqsHandler },
    logger: makeLogger(),
  })

  try {
    const res = await server.inject({
      method: 'POST',
      url: '/anything',
      headers: {
        authorization: sigV4Header('sqs'),
        'content-type': 'text/plain',
      },
      payload: JSON.stringify({ Hello: 'world' }),
    })

    expect(res.statusCode).toBe(200)
    expect(sqsHandler).toHaveBeenCalledTimes(1)
    const [[calledRequest]] = sqsHandler.mock.calls
    expect(calledRequest.payload).toEqual({ Hello: 'world' })
  } finally {
    await server.stop({ timeout: 5000 })
  }
})

it('emits a notice log line with the bound URL after the server starts', async () => {
  const notice = jest.fn()
  const server = await createAwsApiServer({
    awsApiPort: 0,
    host: 'localhost',
    handlers: {},
    logger: { notice },
  })
  try {
    expect(notice).toHaveBeenCalledTimes(1)
    const [line] = notice.mock.calls[0]
    expect(line).toMatch(/^AWS API server listening on http:\/\/localhost:\d+$/)
  } finally {
    await server.stop({ timeout: 5000 })
  }
})
